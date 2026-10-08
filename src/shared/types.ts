export type SessionStatus = 'recording' | 'completed';

export interface Session {
  id: string;
  meetingCode: string;
  title: string;
  url: string;
  startedAt: number;
  endedAt: number | null;
  status: SessionStatus;
  /** Distinct speaker names, kept in sync as entries arrive. */
  speakers: string[];
  entryCount: number;
}

export interface TranscriptEntry {
  /** `${sessionId}:${localId}` — stable across live updates of the same caption block. */
  id: string;
  sessionId: string;
  seq: number;
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
  openRouterApiKey: string;
  model: string;
}

/** What the content script knows about the Meet tab it lives in. */
export interface MeetState {
  url: string;
  meetingCode: string;
  title: string;
  inCall: boolean;
  capturing: boolean;
}

/** A caption block as observed in the Meet DOM; re-sent as its text grows. */
export interface CaptionUpsert {
  localId: string;
  speaker: string;
  text: string;
  startedAt: number;
}

export interface TabRecordingState {
  tabId: number;
  isMeet: boolean;
  meet: MeetState | null;
  session: Session | null;
  /** User stopped recording during this call, so auto-start is paused until the call ends. */
  autoStartSuppressed: boolean;
}
