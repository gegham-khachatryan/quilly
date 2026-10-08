import { entriesRepo, sessionsRepo } from '../shared/db';
import { newId } from '../shared/format';
import { broadcast, sendToTab } from '../shared/messages';
import { getSettings } from '../shared/settings';
import type { CaptionUpsert, MeetState, Session } from '../shared/types';

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

export async function getActiveSession(tabId: number): Promise<Session | null> {
  const sessionId = (await readActive())[tabId];
  if (!sessionId) return null;
  return (await sessionsRepo.get(sessionId)) ?? null;
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
  };
  await sessionsRepo.put(session);
  await writeActive({ ...(await readActive()), [tabId]: session.id });
  await sendToTab(tabId, { type: 'capture/start', sessionId: session.id });
  await setBadge(tabId, true);
  broadcast({ type: 'sessions/changed', sessionId: session.id });
  return session;
}

export async function stopRecording(tabId: number): Promise<Session | null> {
  const active = await readActive();
  const sessionId = active[tabId];
  if (!sessionId) return null;

  delete active[tabId];
  await writeActive(active);
  await sendToTab(tabId, { type: 'capture/stop' }).catch(() => undefined);
  await setBadge(tabId, false).catch(() => undefined);
  return finalizeSession(sessionId);
}

async function finalizeSession(sessionId: string): Promise<Session | null> {
  const session = await sessionsRepo.get(sessionId);
  if (!session) return null;
  if (session.status === 'completed') return session;
  const entries = await entriesRepo.list(sessionId);
  const completed: Session = {
    ...session,
    status: 'completed',
    endedAt: entries.at(-1)?.updatedAt ?? Date.now(),
    entryCount: entries.length,
    speakers: Array.from(new Set(entries.map((e) => e.speaker))),
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
      seq: existing?.seq ?? session.entryCount,
      speaker: caption.speaker,
      text: caption.text,
      startedAt: existing?.startedAt ?? caption.startedAt,
      updatedAt: now,
    });

    const speakers = session.speakers.includes(caption.speaker) ? session.speakers : [...session.speakers, caption.speaker];
    if (!existing || speakers !== session.speakers) {
      await sessionsRepo.put({ ...session, entryCount: existing ? session.entryCount : session.entryCount + 1, speakers });
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
    await setBadge(tabId, true);
    return;
  }

  if (state.inCall && (await getSettings()).autoStart) {
    await startRecording(tabId, state).catch((error) => console.warn('[meet-hunter] auto-start failed', error));
  }
}

export async function handleTabClosed(tabId: number): Promise<void> {
  await stopRecording(tabId);
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

async function setBadge(tabId: number, recording: boolean): Promise<void> {
  await chrome.action.setBadgeText({ tabId, text: recording ? 'REC' : '' });
  if (recording) await chrome.action.setBadgeBackgroundColor({ tabId, color: '#ef4444' });
}
