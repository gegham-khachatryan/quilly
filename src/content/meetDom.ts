/**
 * Everything that touches Google Meet's DOM lives here so selector churn
 * (Meet renames classes often) is isolated to one file. Prefer ARIA
 * attributes and structure over class names.
 */

import { matchCaptionLanguage, type CaptionLanguage, type LanguageOption } from '../shared/captionLanguages';
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
const STAGE_TAG = 'data-quilly-stage';
const STAGE_BOTTOM_VAR = '--quilly-stage-bottom';
const MAX_WRAPPER_DEPTH = 6;
/** How far the band's top edge may sit from where the stage's inline inset ends. */
const BAND_EDGE_TOLERANCE_PX = 24;

/**
 * Hides Meet's caption region while keeping it alive for capture.
 *
 * Meet does not lay the call out with flex. The stage (the `<main>` landmark)
 * is absolutely positioned and Meet writes its inset inline, adding the caption
 * band's height to the bottom whenever captions are on. Collapsing the band
 * therefore frees nothing; the stage has to be told to reclaim the space.
 *
 * The rule only targets elements tagged at runtime by `tagCaptionsContainer`.
 * The band (the observed element plus the wrappers that only hold it) is made
 * invisible in place, with its geometry intact so Meet's own measurements are
 * unaffected and `display:none` is avoided so Meet keeps updating the DOM.
 * The stage's bottom inset is overridden with the value `tagCaptionsContainer`
 * measures: Meet's inset minus the band's height, which is what Meet sets when
 * captions are off.
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
  visibility: hidden !important;
  opacity: 0 !important;
  pointer-events: none !important;
}
[${STAGE_TAG}] {
  bottom: var(${STAGE_BOTTOM_VAR}) !important;
}`;
  document.documentElement.appendChild(style);
}

/**
 * Marks the live captions container, the wrappers that exist only to hold it,
 * and the stage that reserves space for them, so the hide rule applies to
 * those and nothing else. Safe to call often: Meet rewrites the stage's inset
 * and re-renders wrappers, and the measurements follow.
 */
export function tagCaptionsContainer(container: HTMLElement | null): void {
  const wrappers: HTMLElement[] = [];
  if (container) {
    let child: HTMLElement = container;
    let el: HTMLElement | null = container.parentElement;
    for (let depth = 0; el && el !== document.body && depth < MAX_WRAPPER_DEPTH; depth++) {
      if (!isPureWrapper(el, child)) break;
      wrappers.push(el);
      child = el;
      el = el.parentElement;
    }
  }
  for (const el of Array.from(document.querySelectorAll(`[${CAPTIONS_TAG}], [${WRAPPER_TAG}]`))) {
    if (el !== container && !wrappers.includes(el as HTMLElement)) {
      el.removeAttribute(CAPTIONS_TAG);
      el.removeAttribute(WRAPPER_TAG);
    }
  }
  container?.setAttribute(CAPTIONS_TAG, '1');
  for (const el of wrappers) el.setAttribute(WRAPPER_TAG, '1');
  tagStage(container ? [container, ...wrappers] : []);
}

/**
 * Records the bottom inset the stage would have without the caption band and
 * tags the stage so the hide rule can apply it. `band` runs from the observed
 * element outwards. Nothing is tagged unless the band really sits where the
 * stage's inline inset ends, so any other arrangement leaves Meet's geometry alone.
 */
function tagStage(band: HTMLElement[]): void {
  const stage = getStage();
  const bottom = stage && band.length ? reclaimedStageBottom(stage, band) : null;
  for (const el of Array.from(document.querySelectorAll(`[${STAGE_TAG}]`))) {
    if (el !== stage || bottom === null) el.removeAttribute(STAGE_TAG);
  }
  if (!stage || bottom === null) {
    document.documentElement.style.removeProperty(STAGE_BOTTOM_VAR);
    return;
  }
  document.documentElement.style.setProperty(STAGE_BOTTOM_VAR, `${bottom}px`);
  stage.setAttribute(STAGE_TAG, '1');
}

