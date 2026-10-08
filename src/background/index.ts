import { errorEnvelope, type ContentMessage, type UiMessage, type UiResponse } from '../shared/messages';
import type { TabRecordingState } from '../shared/types';
import { flashBadge, getActiveSession, handleCaption, handleMeetState, handleTabClosed, reconcile, startRecording, stopRecording, toggleRecording } from './sessionManager';

const MEET_ORIGIN = 'https://meet.google.com/';

type Inbound = ContentMessage | UiMessage;

chrome.runtime.onInstalled.addListener(() => {
  void chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: false });
});

chrome.runtime.onMessage.addListener((message: Inbound, sender, sendResponse) => {
  handle(message, sender).then(sendResponse, (error) => sendResponse(errorEnvelope(error)));
  return true;
});

chrome.tabs.onRemoved.addListener((tabId) => {
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
      console.warn('[meet-hunter] toggle-recording ignored:', error);
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
      return stopRecording(message.tabId) satisfies Promise<UiResponse['recording/stop']>;
    case 'sidepanel/open':
      await chrome.sidePanel.open({ tabId: message.tabId });
      return;
  }
}

async function getTabState(tabId: number): Promise<TabRecordingState> {
  const tab = await chrome.tabs.get(tabId).catch(() => null);
  const isMeet = Boolean(tab?.url?.startsWith(MEET_ORIGIN));
  const meet = isMeet
    ? await chrome.tabs.sendMessage(tabId, { type: 'meet/getState' }).catch(() => null)
    : null;
  return { tabId, isMeet, meet, session: await getActiveSession(tabId) };
}
