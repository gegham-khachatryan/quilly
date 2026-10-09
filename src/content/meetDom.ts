/**
 * Everything that touches Google Meet's DOM lives here so selector churn
 * (Meet renames classes often) is isolated to one file. Prefer ARIA
 * attributes and structure over class names.
 */

import type { CaptionsStatus } from '../shared/types';

const CAPTION_CONTAINER_SELECTORS = [
  'div[aria-label="Captions"]',
  'div[aria-label="Subtitles"]',
  'div[jsname="dsyhDe"]',
  'div.a4cQT',
];

export function getMeetingCode(url = location.href): string {
  const match = new URL(url).pathname.match(/^\/([a-z]{3}-[a-z]{4}-[a-z]{3})\b/i);
  return match?.[1] ?? new URL(url).pathname.replace(/^\/+/, '') ?? '';
}

export function getMeetingTitle(): string {
  const fromAttr = document.querySelector<HTMLElement>('[data-meeting-title]')?.dataset.meetingTitle?.trim();
  if (fromAttr) return fromAttr;
  const title = document.title.replace(/^Meet\s*[–-]\s*/i, '').trim();
  return title && title.toLowerCase() !== 'meet' ? title : '';
}

export function isInCall(): boolean {
  return Boolean(
    document.querySelector('button[aria-label*="Leave call" i]') ??
      document.querySelector('button[aria-label*="End call" i]') ??
      document.querySelector('[data-call-id]'),
  );
}

/**
 * The toolbar CC toggle. Several buttons mention captions (the toggle, caption
 * settings, language picker); the toggle is the one whose label says "Turn on/off"
 * or that exposes aria-pressed. Menu items and settings entries are skipped.
 */
function findCaptionsButton(): HTMLButtonElement | null {
  const candidates = Array.from(document.querySelectorAll<HTMLButtonElement>('button[aria-label]'))
    .filter((b) => !b.disabled && b.offsetParent !== null)
    .map((b) => ({ b, label: b.getAttribute('aria-label') ?? '' }))
    .filter(({ label }) => /\bcaptions?\b|\bsubtitles?\b/i.test(label) && !/settings|language|translate/i.test(label));
  const score = ({ b, label }: { b: HTMLButtonElement; label: string }) =>
    (/\bturn (on|off)\b/i.test(label) ? 2 : 0) + (b.hasAttribute('aria-pressed') ? 1 : 0);
  return candidates.sort((x, y) => score(y) - score(x))[0]?.b ?? null;
}

export function getCaptionsStatus(): CaptionsStatus {
  const button = findCaptionsButton();
  if (!button) return getCaptionsContainer() ? 'on' : 'unavailable';
  const label = button.getAttribute('aria-label') ?? '';
  if (button.getAttribute('aria-pressed') === 'true' || /turn off|disable|hide/i.test(label)) return 'on';
  if (button.getAttribute('aria-pressed') === 'false' || /turn on|enable|show/i.test(label)) return 'off';
  return getCaptionsContainer() ? 'on' : 'off';
}

/** Clicks the native CC button if captions are off. Returns the status before the click. */
export function ensureCaptionsOn(): CaptionsStatus {
  const status = getCaptionsStatus();
  if (status === 'off') findCaptionsButton()?.click();
  return status;
}

/** Turns captions off again (used to restore the state Quilly found at start). */
export function turnCaptionsOff(): void {
  if (getCaptionsStatus() === 'on') findCaptionsButton()?.click();
}

const OVERLAY_STYLE_ID = 'quilly-hide-captions';
const CAPTIONS_TAG = 'data-quilly-captions';
const WRAPPER_TAG = 'data-quilly-captions-wrap';
const MAX_WRAPPER_DEPTH = 6;

/**
 * Hides Meet's caption region while keeping it alive for capture.
 *
 * The rule only targets elements tagged at runtime by `tagCaptionsContainer`:
 * the exact element the caption observer reads, plus any ancestor whose only
 * visible content is that region (Meet wraps captions in a band that reserves
 * its own height). Everything is collapsed in place with no fixed geometry, so
 * Meet's flex layout gives the space back and stays consistent across window
 * resizes and participant grid changes. `display:none` is avoided so Meet keeps
 * updating and observing the DOM.
 */
