import type { CaptionUpsert } from '../shared/types';
import { getParticipantName } from './meetDom';

/**
 * Content-script side of public/captions-channel.js, the main-world script
 * that asks Meet's server for captions over the call's captions data channel. The two
 * talk through DOM events on `document`; `detail` is a JSON string because
 * objects do not cross the world boundary.
 */
const REQUEST_EVENT = 'quilly:captions-request';
const PAGE_EVENT = 'quilly:captions-event';

type PageRequest = { action: 'start'; language: string; fallbackLanguage: string } | { action: 'stop' } | { action: 'status' };

type PageEvent =
  | { type: 'status'; version: number; streaming: boolean }
  | { type: 'caption'; stream: number; device: string; utterance: string; version: number; text: string; final: boolean };

interface TrackedUtterance {
  localId: string;
  device: string;
  speaker: string;
  /** What the entry says: the sentences Meet has dropped from its frames, then the latest frame. */
  text: string;
  /** Sentences of this utterance that Meet no longer repeats. */
  settled: string;
  /** Text of the latest frame. */
  window: string;
  version: number;
  startedAt: number;
}

/** Utterances kept for in-place updates and late speaker names; older ones are final by then. */
const MAX_TRACKED = 200;
const NAME_RETRY_MS = 2000;

/**
 * Captions straight from Meet's captions data channel: nothing in Meet's UI
 * is pressed, shown or hidden. Each frame carries the speaker's device id, an
 * utterance id, a version and the utterance's text so far, so an utterance
 * maps to one transcript entry that is re-emitted as its text is revised. The
 * channel is unordered, hence the version check. A frame does not always hold
 * the whole utterance: once a sentence has settled Meet may leave it out, and
 * the closing frame carries only the last sentence ("For real. How are you?"
 * ends as "How are you?"), so earlier sentences are kept here (`settleWindow`).
 *
 * Frames name a device, not a person. Names come from Meet's participant
 * elements (see `getParticipantName`); a speaker whose element is not in the
 * DOM yet gets a numbered placeholder and their entries are re-emitted with
 * the real name once it can be read.
 */
export class ChannelCaptions {
  private running = false;
  /** The page script answered: its hooks are installed in this page. */
  private pagePresent = false;
  private pageStreaming = false;
  private utterances = new Map<string, TrackedUtterance>();
  private names = new Map<string, string>();
  private placeholders = new Map<string, string>();
  private nameRetry: number | null = null;

  constructor(
    private readonly emit: (entry: CaptionUpsert) => void,
    private readonly onStatus: () => void,
  ) {}

  get isRunning(): boolean {
    return this.running;
  }

  /** Captions are arriving on a channel of ours. False until the page script confirms it. */
  get streaming(): boolean {
    return this.running && this.pageStreaming;
  }

  /**
   * Asks the page for captions. `language` is the user's explicit choice or
   * empty; `fallbackLanguage` is used when Meet has not named one either.
   * Returns false when the page script is not there to answer. Calling it
   * again while running only updates the languages.
   */
  start(language: string, fallbackLanguage: string): boolean {
    if (!this.running) {
      this.running = true;
      this.pagePresent = false;
      this.pageStreaming = false;
      document.addEventListener(PAGE_EVENT, this.onPageEvent);
    }
    // Dispatch is synchronous, and so is the page's status reply.
    this.request({ action: 'start', language, fallbackLanguage });
    if (!this.pagePresent) this.detach();
    return this.pagePresent;
  }

  /** Stops listening and tells the page to close its channel. */
  stop(): void {
    if (!this.running) return;
    this.request({ action: 'stop' });
    this.detach();
  }

  /**
   * Stops listening but leaves the page's stream alone, for when another
   * content-script instance has taken the page over and may already be using it.
   */
  detach(): void {
    this.running = false;
    this.pageStreaming = false;
    document.removeEventListener(PAGE_EVENT, this.onPageEvent);
    if (this.nameRetry !== null) window.clearInterval(this.nameRetry);
    this.nameRetry = null;
    this.utterances.clear();
    this.names.clear();
    this.placeholders.clear();
  }

  private request(request: PageRequest): void {
    document.dispatchEvent(new CustomEvent(REQUEST_EVENT, { detail: JSON.stringify(request) }));
  }

