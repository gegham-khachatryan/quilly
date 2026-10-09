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

/**
 * Where the transcript comes from.
 * - captions: Meet's native captions are turned on and read from the DOM (free, speaker names).
 * - audio: the call audio is tapped in the page and transcribed via an OpenRouter audio model
 *   (no captions needed; speakers are "You" / "Participants").
 */
export type CaptureSource = 'captions' | 'audio';

export interface Settings {
  autoStart: boolean;
  captureSource: CaptureSource;
  /** OpenRouter model used to transcribe audio chunks (must accept audio input). */
  transcriptionModel: string;
  /** Keep Meet rendering captions while the tab is in the background (visibility shim). */
  keepAliveInBackground: boolean;
  /** Capture captions but keep Meet's caption overlay invisible. */
  hideCaptionsOverlay: boolean;
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
  /** Present while capturing from audio: context state and how many tracks are tapped. */
  audio: AudioTapStatus | null;
}

export interface AudioTapStatus {
  state: 'running' | 'suspended' | 'closed';
  local: number;
  remote: number;
}

export type AudioBus = 'local' | 'remote';

/** A chunk of speech captured from the call, ready for transcription. */
export interface AudioChunk {
  sessionId: string;
  bus: AudioBus;
  startedAt: number;
  durationMs: number;
  /** 16-bit mono PCM WAV, base64-encoded. */
  wavBase64: string;
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
  /** Last capture problem worth telling the user about (e.g. transcription failed), or null. */
  issue: string | null;
}

export interface TabRecordingState {
  tabId: number;
  isMeet: boolean;
  meet: MeetState | null;
  session: Session | null;
  /** User stopped recording during this call, so auto-start is paused until the call ends. */
  autoStartSuppressed: boolean;
}
