import type { CaptionUpsert } from '../shared/types';
import { findCaptionBlocks, getCaptionsContainer, parseCaptionBlock, tagCaptionsContainer } from './meetDom';

interface TrackedEntry {
  localId: string;
  speaker: string;
  text: string;
  startedAt: number;
}

const FLUSH_INTERVAL_MS = 250;
const CONTAINER_POLL_MS = 1000;

/**
 * Watches the captions region and emits an upsert each time a caption block
 * appears or its text changes. Block identity is tracked by DOM element, with
 * a prefix heuristic to survive Meet re-rendering a block as a new element.
 */
export class CaptionObserver {
  private observer: MutationObserver | null = null;
  private container: HTMLElement | null = null;
  private containerPoll: number | null = null;
  private flushTimer: number | null = null;
  private lastFlushAt = -Infinity;
  private byElement = new WeakMap<Element, TrackedEntry>();
  private lastEntry: TrackedEntry | null = null;
  private running = false;

  constructor(private readonly emit: (entry: CaptionUpsert) => void) {}

  start(): void {
    if (this.running) return;
    this.running = true;
    this.attachWhenAvailable();
  }

  stop(): void {
    this.running = false;
    this.detach();
    if (this.containerPoll !== null) window.clearInterval(this.containerPoll);
    this.containerPoll = null;
    this.lastEntry = null;
    this.lastFlushAt = -Infinity;
    this.byElement = new WeakMap();
  }

  get isRunning(): boolean {
    return this.running;
  }

  private attachWhenAvailable(): void {
    const tryAttach = () => {
      const container = getCaptionsContainer();
      if (container && container !== this.container) this.attach(container);
      else if (!container && this.container) this.detach();
    };
    tryAttach();
    this.containerPoll = window.setInterval(tryAttach, CONTAINER_POLL_MS);
  }

  private attach(container: HTMLElement): void {
    this.detach();
    this.container = container;
    tagCaptionsContainer(container);
    this.observer = new MutationObserver(() => this.scheduleFlush());
    this.observer.observe(container, { childList: true, subtree: true, characterData: true });
    this.scheduleFlush();
  }

  private detach(): void {
    this.observer?.disconnect();
    this.observer = null;
    this.container = null;
    tagCaptionsContainer(null);
    if (this.flushTimer !== null) window.clearTimeout(this.flushTimer);
    this.flushTimer = null;
  }

  /**
   * Leading + trailing throttle. The leading flush runs synchronously inside the
   * MutationObserver callback, so captures never depend on timers, which Chrome
   * throttles in background tabs. The trailing flush coalesces rapid updates.
   */
  private scheduleFlush(): void {
    const now = performance.now();
    if (now - this.lastFlushAt >= FLUSH_INTERVAL_MS) {
      this.flush();
      return;
    }
    if (this.flushTimer !== null) return;
    this.flushTimer = window.setTimeout(() => {
      this.flushTimer = null;
      this.flush();
    }, FLUSH_INTERVAL_MS - (now - this.lastFlushAt));
  }

  private flush(): void {
    if (!this.container || !this.running) return;
    this.lastFlushAt = performance.now();
    for (const block of findCaptionBlocks(this.container)) {
      const parsed = parseCaptionBlock(block);
      if (!parsed) continue;

      let tracked = this.byElement.get(block);
      if (!tracked) {
        tracked = this.recoverReplacedBlock(parsed) ?? {
          localId: crypto.randomUUID(),
          speaker: parsed.speaker,
          text: '',
          startedAt: Date.now(),
        };
        this.byElement.set(block, tracked);
      }

      if (tracked.text === parsed.text && tracked.speaker === parsed.speaker) continue;
      tracked.text = parsed.text;
      tracked.speaker = parsed.speaker;
      this.lastEntry = tracked;
      this.emit({ localId: tracked.localId, kind: 'caption', speaker: tracked.speaker, text: tracked.text, startedAt: tracked.startedAt });
    }
  }

  /**
   * Meet occasionally swaps the element of the caption currently being spoken.
   * If a brand-new block continues the previous entry (same speaker, text is a
   * prefix-extension or near-identical), keep the previous identity.
   */
  private recoverReplacedBlock(parsed: { speaker: string; text: string }): TrackedEntry | null {
    const last = this.lastEntry;
    if (!last || last.speaker !== parsed.speaker) return null;
    const a = last.text;
    const b = parsed.text;
    const continues = b.startsWith(a) || a.startsWith(b) || sharedPrefixLength(a, b) >= Math.min(a.length, b.length) * 0.8;
    return continues ? last : null;
  }
}

function sharedPrefixLength(a: string, b: string): number {
  const n = Math.min(a.length, b.length);
  let i = 0;
  while (i < n && a[i] === b[i]) i++;
  return i;
}
