import type { CaptionUpsert, MeetState, Session, TabRecordingState } from './types';

// ---- content -> background -------------------------------------------------
export type ContentMessage =
  | { type: 'meet/state'; state: MeetState }
  | { type: 'caption/upsert'; entry: CaptionUpsert };

// ---- background -> content --------------------------------------------------
export type BackgroundToContentMessage =
  | { type: 'capture/start'; sessionId: string }
  | { type: 'capture/stop' }
  | { type: 'meet/getState' };

// ---- popup / side panel -> background --------------------------------------
export type UiMessage =
  | { type: 'tab/getState'; tabId: number }
  | { type: 'recording/start'; tabId: number }
  | { type: 'recording/stop'; tabId: number }
  | { type: 'sidepanel/open'; tabId: number };

export type UiResponse = {
  'tab/getState': TabRecordingState;
  'recording/start': Session;
  'recording/stop': Session | null;
  'sidepanel/open': void;
};

// ---- background -> everyone (fire and forget) --------------------------------
export type BroadcastMessage =
  | { type: 'sessions/changed'; sessionId?: string }
  | { type: 'entries/changed'; sessionId: string };

export type AnyMessage = ContentMessage | BackgroundToContentMessage | UiMessage | BroadcastMessage;

type ErrorEnvelope = { __error: string };

function isErrorEnvelope(value: unknown): value is ErrorEnvelope {
  return typeof value === 'object' && value !== null && '__error' in value;
}

function unwrap<T>(response: unknown): T {
  if (isErrorEnvelope(response)) throw new Error(response.__error);
  return response as T;
}

export async function sendToBackground<M extends UiMessage>(message: M): Promise<UiResponse[M['type']]> {
  return unwrap(await chrome.runtime.sendMessage(message));
}

export async function sendFromContent(message: ContentMessage): Promise<void> {
  await chrome.runtime.sendMessage(message);
}

export async function sendToTab<T = unknown>(tabId: number, message: BackgroundToContentMessage): Promise<T> {
  return unwrap(await chrome.tabs.sendMessage(tabId, message));
}

export function broadcast(message: BroadcastMessage): void {
  // No listener is a normal condition (e.g. no extension page is open).
  chrome.runtime.sendMessage(message).catch(() => undefined);
}

export function onBroadcast(handler: (message: BroadcastMessage) => void): () => void {
  const listener = (message: unknown) => {
    const m = message as Partial<BroadcastMessage>;
    if (m?.type === 'sessions/changed' || m?.type === 'entries/changed') handler(m as BroadcastMessage);
  };
  chrome.runtime.onMessage.addListener(listener);
  return () => chrome.runtime.onMessage.removeListener(listener);
}

export const errorEnvelope = (error: unknown): ErrorEnvelope => ({
  __error: error instanceof Error ? error.message : String(error),
});
