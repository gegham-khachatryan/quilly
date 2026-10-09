import { entriesRepo, sessionsRepo } from '../shared/db';
import { newId } from '../shared/format';
import { broadcast, sendToTab } from '../shared/messages';
import { getSettings } from '../shared/settings';
import type { ActiveRecording, CaptionUpsert, MeetState, Session } from '../shared/types';

/**
 * Active recordings keyed by tab id, persisted in chrome.storage.session so
 * state survives the MV3 service worker being suspended between events.
 */
const ACTIVE_KEY = 'activeSessions';
type ActiveMap = Record<string, string>; // tabId -> sessionId

async function readActive(): Promise<ActiveMap> {
  return ((await chrome.storage.session.get(ACTIVE_KEY))[ACTIVE_KEY] as ActiveMap | undefined) ?? {};
}

async function writeActive(map: ActiveMap): Promise<void> {
  await chrome.storage.session.set({ [ACTIVE_KEY]: map });
}

/**
 * Tabs where the user stopped recording by hand while still in the call.
 * Auto-start must not re-arm until that call ends (tab leaves the call or closes).
 */
const SUPPRESSED_KEY = 'autoStartSuppressed';
type SuppressedMap = Record<string, true>;

async function readSuppressed(): Promise<SuppressedMap> {
  return ((await chrome.storage.session.get(SUPPRESSED_KEY))[SUPPRESSED_KEY] as SuppressedMap | undefined) ?? {};
}

async function setSuppressed(tabId: number, suppressed: boolean): Promise<void> {
  const map = await readSuppressed();
  if (suppressed) map[tabId] = true;
  else delete map[tabId];
  await chrome.storage.session.set({ [SUPPRESSED_KEY]: map });
}

export async function isAutoStartSuppressed(tabId: number): Promise<boolean> {
  return Boolean((await readSuppressed())[tabId]);
}

export async function getActiveSession(tabId: number): Promise<Session | null> {
  const sessionId = (await readActive())[tabId];
  if (!sessionId) return null;
  return (await sessionsRepo.get(sessionId)) ?? null;
}

/** Every recording in progress, regardless of which tab or window is focused. */
export async function listActiveRecordings(): Promise<ActiveRecording[]> {
  const active = await readActive();
  const sessions = await Promise.all(Object.values(active).map((id) => sessionsRepo.get(id)));
  return Object.keys(active)
    .map((tabId, i) => ({ tabId: Number(tabId), session: sessions[i] }))
    .filter((r): r is ActiveRecording => r.session !== undefined)
    .sort((a, b) => b.session.startedAt - a.session.startedAt);
}

/** Bring a Meet tab (and its window) to the front. */
export async function focusTab(tabId: number): Promise<void> {
  const tab = await chrome.tabs.update(tabId, { active: true });
  if (tab?.windowId !== undefined) await chrome.windows.update(tab.windowId, { focused: true });
}

async function queryMeetState(tabId: number): Promise<MeetState | null> {
  try {
    return await sendToTab<MeetState>(tabId, { type: 'meet/getState' });
  } catch {
    return null;
  }
}

export async function startRecording(tabId: number, known?: MeetState): Promise<Session> {
  const existing = await getActiveSession(tabId);
  if (existing) {
    await sendToTab(tabId, { type: 'capture/start', sessionId: existing.id }).catch(() => undefined);
    return existing;
  }

  const meet = known ?? (await queryMeetState(tabId));
  if (!meet) throw new Error('This tab is not a Google Meet call (content script unavailable).');
  if (!meet.inCall) throw new Error('Join the meeting first, then start recording.');
  if (!known) await setSuppressed(tabId, false); // explicit user start re-arms auto-start

  const session: Session = {
    id: newId(),
    meetingCode: meet.meetingCode,
    title: meet.title || meet.meetingCode,
    url: meet.url,
    startedAt: Date.now(),
    endedAt: null,
    status: 'recording',
    speakers: [],
    entryCount: 0,
    eventCount: 0,
  };
  await sessionsRepo.put(session);
  await writeActive({ ...(await readActive()), [tabId]: session.id });
  await sendToTab(tabId, { type: 'capture/start', sessionId: session.id });
  await setRecordingIndicator(tabId, true);
  broadcast({ type: 'sessions/changed', sessionId: session.id });
  return session;
}

/**
 * @param manual true when the user stopped it (side panel, shortcut):
 * auto-start then stays off for the remainder of this call.
 */
export async function stopRecording(tabId: number, manual = false): Promise<Session | null> {
  const active = await readActive();
  const sessionId = active[tabId];
  if (!sessionId) return null;

  delete active[tabId];
  await writeActive(active);
  if (manual) await setSuppressed(tabId, true);
  await sendToTab(tabId, { type: 'capture/stop' }).catch(() => undefined);
  await setRecordingIndicator(tabId, false).catch(() => undefined);
  return finalizeSession(sessionId);
}

async function finalizeSession(sessionId: string): Promise<Session | null> {
  const session = await sessionsRepo.get(sessionId);
  if (!session) return null;
  if (session.status === 'completed') return session;
  const entries = await entriesRepo.list(sessionId);
  const captions = entries.filter((e) => e.kind === 'caption');
  const completed: Session = {
    ...session,
    status: 'completed',
    endedAt: entries.at(-1)?.updatedAt ?? Date.now(),
    entryCount: captions.length,
    eventCount: entries.length - captions.length,
    speakers: Array.from(new Set(captions.map((e) => e.speaker))),
  };
  await sessionsRepo.put(completed);
  broadcast({ type: 'sessions/changed', sessionId });
  return completed;
}

