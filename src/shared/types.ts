export type SessionStatus = 'recording' | 'completed';

export interface Session {
  id: string;
  meetingCode: string;
  title: string;
  url: string;
  startedAt: number;
  endedAt: number | null;
  status: SessionStatus;
  /** Distinct speaker names (caption authors), kept in sync as entries arrive. */
  speakers: string[];
  /** Number of caption entries. */
  entryCount: number;
  /** Number of non-caption entries (hand raises, reactions). */
  eventCount: number;
}

/**
 * - caption: spoken text from Meet's captions panel (text grows while the block is live).
 * - hand: `text` is "raised their hand" | "lowered their hand".
 * - reaction: `text` is the emoji.
 */
export type EntryKind = 'caption' | 'hand' | 'reaction';

export interface TranscriptEntry {
  /** `${sessionId}:${localId}` — stable across live updates of the same caption block. */
  id: string;
  sessionId: string;
  seq: number;
  kind: EntryKind;
  speaker: string;
  text: string;
  startedAt: number;
  updatedAt: number;
}

export type ChatRole = 'user' | 'assistant';

export interface ChatMessage {
  id: string;
  sessionId: string;
  role: ChatRole;
  content: string;
  model?: string;
  createdAt: number;
}

export interface Settings {
  autoStart: boolean;
  /** Keep Meet rendering captions while the tab is in the background (visibility shim). */
  keepAliveInBackground: boolean;
  /** Capture captions but keep Meet's caption overlay invisible. */
  hideCaptionsOverlay: boolean;
  openRouterApiKey: string;
  model: string;
}

/** State of Meet's native captions, which are the transcript source. */
export type CaptionsStatus = 'on' | 'off' | 'unavailable';

/** What the content script knows about the Meet tab it lives in. */
export interface MeetState {
  url: string;
  meetingCode: string;
  title: string;
  inCall: boolean;
  capturing: boolean;
  captions: CaptionsStatus;
}

/** An entry observed in the Meet DOM; captions are re-sent as their text grows. */
export interface CaptionUpsert {
  localId: string;
  kind: EntryKind;
  speaker: string;
  text: string;
  startedAt: number;
}

/** A recording in progress, with the tab it is bound to. */
export interface ActiveRecording {
  tabId: number;
  session: Session;
}

export interface TabRecordingState {
  tabId: number;
  isMeet: boolean;
  meet: MeetState | null;
  session: Session | null;
  /** User stopped recording during this call, so auto-start is paused until the call ends. */
  autoStartSuppressed: boolean;
}
