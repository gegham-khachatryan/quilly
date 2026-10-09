import type { CaptionUpsert } from '../shared/types';
import { parseMeetEvent, type ParsedMeetEvent } from './meetDom';

const DEDUPE_WINDOW_MS = 1500;

/**
 * Watches the whole page for the transient UI Meet shows on hand raises and
 * emoji reactions and emits each one once as a transcript event. The same
 * event often arrives as both an added node and a later text mutation, so
 * identical events within a short window are collapsed.
 */
export class MeetEventObserver {
  private observer: MutationObserver | null = null;
  private seenElements = new WeakSet<Element>();
  private recent = new Map<string, number>();

  constructor(private readonly emit: (entry: CaptionUpsert) => void) {}

  start(): void {
    if (this.observer) return;
    this.observer = new MutationObserver((records) => this.handle(records));
    this.observer.observe(document.body, { childList: true, subtree: true, characterData: true });
  }

  stop(): void {
    this.observer?.disconnect();
    this.observer = null;
    this.seenElements = new WeakSet();
    this.recent.clear();
  }

  private handle(records: MutationRecord[]): void {
    for (const record of records) {
      if (record.type === 'characterData') this.inspect(record.target);
      for (const node of Array.from(record.addedNodes)) this.inspect(node);
    }
  }

  private inspect(node: Node): void {
    const el = node.nodeType === Node.ELEMENT_NODE ? (node as Element) : node.parentElement;
    if (!el || this.seenElements.has(el)) return;
    const event = parseMeetEvent(el);
    if (!event) return;
    this.seenElements.add(el);
    if (this.isDuplicate(event)) return;
    this.emit({
      localId: `event:${crypto.randomUUID()}`,
      kind: event.kind,
      speaker: event.speaker,
      text: event.text,
      startedAt: Date.now(),
    });
  }

  private isDuplicate(event: ParsedMeetEvent): boolean {
    const now = Date.now();
    const key = `${event.kind}|${event.speaker}|${event.text}`;
    for (const [k, at] of this.recent) if (now - at > DEDUPE_WINDOW_MS) this.recent.delete(k);
    if (this.recent.has(key)) return true;
    this.recent.set(key, now);
    return false;
  }
}