  private readonly onPageEvent = (event: Event): void => {
    let message: PageEvent;
    try {
      message = JSON.parse((event as CustomEvent<string>).detail) as PageEvent;
    } catch {
      return;
    }
    if (message.type === 'status') {
      this.pagePresent = true;
      const changed = this.pageStreaming !== message.streaming;
      this.pageStreaming = message.streaming;
      if (changed) this.onStatus();
    } else if (message.type === 'caption') this.onCaption(message);
  };

  private onCaption(caption: Extract<PageEvent, { type: 'caption' }>): void {
    const text = caption.text.replace(/\s+/g, ' ').trim();
    if (!text) return; // an utterance that ended without words
    const key = `${caption.stream}#${caption.device}#${caption.utterance}`;
    let tracked = this.utterances.get(key);
    if (!tracked) {
      tracked = { localId: crypto.randomUUID(), device: caption.device, speaker: '', text: '', settled: '', window: '', version: -1, startedAt: Date.now() };
      this.utterances.set(key, tracked);
      if (this.utterances.size > MAX_TRACKED) {
        const oldest = this.utterances.keys().next().value;
        if (oldest !== undefined) this.utterances.delete(oldest);
      }
    }
    if (caption.version <= tracked.version) return;
    tracked.version = caption.version;
    const speaker = this.speakerFor(caption.device);
    tracked.settled += settleWindow(tracked.window, text);
    tracked.window = text;
    const full = tracked.settled + text;
    if (tracked.text === full && tracked.speaker === speaker) return;
    tracked.text = full;
    tracked.speaker = speaker;
    this.emitUtterance(tracked);
  }

  private emitUtterance(tracked: TrackedUtterance): void {
    this.emit({ localId: tracked.localId, kind: 'caption', speaker: tracked.speaker, text: tracked.text, startedAt: tracked.startedAt });
  }

  private speakerFor(device: string): string {
    const known = this.names.get(device);
    if (known) return known;
    const name = getParticipantName(device);
    if (name) {
      this.names.set(device, name);
      this.placeholders.delete(device);
      return name;
    }
    let placeholder = this.placeholders.get(device);
    if (!placeholder) {
      placeholder = `Speaker ${this.names.size + this.placeholders.size + 1}`;
      this.placeholders.set(device, placeholder);
      console.info('[quilly] no participant element for', device, '- using', placeholder, 'until Meet renders one');
    }
    if (this.nameRetry === null) this.nameRetry = window.setInterval(() => this.resolvePlaceholders(), NAME_RETRY_MS);
    return placeholder;
  }

  /** Gives entries recorded under a placeholder their speaker's name once Meet has rendered it. */
  private resolvePlaceholders(): void {
    for (const device of Array.from(this.placeholders.keys())) {
      const name = getParticipantName(device);
      if (!name) continue;
      this.names.set(device, name);
      this.placeholders.delete(device);
      for (const tracked of this.utterances.values()) {
        if (tracked.device !== device || !tracked.text) continue;
        tracked.speaker = name;
        this.emitUtterance(tracked);
      }
    }
    if (this.placeholders.size === 0 && this.nameRetry !== null) {
      window.clearInterval(this.nameRetry);
      this.nameRetry = null;
    }
  }
}

/** Lowercase without the punctuation Meet adds and revises at the end of interim text. */
function comparable(text: string): string {
  return text.toLowerCase().replace(/[\s.,!?…]+$/u, '');
}

/**
 * The leading sentences of the previous frame's text that the next frame no
 * longer carries, with their trailing space; empty when the next frame still
 * covers the previous one from its start. A sentence counts as left out only
 * when what follows it in the previous frame is where the next frame begins,
 * so an ordinary revision of the text ("speaking." to "I am speaking.") is
 * never mistaken for it.
 */
export function settleWindow(previous: string, next: string): string {
  const from = comparable(next);
  if (!previous || !from || from.startsWith(comparable(previous))) return '';
  const boundary = /[.!?…]+\s+/gu;
  for (let match = boundary.exec(previous); match; match = boundary.exec(previous)) {
    const rest = comparable(previous.slice(boundary.lastIndex));
    if (rest && (from.startsWith(rest) || rest.startsWith(from))) return previous.slice(0, boundary.lastIndex);
  }
  return '';
}