/** The call stage: Meet's `<main>` landmark, absolutely positioned with an inline inset. */
function getStage(): HTMLElement | null {
  const main = document.querySelector<HTMLElement>('main');
  return main && getComputedStyle(main).position === 'absolute' ? main : null;
}

function reclaimedStageBottom(stage: HTMLElement, band: HTMLElement[]): number | null {
  const inlineBottom = parsePx(stage.style.bottom);
  if (inlineBottom === null) return null;
  const containingBlock = stage.offsetParent;
  const containingBottom =
    containingBlock && containingBlock !== document.body ? containingBlock.getBoundingClientRect().bottom : window.innerHeight;
  const stageEdge = containingBottom - inlineBottom;
  // The outermost band element that fits in the reserved space and starts where the stage ends.
  for (const el of [...band].reverse()) {
    const rect = el.getBoundingClientRect();
    if (rect.height <= 0 || rect.height > inlineBottom) continue;
    if (Math.abs(rect.top - stageEdge) > BAND_EDGE_TOLERANCE_PX) continue;
    return Math.round(inlineBottom - rect.height);
  }
  return null;
}

function parsePx(value: string): number | null {
  const match = /^(-?\d+(?:\.\d+)?)px$/.exec(value.trim());
  return match ? Number(match[1]) : null;
}

/** An element whose other children paint nothing is only there to hold `child`. */
function isPureWrapper(el: HTMLElement, child: HTMLElement): boolean {
  if (child.parentElement !== el) return false;
  return Array.from(el.children).every((sibling) => sibling === child || paintsNothing(sibling));
}

/**
 * True when the element contributes no pixels: it is not rendered, is fully
 * transparent or hidden, or neither it nor any descendant has a box with area.
 * Text content is deliberately ignored; Meet keeps hidden templates and
 * announcement regions with text next to the captions, and those must not keep
 * a wrapper from collapsing.
 */
function paintsNothing(el: Element): boolean {
  if (typeof el.checkVisibility === 'function' && !el.checkVisibility({ opacityProperty: true, visibilityProperty: true })) return true;
  if (hasArea(el)) return false;
  for (const descendant of Array.from(el.querySelectorAll('*'))) if (hasArea(descendant)) return false;
  return true;
}

function hasArea(el: Element): boolean {
  const rect = el.getBoundingClientRect();
  return rect.width > 0 && rect.height > 0;
}

/** One-off console dump of the captions region and its ancestors, for diagnosing layout issues. */
export function describeCaptionsLayout(container: HTMLElement): void {
  const chain: Record<string, unknown>[] = [];
  let el: HTMLElement | null = container;
  for (let depth = 0; el && el !== document.body && depth < 10; depth++) {
    const cs = getComputedStyle(el);
    chain.push({
      depth,
      el: describeElement(el),
      size: describeSize(el),
      display: cs.display,
      position: cs.position,
      flex: cs.flex,
      minHeight: cs.minHeight,
      padding: cs.padding,
      inlineStyle: el.getAttribute('style'),
      children: Array.from(el.children).map((c) => `${describeElement(c)} ${describeSize(c)}${paintsNothing(c) ? ' (paints nothing)' : ''}`),
    });
    el = el.parentElement;
  }
  const stage = document.querySelector<HTMLElement>('main');
  console.info('[quilly] captions layout', {
    stage: stage
      ? { el: describeElement(stage), size: describeSize(stage), position: getComputedStyle(stage).position, inlineStyle: stage.getAttribute('style') }
      : null,
    stageBottom: document.documentElement.style.getPropertyValue(STAGE_BOTTOM_VAR) || null,
    chain,
  });
}

