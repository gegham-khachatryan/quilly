import { useCallback, useEffect, useRef, useState } from 'react';
import { chatRepo, entriesRepo, sessionsRepo } from '../shared/db';
import { onBroadcast, sendToBackground } from '../shared/messages';
import { getSettings, onSettingsChange, updateSettings } from '../shared/settings';
import type { ChatMessage, Session, Settings, TabRecordingState, TranscriptEntry } from '../shared/types';

export function useSettings(): [Settings | null, (patch: Partial<Settings>) => Promise<void>] {
  const [settings, setSettings] = useState<Settings | null>(null);
  useEffect(() => {
    void getSettings().then(setSettings);
    return onSettingsChange(setSettings);
  }, []);
  const update = useCallback(async (patch: Partial<Settings>) => {
    setSettings(await updateSettings(patch));
  }, []);
  return [settings, update];
}

/** The tab the popup / side panel is attached to. */
export function useCurrentTabId(): number | null {
  const [tabId, setTabId] = useState<number | null>(null);
  useEffect(() => {
    const resolve = async () => {
      const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
      setTabId(tab?.id ?? null);
    };
    void resolve();
    const onActivated = () => void resolve();
    chrome.tabs.onActivated.addListener(onActivated);
    return () => chrome.tabs.onActivated.removeListener(onActivated);
  }, []);
  return tabId;
}

export function useTabState(tabId: number | null, pollMs = 1000): [TabRecordingState | null, () => Promise<void>] {
  const [state, setState] = useState<TabRecordingState | null>(null);
  const refresh = useCallback(async () => {
    if (tabId === null) return;
    setState(await sendToBackground({ type: 'tab/getState', tabId }).catch(() => null));
  }, [tabId]);
  useEffect(() => {
    void refresh();
    const timer = window.setInterval(() => void refresh(), pollMs);
    const off = onBroadcast(() => void refresh());
    return () => {
      window.clearInterval(timer);
      off();
    };
  }, [refresh, pollMs]);
  return [state, refresh];
}

export function useSessions(): [Session[] | null, () => Promise<void>] {
  const [sessions, setSessions] = useState<Session[] | null>(null);
  const refresh = useCallback(async () => setSessions(await sessionsRepo.list()), []);
  useEffect(() => {
    void refresh();
    return onBroadcast((m) => {
      if (m.type === 'sessions/changed') void refresh();
    });
  }, [refresh]);
  return [sessions, refresh];
}

export function useSession(sessionId: string | null): [Session | null | undefined, () => Promise<void>] {
  const [session, setSession] = useState<Session | null | undefined>(undefined);
  const refresh = useCallback(async () => {
    if (!sessionId) return setSession(null);
    setSession((await sessionsRepo.get(sessionId)) ?? null);
  }, [sessionId]);
  useEffect(() => {
    void refresh();
    return onBroadcast((m) => {
      if (m.type === 'sessions/changed' && (!m.sessionId || m.sessionId === sessionId)) void refresh();
    });
  }, [refresh, sessionId]);
  return [session, refresh];
}

export function useEntries(sessionId: string | null): TranscriptEntry[] {
  const [entries, setEntries] = useState<TranscriptEntry[]>([]);
  useEffect(() => {
    if (!sessionId) return setEntries([]);
    let cancelled = false;
    const load = async () => {
      const list = await entriesRepo.list(sessionId);
      if (!cancelled) setEntries(list);
    };
    void load();
    const off = onBroadcast((m) => {
      if (m.type === 'entries/changed' && m.sessionId === sessionId) void load();
    });
    return () => {
      cancelled = true;
      off();
    };
  }, [sessionId]);
  return entries;
}

export function useChat(sessionId: string): [ChatMessage[], () => Promise<void>] {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const refresh = useCallback(async () => setMessages(await chatRepo.list(sessionId)), [sessionId]);
  useEffect(() => void refresh(), [refresh]);
  return [messages, refresh];
}

/** Keeps a scrollable element pinned to the bottom unless the user scrolled up. */
export function useStickToBottom<T extends HTMLElement>(dep: unknown) {
  const ref = useRef<T>(null);
  const pinned = useRef(true);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const onScroll = () => {
      pinned.current = el.scrollHeight - el.scrollTop - el.clientHeight < 40;
    };
    el.addEventListener('scroll', onScroll);
    return () => el.removeEventListener('scroll', onScroll);
  }, []);
  useEffect(() => {
    const el = ref.current;
    if (el && pinned.current) el.scrollTop = el.scrollHeight;
  }, [dep]);
  return ref;
}

export function openAppPage(hash = '#/sessions'): void {
  void chrome.tabs.create({ url: `${chrome.runtime.getURL('app.html')}${hash}` });
}