export function setCaptionsOverlayHidden(hidden: boolean): void {
  const existing = document.getElementById(OVERLAY_STYLE_ID);
  if (!hidden) {
    existing?.remove();
    return;
  }
  if (existing) return;
  const style = document.createElement('style');
  style.id = OVERLAY_STYLE_ID;
  style.textContent = `[${CAPTIONS_TAG}], [${WRAPPER_TAG}] {
  height: 0 !important;
  min-height: 0 !important;
  max-height: 0 !important;
  flex-basis: 0 !important;
  margin: 0 !important;
  padding-top: 0 !important;
  padding-bottom: 0 !important;
  border: 0 !important;
  overflow: hidden !important;
  opacity: 0 !important;
  pointer-events: none !important;
}`;
  document.documentElement.appendChild(style);
}

/**
 * Marks the live captions container, and the wrappers that exist only to hold
 * it, so the hide rule applies to them and nothing else. Safe to call often.
 */
export function tagCaptionsContainer(container: HTMLElement | null): void {
  const wrappers = new Set<Element>();
  if (container) {
    let el: HTMLElement | null = container.parentElement;
    for (let depth = 0; el && el !== document.body && depth < MAX_WRAPPER_DEPTH; depth++) {
      if (!isPureWrapper(el, depth === 0 ? container : (el.children[0] as HTMLElement))) break;
      wrappers.add(el);
      el = el.parentElement;
    }
  }
  for (const el of Array.from(document.querySelectorAll(`[${CAPTIONS_TAG}], [${WRAPPER_TAG}]`))) {
    if (el !== container && !wrappers.has(el)) {
      el.removeAttribute(CAPTIONS_TAG);
      el.removeAttribute(WRAPPER_TAG);
    }
  }
  container?.setAttribute(CAPTIONS_TAG, '1');
  for (const el of wrappers) el.setAttribute(WRAPPER_TAG, '1');
}

/** An element whose other children render nothing is only there to hold `child`. */
function isPureWrapper(el: HTMLElement, child: HTMLElement): boolean {
  if (!child || child.parentElement !== el) return false;
  for (const sibling of Array.from(el.children)) {
    if (sibling === child) continue;
    const rect = sibling.getBoundingClientRect();
    if (rect.width * rect.height > 0 || (sibling.textContent ?? '').trim()) return false;
  }
  return true;
}

/** One-off console dump of the captions region and its ancestors, for diagnosing layout issues. */
export function describeCaptionsLayout(container: HTMLElement): void {
  const chain: Record<string, unknown>[] = [];
  let el: HTMLElement | null = container;
  for (let depth = 0; el && el !== document.body && depth < 10; depth++) {
    const cs = getComputedStyle(el);
    const rect = el.getBoundingClientRect();
    chain.push({
      depth,
      tag: el.tagName.toLowerCase(),
      jsname: el.getAttribute('jsname'),
      class: el.className,
      quilly: el.hasAttribute(CAPTIONS_TAG) ? 'captions' : el.hasAttribute(WRAPPER_TAG) ? 'wrapper' : '',
      size: `${Math.round(rect.width)}×${Math.round(rect.height)}`,
      display: cs.display,
      position: cs.position,
      inlineStyle: el.getAttribute('style'),
      children: Array.from(el.children).map((c) => {
        const r = c.getBoundingClientRect();
        return `${c.tagName.toLowerCase()}${c.getAttribute('jsname') ? `[${c.getAttribute('jsname')}]` : ''} ${Math.round(r.width)}×${Math.round(r.height)}`;
      }),
    });
    el = el.parentElement;
  }
  console.info('[quilly] captions layout', chain);
}

/** Flag read by keepalive.js (main world) to decide whether to spoof visibility. */
export function setKeepAlive(enabled: boolean): void {
  if (enabled) document.documentElement.dataset.quillyKeepalive = '1';
  else delete document.documentElement.dataset.quillyKeepalive;
}

export function getCaptionsContainer(): HTMLElement | null {
  for (const selector of CAPTION_CONTAINER_SELECTORS) {
    for (const el of Array.from(document.querySelectorAll<HTMLElement>(selector))) {
      // A selector that ever matched a wrapper around the call controls must not be hidden or observed.
      if (el.querySelector('button[aria-label*="Leave call" i], button[aria-label*="End call" i], button[aria-label*="microphone" i]')) continue;
      return el;
    }
  }
  return null;
}