function describeElement(el: Element): string {
  const jsname = el.getAttribute('jsname');
  const cls = typeof el.className === 'string' && el.className ? `.${el.className.trim().split(/\s+/).join('.')}` : '';
  const tag = el.hasAttribute(CAPTIONS_TAG) ? ' [captions]' : el.hasAttribute(WRAPPER_TAG) ? ' [wrapper]' : el.hasAttribute(STAGE_TAG) ? ' [stage]' : '';
  return `${el.tagName.toLowerCase()}${jsname ? `[${jsname}]` : ''}${cls}${tag}`;
}

function describeSize(el: Element): string {
  const rect = el.getBoundingClientRect();
  return `${Math.round(rect.width)}×${Math.round(rect.height)}`;
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

// ---- captions button state ------------------------------------------------------

const CC_STYLE_ID = 'quilly-cc-state';
const CC_STATE_ATTR = 'data-quilly-cc';

export type CaptionsButtonState = 'shown' | 'hidden';

/**
 * While recording, Meet's captions button acts as show/hide for the overlay.
 * Mirror that on the button itself so it reads like a native toggle: a brand
 * badge says Quilly is using captions, the button dims when the overlay is
 * hidden, and the tooltip explains. Safe to call often (Meet re-renders it).
 */
export function setCaptionsButtonState(state: CaptionsButtonState | null): void {
  const button = findCaptionsButton();
  if (!state) {
    for (const el of Array.from(document.querySelectorAll(`[${CC_STATE_ATTR}]`))) {
      el.removeAttribute(CC_STATE_ATTR);
      el.removeAttribute('data-quilly-title');
      const original = el.getAttribute('data-quilly-original-title');
      if (original !== null) {
        el.setAttribute('title', original);
        el.removeAttribute('data-quilly-original-title');
      } else el.removeAttribute('title');
    }
    document.getElementById(CC_STYLE_ID)?.remove();
    return;
  }
  if (!button) return;
  if (!document.getElementById(CC_STYLE_ID)) {
    const style = document.createElement('style');
    style.id = CC_STYLE_ID;
    style.textContent = `
button[${CC_STATE_ATTR}] { position: relative !important; }
button[${CC_STATE_ATTR}]::after {
  content: ''; position: absolute; right: 4px; top: 4px; width: 9px; height: 9px; border-radius: 50%;
  background: linear-gradient(135deg, #4249d2, #d428b9); box-shadow: 0 0 0 2px rgba(0, 0, 0, .55); pointer-events: none;
}
button[${CC_STATE_ATTR}="hidden"] { opacity: .55 !important; }`;
    document.documentElement.appendChild(style);
  }
  if (button.getAttribute(CC_STATE_ATTR) !== state) {
    if (!button.hasAttribute('data-quilly-original-title') && button.hasAttribute('title')) {
      button.setAttribute('data-quilly-original-title', button.getAttribute('title') ?? '');
    }
    button.setAttribute(CC_STATE_ATTR, state);
    button.setAttribute(
      'title',
      state === 'hidden' ? 'Captions hidden · Quilly is recording them. Click to show.' : 'Captions shown · Quilly is recording them. Click to hide.',
    );
  }
}

// ---- caption language ------------------------------------------------------------

const STEP_TIMEOUT_MS = 2500;
const STEP_POLL_MS = 60;

/** Polls `probe` until it yields something or the timeout passes. */
async function waitFor<T>(probe: () => T | null | undefined, timeoutMs = STEP_TIMEOUT_MS): Promise<T | null> {
  const deadline = Date.now() + timeoutMs;
  for (;;) {
    const found = probe();
    if (found) return found;
    if (Date.now() >= deadline) return null;
    await new Promise((r) => window.setTimeout(r, STEP_POLL_MS));
  }
}

/** Rendered with a box; `visibility: hidden` (our own overlay hiding) still counts. */
function isRendered(el: Element): boolean {
  return el.getClientRects().length > 0;
}

/** Meet's controls listen to pointer and mouse events, not only `click`. */
function press(el: Element): void {
  const init = { bubbles: true, cancelable: true, composed: true };
  el.dispatchEvent(new PointerEvent('pointerdown', { ...init, pointerId: 1, isPrimary: true }));
  el.dispatchEvent(new MouseEvent('mousedown', init));
  el.dispatchEvent(new PointerEvent('pointerup', { ...init, pointerId: 1, isPrimary: true }));
  el.dispatchEvent(new MouseEvent('mouseup', init));
  (el as HTMLElement).click();
}

function pressEscape(): void {
  const target = document.activeElement ?? document.body;
  for (const type of ['keydown', 'keyup'] as const) {
    target.dispatchEvent(new KeyboardEvent(type, { key: 'Escape', code: 'Escape', keyCode: 27, bubbles: true, cancelable: true }));
  }
}

const text = (el: Element | null | undefined): string => normalizeText(el?.textContent);

function visibleButtons(): HTMLButtonElement[] {
  return Array.from(document.querySelectorAll<HTMLButtonElement>('button[aria-label]')).filter((b) => !b.disabled && isRendered(b));
}

/** The gear Meet shows next to the captions ("Caption settings"); opens the settings dialog on the captions tab. */
function findCaptionSettingsButton(): HTMLButtonElement | null {
  return (
    visibleButtons().find((b) => {
      const label = b.getAttribute('aria-label') ?? '';
      return /\bcaptions?\b|\bsubtitles?\b/i.test(label) && /settings?|preferences/i.test(label);
    }) ?? null
  );
}

/** The toolbar's "More options" (several tiles carry the same label; the toolbar one sits lowest on screen). */
function findMoreOptionsButton(): HTMLButtonElement | null {
  const candidates = visibleButtons().filter((b) => /^more (options|actions)\b/i.test(b.getAttribute('aria-label') ?? ''));
  return candidates.sort((a, b) => b.getBoundingClientRect().top - a.getBoundingClientRect().top)[0] ?? null;
}

function findDialog(): HTMLElement | null {
  return Array.from(document.querySelectorAll<HTMLElement>('[role="dialog"]')).find(isRendered) ?? null;
}

function findCaptionsTab(dialog: HTMLElement): HTMLElement | null {
  const tabs = Array.from(dialog.querySelectorAll<HTMLElement>('[role="tab"]')).filter(isRendered);
  return (
    tabs.find((t) => /\bcaptions?\b|\bsubtitles?\b/i.test(`${t.getAttribute('aria-label') ?? ''} ${text(t)}`)) ??
    tabs.find((t) => /closed_caption/.test(text(t))) ??
    null
  );
}

/**
 * Opens Meet's settings on the captions tab and returns the dialog. The gear
 * by the captions is the short way; the toolbar menu is the fallback.
 */
async function openCaptionSettings(): Promise<HTMLElement> {
  const gear = findCaptionSettingsButton();
  let dialog: HTMLElement | null = null;
  if (gear) {
    press(gear);
    dialog = await waitFor(findDialog);
  }
  if (!dialog) {
    const more = findMoreOptionsButton();
    if (!more) throw new Error('Could not find Meet’s “More options” button.');
    press(more);
    const settingsItem = await waitFor(() => {
      const menu = Array.from(document.querySelectorAll<HTMLElement>('[role="menu"]')).find(isRendered);
      if (!menu) return null;
      const items = Array.from(menu.querySelectorAll<HTMLElement>('[role="menuitem"], [role="menuitemradio"]'));
      return items.find((i) => /\bsettings?\b/i.test(`${i.getAttribute('aria-label') ?? ''} ${text(i)}`)) ?? null;
    });
    if (!settingsItem) {
      pressEscape();
      throw new Error('Could not find “Settings” in Meet’s menu.');
    }
    press(settingsItem);
    dialog = await waitFor(findDialog);
    if (!dialog) throw new Error('Meet’s settings dialog did not open.');
  }
  // The gear lands on the captions tab already; the menu route (and a dialog that remembers another tab) may not.
  const tab = await waitFor(() => findCaptionsTab(dialog), gear ? 600 : STEP_TIMEOUT_MS);
  if (tab) {
    if (tab.getAttribute('aria-selected') !== 'true') press(tab);
  } else if (!gear) {
    closeDialog(dialog);
    throw new Error('Could not find the Captions tab in Meet’s settings.');
  }
  return dialog;
}

function closeDialog(dialog: HTMLElement): void {
  const close = Array.from(dialog.querySelectorAll<HTMLElement>('button[aria-label]')).find(
    (b) => isRendered(b) && /^(close|dismiss)\b/i.test(b.getAttribute('aria-label') ?? ''),
  );
  if (close) press(close);
  else pressEscape();
}

type LanguagePicker = { kind: 'select'; el: HTMLSelectElement } | { kind: 'combobox'; el: HTMLElement };

function accessibleLabel(el: Element): string {
  const own = el.getAttribute('aria-label') ?? '';
  const refs = (el.getAttribute('aria-labelledby') ?? '')
    .split(/\s+/)
    .filter(Boolean)
    .map((id) => text(document.getElementById(id)))
    .join(' ');
  return `${own} ${refs}`.trim();
}

/**
 * The "Language of the meeting" picker. The captions tab may hold a second
 * picker for translated captions; the one labelled as the meeting's language
 * wins, otherwise the first one rendered, which is the meeting language.
 */
function findLanguagePicker(dialog: HTMLElement): LanguagePicker | null {
  const pickers = Array.from(
    dialog.querySelectorAll<HTMLElement>('select, [role="combobox"], [aria-haspopup="listbox"], [role="listbox"][aria-expanded]'),
  ).filter(isRendered);
  const meetingPicker = pickers.find((p) => /meeting|spoken|source/i.test(accessibleLabel(p))) ?? pickers[0];
  if (!meetingPicker) return null;
  return meetingPicker instanceof HTMLSelectElement ? { kind: 'select', el: meetingPicker } : { kind: 'combobox', el: meetingPicker };
}

function findLanguageOptions(scope: ParentNode = document): HTMLElement[] {
  // A popup may render inside its owner or in a portal at the document root.
  const inScope = Array.from(scope.querySelectorAll<HTMLElement>('[role="option"]')).filter(isRendered);
  if (inScope.length > 0 || scope === document) return inScope;
  return findLanguageOptions(document);
}

/**
 * The language chip Meet shows in the captions band (globe icon, current
 * language, opens a list). It is the control whose own text is a caption
 * language and that opens a popup; the one nearest the bottom wins when a
 * page shows several. Only there while the band is rendered.
 */
function findBandLanguagePicker(): HTMLElement | null {
  const locales = pageLocales();
  const candidates = Array.from(document.querySelectorAll<HTMLElement>('button, [role="button"], [role="combobox"]')).filter(
    (el) =>
      isRendered(el) &&
      !el.closest('[role="dialog"], [role="menu"], [role="listbox"]') &&
      (el.hasAttribute('aria-haspopup') || el.hasAttribute('aria-expanded') || /language/i.test(accessibleLabel(el))) &&
      pickerLanguage(el, locales) !== null,
  );
  return candidates.sort((a, b) => b.getBoundingClientRect().top - a.getBoundingClientRect().top)[0] ?? null;
}

/** The language a picker control currently shows, from its value, its text or its label. */
function pickerLanguage(el: HTMLElement, locales: readonly string[]): CaptionLanguage | null {
  return (
    matchCaptionLanguage({ value: el.getAttribute('data-value') ?? el.getAttribute('lang'), text: text(el) }, locales) ??
    matchCaptionLanguage({ text: el.getAttribute('aria-label') ?? '' }, locales)
  );
}

/** The caption language Meet currently shows in the captions band; null when the band's chip is not rendered. */
export function readCaptionsLanguage(): CaptionLanguage | null {
  const picker = findBandLanguagePicker();
  return picker ? pickerLanguage(picker, pageLocales()) : null;
}

/** Picks a language in the band's chip. Returns false when the chip is not there, so the caller can fall back. */
async function selectInBand(wanted: CaptionLanguage, locales: readonly string[]): Promise<CaptionLanguage | false> {
  const picker = findBandLanguagePicker();
  if (!picker) return false;
  const before = findLanguageOptions().length;
  press(picker);
  const options = await waitFor(() => {
    const list = findLanguageOptions();
    return list.length > before ? list : null;
  });
  if (!options) throw new Error('Meet’s caption language list did not open.');
  const option = options.find((o) => matchCaptionLanguage(optionOf(o), locales)?.code === wanted.code);
  if (!option) {
    pressEscape();
    throw new Error(`Meet does not offer “${wanted.name}” for captions here.`);
  }
  press(option);
  // Meet re-renders the chip with the new language once the list closes.
  const applied = await waitFor(() => {
    const shown = readCaptionsLanguage();
    return shown?.code === wanted.code ? shown : null;
  });
  return applied ?? readCaptionsLanguage() ?? wanted;
}

function optionOf(el: HTMLElement): LanguageOption {
  return { value: el.getAttribute('data-value') ?? el.getAttribute('value') ?? el.getAttribute('lang'), text: text(el) };
}

/** UI locales to resolve Meet's localized language names with: the page's, then English. */
function pageLocales(): string[] {
  const lang = document.documentElement.lang?.trim();
  return lang ? [lang, 'en'] : ['en'];
}

/**
 * Switches Meet's caption language and returns the entry Meet shows as
 * selected afterwards. The chip in the captions band is the short way; when
 * it is not rendered, Meet's settings dialog is driven instead. Throws with a
 * readable message when a step cannot be found; whatever was opened is closed.
 */
export async function selectCaptionsLanguage(wanted: CaptionLanguage): Promise<CaptionLanguage> {
  const locales = pageLocales();
  const inBand = await selectInBand(wanted, locales);
  if (inBand) return inBand;
  const dialog = await openCaptionSettings();
  try {
    const picker = await waitFor(() => findLanguagePicker(dialog));
    if (!picker) throw new Error('Could not find the caption language picker in Meet’s settings.');

    if (picker.kind === 'select') {
      const options = Array.from(picker.el.options);
      const option = options.find((o) => matchCaptionLanguage({ value: o.value, text: o.text }, locales)?.code === wanted.code);
      if (!option) throw new Error(`Meet does not offer “${wanted.name}” for captions here.`);
      picker.el.value = option.value;
      picker.el.dispatchEvent(new Event('input', { bubbles: true }));
      picker.el.dispatchEvent(new Event('change', { bubbles: true }));
      return matchCaptionLanguage({ value: option.value, text: option.text }, locales) ?? wanted;
    }

    const before = findLanguageOptions(dialog).length;
    press(picker.el);
    const options = await waitFor(() => {
      const list = findLanguageOptions(dialog);
      return list.length > before ? list : null;
    });
    if (!options) throw new Error('Meet’s caption language list did not open.');
    const option = options.find((o) => matchCaptionLanguage(optionOf(o), locales)?.code === wanted.code);
    if (!option) {
      pressEscape();
      throw new Error(`Meet does not offer “${wanted.name}” for captions here.`);
    }
    press(option);
    // Meet reflects the choice in the picker's text once the list closes.
    const applied = await waitFor(() => {
      if (isRendered(option) && option.isConnected) return null;
      return matchCaptionLanguage({ value: picker.el.getAttribute('data-value'), text: text(picker.el) }, locales) ?? wanted;
    });
    return applied ?? wanted;
  } finally {
    closeDialog(dialog);
  }
}
