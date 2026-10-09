import { errorEnvelope, type ContentMessage, type UiMessage, type UiResponse } from '../shared/messages';
import type { TabRecordingState } from '../shared/types';
import { forgetTab, getMeetState, injectIntoOpenMeetTabs } from './contentScripts';
import {
  flashBadge,
  focusTab,
  getActiveSession,
  handleCaption,
  handleMeetState,
  handleTabClosed,
  isAutoStartSuppressed,
  listActiveRecordings,
  reconcile,
  startRecording,
  stopRecording,
  toggleRecording,
} from './sessionManager';

const MEET_ORIGIN = 'https://meet.google.com/';

type Inbound = ContentMessage | UiMessage;

// The toolbar icon opens the side panel (there is no popup). Set on every worker
// start so existing installs pick it up after an update, not only on install.
void chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: true });

chrome.runtime.onMessage.addListener((message: Inbound, sender, sendResponse) => {
  handle(message, sender).then(sendResponse, (error) => sendResponse(errorEnvelope(error)));
  return true;
});

// Meet tabs open at install/update time have no live content script until
// one is injected; without this, "Start recording" cannot reach them.
chrome.runtime.onInstalled.addListener(() => {
  void injectIntoOpenMeetTabs();
});

chrome.tabs.onRemoved.addListener((tabId) => {
  forgetTab(tabId);
  void handleTabClosed(tabId);
});

chrome.tabs.onUpdated.addListener((tabId, changeInfo) => {
  if (changeInfo.url && !changeInfo.url.startsWith(MEET_ORIGIN)) void handleTabClosed(tabId);
});

chrome.commands.onCommand.addListener((command, tab) => {
  if (command !== 'toggle-recording') return;
  void (async () => {
    const tabId = tab?.id ?? (await chrome.tabs.query({ active: true, currentWindow: true }))[0]?.id;
    if (tabId === undefined) return;
    try {
      await toggleRecording(tabId);
    } catch (error) {
      console.warn('[quilly] toggle-recording ignored:', error);
      await flashBadge(tabId, '!');
    }
  })();
});

void reconcile();

async function handle(message: Inbound, sender: chrome.runtime.MessageSender): Promise<unknown> {
  switch (message.type) {
    case 'meet/state': {
      const tabId = sender.tab?.id;
      if (tabId !== undefined) await handleMeetState(tabId, message.state);
      return;
    }
    case 'caption/upsert': {
      const tabId = sender.tab?.id;
      if (tabId !== undefined) await handleCaption(tabId, message.entry);
      return;
    }
    case 'tab/getState':
      return getTabState(message.tabId) satisfies Promise<UiResponse['tab/getState']>;
    case 'recording/start':
      return startRecording(message.tabId) satisfies Promise<UiResponse['recording/start']>;
    case 'recording/stop':
      return stopRecording(message.tabId, true) satisfies Promise<UiResponse['recording/stop']>;
    case 'recording/active':
      return listActiveRecordings() satisfies Promise<UiResponse['recording/active']>;
    case 'tab/focus':
      await focusTab(message.tabId);
      return;
  }
}

async function getTabState(tabId: number): Promise<TabRecordingState> {
  const tab = await chrome.tabs.get(tabId).catch(() => null);
  const isMeet = Boolean(tab?.url?.startsWith(MEET_ORIGIN));
  const pageLoading = isMeet && tab?.status !== 'complete';
  const meet = isMeet ? await getMeetState(tabId) : null;
  return {
    tabId,
    isMeet,
    pageLoading,
    meet,
    session: await getActiveSession(tabId),
    autoStartSuppressed: await isAutoStartSuppressed(tabId),
  };
}
