import { sendToTab } from '../shared/messages';
import type { MeetState } from '../shared/types';

/**
 * Chrome injects manifest content scripts only into pages loaded after the
 * extension was installed or updated. A Meet tab that was already open keeps
 * an orphaned copy of the old script (its chrome.runtime is gone) and no live
 * one, so the background cannot reach it and recordings cannot start until
 * the user reloads the page. This module closes that gap by injecting the
 * scripts on demand.
 */

const MEET_MATCH = 'https://meet.google.com/*';
const MAIN_WORLD_FILES = ['keepalive.js'];
const ISOLATED_FILES = ['content.js'];
/** Do not retry an injection into the same tab more often than this. */
const REPAIR_COOLDOWN_MS = 10_000;

const lastRepair = new Map<number, number>();

/** Ask the content script for its state; null when there is none to answer. */
export async function getMeetState(tabId: number): Promise<MeetState | null> {
  const state = await ping(tabId);
  if (state) return state;
  if (!(await repair(tabId))) return null;
  return ping(tabId);
}

async function ping(tabId: number): Promise<MeetState | null> {
  try {
    return await sendToTab<MeetState>(tabId, { type: 'meet/getState' });
  } catch {
    return null;
  }
}

/**
 * Inject the content scripts into a loaded Meet tab that has none. Returns
 * true when an injection was performed. Tabs still loading are left alone:
 * their manifest scripts have simply not run yet.
 */
async function repair(tabId: number): Promise<boolean> {
  const tab = await chrome.tabs.get(tabId).catch(() => null);
  if (!tab || tab.status !== 'complete' || !tab.url?.startsWith('https://meet.google.com/')) return false;
  const last = lastRepair.get(tabId) ?? 0;
  if (Date.now() - last < REPAIR_COOLDOWN_MS) return false;
  lastRepair.set(tabId, Date.now());
  return inject(tabId);
}

async function inject(tabId: number): Promise<boolean> {
  try {
    // keepalive.js guards against running twice; content.js takes over from any older instance.
    await chrome.scripting.executeScript({ target: { tabId }, world: 'MAIN', files: MAIN_WORLD_FILES });
    await chrome.scripting.executeScript({ target: { tabId }, files: ISOLATED_FILES });
    return true;
  } catch (error) {
    console.warn('[quilly] content script injection failed for tab', tabId, error);
    return false;
  }
}

/** After install or update, bring every open Meet tab under the new extension version. */
export async function injectIntoOpenMeetTabs(): Promise<void> {
  const tabs = await chrome.tabs.query({ url: MEET_MATCH });
  await Promise.all(
    tabs.map(async (tab) => {
      if (tab.id === undefined || tab.status !== 'complete') return;
      if (await ping(tab.id)) return;
      lastRepair.set(tab.id, Date.now());
      await inject(tab.id);
    }),
  );
}

export function forgetTab(tabId: number): void {
  lastRepair.delete(tabId);
}
