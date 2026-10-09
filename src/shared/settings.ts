import type { Settings } from './types';

const KEY = 'settings';

export const DEFAULT_SETTINGS: Settings = {
  autoStart: true,
  keepAliveInBackground: true,
  hideCaptionsOverlay: true,
  openRouterApiKey: '',
  model: 'anthropic/claude-sonnet-4.5',
};

export async function getSettings(): Promise<Settings> {
  const stored = await chrome.storage.local.get(KEY);
  return { ...DEFAULT_SETTINGS, ...(stored[KEY] as Partial<Settings> | undefined) };
}

export async function updateSettings(patch: Partial<Settings>): Promise<Settings> {
  const next = { ...(await getSettings()), ...patch };
  await chrome.storage.local.set({ [KEY]: next });
  return next;
}

export function onSettingsChange(handler: (settings: Settings) => void): () => void {
  const listener = (changes: Record<string, chrome.storage.StorageChange>, area: string) => {
    if (area !== 'local' || !(KEY in changes)) return;
    handler({ ...DEFAULT_SETTINGS, ...(changes[KEY]?.newValue as Partial<Settings> | undefined) });
  };
  chrome.storage.onChanged.addListener(listener);
  return () => chrome.storage.onChanged.removeListener(listener);
}
