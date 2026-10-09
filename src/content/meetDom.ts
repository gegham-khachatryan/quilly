/**
 * Everything that touches Google Meet's DOM lives here so selector churn
 * (Meet renames classes often) is isolated to one file. Prefer ARIA
 * attributes and structure over class names.
 */

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

function findCaptionsButton(): HTMLButtonElement | null {
  const buttons = Array.from(document.querySelectorAll<HTMLButtonElement>('button[aria-label]'));
  return buttons.find((b) => /\bcaptions?\b|\bsubtitles?\b/i.test(b.getAttribute('aria-label') ?? '')) ?? null;
}

export type CaptionsStatus = 'on' | 'off' | 'unavailable';

export function getCaptionsStatus(): CaptionsStatus {
  const button = findCaptionsButton();
  if (!button) return 'unavailable';
  const label = button.getAttribute('aria-label') ?? '';
  if (button.getAttribute('aria-pressed') === 'true' || /turn off|disable|hide/i.test(label)) return 'on';
  if (getCaptionsContainer()) return 'on';
  return 'off';
}

/** Clicks the native CC button if captions are off. Returns the resulting status. */
export function ensureCaptionsOn(): CaptionsStatus {
  const status = getCaptionsStatus();
  if (status === 'off') findCaptionsButton()?.click();
  return status;
}

const OVERLAY_STYLE_ID = 'meet-hunter-hide-captions';

/**
 * Visually hides Meet's caption overlay without removing it from layout, so the
 * DOM keeps updating and capture continues. `display: none` would be risky here.
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
  style.textContent = `${CAPTION_CONTAINER_SELECTORS.join(', ')} { opacity: 0 !important; pointer-events: none !important; }`;
  document.documentElement.appendChild(style);
}

/** Flag read by keepalive.js (main world) to decide whether to spoof visibility. */
export function setKeepAlive(enabled: boolean): void {
  if (enabled) document.documentElement.dataset.meetHunterKeepalive = '1';
  else delete document.documentElement.dataset.meetHunterKeepalive;
}

export function getCaptionsContainer(): HTMLElement | null {
  for (const selector of CAPTION_CONTAINER_SELECTORS) {
    const el = document.querySelector<HTMLElement>(selector);
    if (el) return el;
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