/**
 * Meet renders each caption as a block containing the speaker avatar (img),
 * the speaker name and the growing text. We find blocks structurally: the
 * shallowest level under the container where each child holds exactly one avatar.
 */
export function findCaptionBlocks(container: HTMLElement): HTMLElement[] {
  let level = Array.from(container.children) as HTMLElement[];
  for (let depth = 0; depth < 5; depth++) {
    const withAvatar = level.filter((el) => el.querySelector('img'));
    if (withAvatar.length === 0) return [];
    const single = withAvatar.length === 1 ? withAvatar[0] : undefined;
    if (single && single.querySelectorAll('img').length > 1) {
      level = Array.from(single.children) as HTMLElement[];
      continue;
    }
    return withAvatar;
  }
  return [];
}

export interface ParsedCaption {
  speaker: string;
  text: string;
}

export function parseCaptionBlock(block: HTMLElement): ParsedCaption | null {
  const avatar = block.querySelector('img');
  if (!avatar) return null;

  // The speaker name sits next to the avatar; walk up until we find text.
  let header: HTMLElement | null = avatar.parentElement;
  let speaker = '';
  while (header && header !== block) {
    speaker = header.textContent?.trim() ?? '';
    if (speaker) break;
    header = header.parentElement;
  }
  if (!header || header === block) return null;

  const text = collectText(block, header).replace(/\s+/g, ' ').trim();
  if (!text) return null;
  return { speaker: speaker || 'Unknown', text };
}

function collectText(root: Node, exclude: Node): string {
  if (root === exclude) return '';
  if (root.nodeType === Node.TEXT_NODE) return root.textContent ?? '';
  let out = '';
  for (const child of Array.from(root.childNodes)) out += `${collectText(child, exclude)} `;
  return out;
}

// ---- hand raises & reactions ------------------------------------------------

export type MeetEventKind = 'hand' | 'reaction';

export interface ParsedMeetEvent {
  kind: MeetEventKind;
  speaker: string;
  /** hand: "raised their hand" | "lowered their hand"; reaction: the emoji. */
  text: string;
}

const HAND_RE = /^(.{1,60}?)\s+(raised|lowered)\s+(?:their|his|her|a)\s+hands?\b/i;
const OWN_HAND_RE = /^(?:you\s+(raised|lowered)\s+your\s+hand|your\s+hand\s+is\s+(raised|lowered))\b/i;
const HEADCOUNT_RE = /^\d+\s+(?:people|participants|others)\b/i;
const EMOJI_SEQ = '\\p{Extended_Pictographic}(?:\\uFE0F|\\u200D\\p{Extended_Pictographic}|\\p{Emoji_Modifier})*';
const EMOJI_EDGE_RE = new RegExp(`^(?:(${EMOJI_SEQ})\\s*(.+)|(.+?)\\s*(${EMOJI_SEQ}))$`, 'u');
const NOTO_EMOJI_PATH_RE = /notoemoji\/[^/]+\/([0-9a-f]{2,6}(?:_[0-9a-f]{2,6})*)\//i;
const MAX_EVENT_TEXT = 120;

/**
 * Interprets a DOM node Meet just added or changed as a hand raise or an emoji
 * reaction. Both surface as transient toasts / floating bubbles outside the
 * captions region: "Name raised their hand", or an emoji (text or Noto image)
 * next to the sender's name.
 */
export function parseMeetEvent(node: Node): ParsedMeetEvent | null {
  const el = node.nodeType === Node.ELEMENT_NODE ? (node as Element) : node.parentElement;
  if (!el || el.closest(CAPTION_CONTAINER_SELECTORS.join(','))) return null;
  const text = normalizeText(el.textContent);
  if (!text || text.length > MAX_EVENT_TEXT) return null;
  return parseHandEvent(el, text) ?? parseReaction(el, text);
}

function parseHandEvent(el: Element, text: string): ParsedMeetEvent | null {
  const own = OWN_HAND_RE.exec(text);
  if (own) return { kind: 'hand', speaker: 'You', text: `${(own[1] ?? own[2] ?? 'raised').toLowerCase()} their hand` };
  if (!HAND_RE.test(text)) return null;
  // Descend to the tightest element still containing the phrase, so a wrapping
  // toast region does not prepend unrelated text to the name.
  const match = HAND_RE.exec(normalizeText(tightest(el, (t) => HAND_RE.test(t)).textContent));
  if (!match) return null;
  const speaker = match[1]!.trim();
  if (!speaker || HEADCOUNT_RE.test(speaker)) return null;
  return { kind: 'hand', speaker, text: `${match[2]!.toLowerCase()} their hand` };
}