// Serialize writes per session so concurrent caption messages cannot race on `seq`.
const writeQueues = new Map<string, Promise<void>>();

function enqueue(sessionId: string, task: () => Promise<void>): Promise<void> {
  const next = (writeQueues.get(sessionId) ?? Promise.resolve()).then(task, task);
  writeQueues.set(sessionId, next);
  return next;
}

export async function handleCaption(tabId: number, caption: CaptionUpsert): Promise<void> {
  const sessionId = (await readActive())[tabId];
  if (!sessionId || !caption.text.trim()) return;

  await enqueue(sessionId, async () => {
    const session = await sessionsRepo.get(sessionId);
    if (!session || session.status !== 'recording') return;

    const id = `${sessionId}:${caption.localId}`;
    const existing = await entriesRepo.get(id);
    const now = Date.now();
    await entriesRepo.put({
      id,
      sessionId,
      seq: existing?.seq ?? session.entryCount + session.eventCount,
      kind: caption.kind,
      speaker: caption.speaker,
      text: caption.text,
      startedAt: existing?.startedAt ?? caption.startedAt,
      updatedAt: now,
    });

    // Only people who spoke count as speakers; reacting or raising a hand does not.
    const isCaption = caption.kind === 'caption';
    const speakers = !isCaption || session.speakers.includes(caption.speaker) ? session.speakers : [...session.speakers, caption.speaker];
    if (!existing || speakers !== session.speakers) {
      await sessionsRepo.put({
        ...session,
        entryCount: session.entryCount + (!existing && isCaption ? 1 : 0),
        eventCount: session.eventCount + (!existing && !isCaption ? 1 : 0),
        speakers,
      });
    }
  });
  broadcast({ type: 'entries/changed', sessionId });
}

export async function handleMeetState(tabId: number, state: MeetState): Promise<void> {
  const active = await getActiveSession(tabId);

  if (active) {
    if (!state.inCall) {
      await stopRecording(tabId);
      return;
    }
    if (!state.capturing) await sendToTab(tabId, { type: 'capture/start', sessionId: active.id }).catch(() => undefined);
    if (state.title && state.title !== active.title && active.title === active.meetingCode) {
      await sessionsRepo.put({ ...active, title: state.title });
      broadcast({ type: 'sessions/changed', sessionId: active.id });
    }
    await setRecordingIndicator(tabId, true);
    return;
  }

  if (!state.inCall) {
    // Call ended (or page reloaded): the next call in this tab may auto-start again.
    await setSuppressed(tabId, false);
    return;
  }

  if ((await getSettings()).autoStart && !(await isAutoStartSuppressed(tabId))) {
    await startRecording(tabId, state).catch((error) => console.warn('[meet-hunter] auto-start failed', error));
  }
}

/** Keyboard shortcut / command entry point: stop if recording, otherwise start. */
export async function toggleRecording(tabId: number): Promise<Session | null> {
  if (await getActiveSession(tabId)) return stopRecording(tabId, true);
  return startRecording(tabId);
}

/** Brief toolbar feedback when a command cannot act on this tab (not a Meet call). */
export async function flashBadge(tabId: number, text: string, ms = 1500): Promise<void> {
  await chrome.action.setBadgeBackgroundColor({ tabId, color: '#f59e0b' });
  await chrome.action.setBadgeText({ tabId, text });
  await new Promise((r) => setTimeout(r, ms));
  if (!(await getActiveSession(tabId))) await chrome.action.setBadgeText({ tabId, text: '' });
}

export async function handleTabClosed(tabId: number): Promise<void> {
  await stopRecording(tabId);
  await setSuppressed(tabId, false);
}

/** Called on service worker start: close sessions whose tabs are gone (crash, restart). */
export async function reconcile(): Promise<void> {
  const active = await readActive();
  const liveTabs = new Set((await chrome.tabs.query({})).map((t) => t.id));
  for (const [tabId, sessionId] of Object.entries(active)) {
    if (!liveTabs.has(Number(tabId))) {
      delete active[tabId];
      await finalizeSession(sessionId);
    }
  }
  await writeActive(active);

  const activeIds = new Set(Object.values(active));
  for (const session of await sessionsRepo.listRecording()) {
    if (!activeIds.has(session.id)) await finalizeSession(session.id);
  }
}

const ICON_SIZES = [16, 32, 48, 128] as const;
const iconPaths = (prefix: 'icon' | 'rec') => Object.fromEntries(ICON_SIZES.map((s) => [s, `icons/${prefix}${s}.png`]));

/** Toolbar shows the brand logo normally and the red record dot while this tab is recording. */
async function setRecordingIndicator(tabId: number, recording: boolean): Promise<void> {
  await Promise.all([
    chrome.action.setIcon({ tabId, path: iconPaths(recording ? 'rec' : 'icon') }),
    chrome.action.setBadgeText({ tabId, text: '' }), // the icon alone signals recording; also clears any flashBadge leftovers
  ]);
}
