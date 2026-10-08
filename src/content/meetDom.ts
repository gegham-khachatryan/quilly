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