function parseReaction(el: Element, text: string): ParsedMeetEvent | null {
  const fromImage = emojiFromImage(el);
  if (fromImage) {
    const speaker = text; // the only text next to an emoji image is the sender's label
    return isPlausibleName(speaker) ? { kind: 'reaction', speaker, text: fromImage } : null;
  }
  const edge = EMOJI_EDGE_RE.exec(text);
  if (!edge) return null;
  const emoji = (edge[1] ?? edge[4])!;
  const speaker = (edge[2] ?? edge[3])!.trim();
  return isPlausibleName(speaker) ? { kind: 'reaction', speaker, text: emoji } : null;
}

/** Meet renders reaction emoji as Noto images; the code points are in the URL path. */
function emojiFromImage(el: Element): string | null {
  const images = el.querySelectorAll('img');
  if (images.length !== 1) return null;
  const img = images[0]!;
  const alt = img.getAttribute('alt')?.trim() ?? '';
  if (alt && new RegExp(`^${EMOJI_SEQ}$`, 'u').test(alt)) return alt;
  const codepoints = NOTO_EMOJI_PATH_RE.exec(img.getAttribute('src') ?? '')?.[1];
  if (!codepoints) return null;
  try {
    return String.fromCodePoint(...codepoints.split('_').map((h) => parseInt(h, 16)));
  } catch {
    return null;
  }
}

/** A display name: short, a few words, no digits or sentence punctuation. */
function isPlausibleName(value: string): boolean {
  return value.length > 0 && value.length <= 40 && value.split(/\s+/).length <= 4 && !/[\d.!?,:;@#]/.test(value);
}

function tightest(el: Element, test: (text: string) => boolean): Element {
  let current = el;
  for (let depth = 0; depth < 12; depth++) {
    const next = Array.from(current.children).find((child) => test(normalizeText(child.textContent)));
    if (!next) return current;
    current = next;
  }
  return current;
}

function normalizeText(value: string | null | undefined): string {
  return (value ?? '').replace(/\s+/g, ' ').trim();
}

// ---- captions control intercept ------------------------------------------------

/** True when the event originated on Meet's captions toggle button. */
export function isCaptionsToggleTarget(target: EventTarget | null): boolean {
  if (!(target instanceof Element)) return false;
  const button = target.closest('button');
  return button !== null && button === findCaptionsButton();
}

/** Meet toggles captions with the bare "c" key when focus is not in a text field. */
export function isCaptionsShortcut(event: KeyboardEvent): boolean {
  if (event.key.toLowerCase() !== 'c' || event.ctrlKey || event.metaKey || event.altKey) return false;
  const el = event.target instanceof HTMLElement ? event.target : null;
  return !el || !(el.isContentEditable || /^(input|textarea|select)$/i.test(el.tagName));
}

const TOAST_ID = 'quilly-toast';

/** Small transient notice at the bottom of the Meet window. */
export function showToast(message: string, ms = 2600): void {
  document.getElementById(TOAST_ID)?.remove();
  const toast = document.createElement('div');
  toast.id = TOAST_ID;
  toast.textContent = message;
  toast.setAttribute('role', 'status');
  Object.assign(toast.style, {
    position: 'fixed',
    left: '50%',
    bottom: '112px',
    transform: 'translateX(-50%)',
    zIndex: '2147483647',
    padding: '10px 14px',
    borderRadius: '999px',
    background: 'rgba(23, 26, 34, .94)',
    color: '#e7eaf2',
    font: '500 13px/1.3 system-ui, -apple-system, "Segoe UI", Roboto, sans-serif',
    boxShadow: '0 6px 24px rgba(0,0,0,.35)',
    pointerEvents: 'none',
    transition: 'opacity .25s',
  } satisfies Partial<CSSStyleDeclaration>);
  document.body.appendChild(toast);
  window.setTimeout(() => {
    toast.style.opacity = '0';
    window.setTimeout(() => toast.remove(), 300);
  }, ms);
}
