import { errorEnvelope, sendFromContent, type BackgroundToContentMessage } from '../shared/messages';
import type { MeetState } from '../shared/types';
import { CaptionObserver } from './captionObserver';
import { ensureCaptionsOn, getMeetingCode, getMeetingTitle, isInCall } from './meetDom';

const STATE_POLL_MS = 1500;
const CAPTIONS_ENFORCE_MS = 4000;

class MeetController {
  private readonly captions = new CaptionObserver((entry) => {
    sendFromContent({ type: 'caption/upsert', entry }).catch(() => undefined);
  });
  private lastReported: string | null = null;
  private captionsEnforcer: number | null = null;

  start(): void {
    chrome.runtime.onMessage.addListener((message: BackgroundToContentMessage, _sender, sendResponse) => {
      try {
        sendResponse(this.handle(message));
      } catch (error) {
        sendResponse(errorEnvelope(error));
      }
      return false;
    });
    window.setInterval(() => this.reportState(), STATE_POLL_MS);
    this.reportState();
  }

  private handle(message: BackgroundToContentMessage): unknown {
    switch (message.type) {
      case 'meet/getState':
        return this.snapshot();
      case 'capture/start':
        this.startCapture();
        return this.snapshot();
      case 'capture/stop':
        this.stopCapture();
        return this.snapshot();
    }
  }

  private snapshot(): MeetState {
    return {
      url: location.href,
      meetingCode: getMeetingCode(),
      title: getMeetingTitle(),
      inCall: isInCall(),
      capturing: this.captions.isRunning,
    };
  }

  private reportState(): void {
    const state = this.snapshot();
    const key = `${state.url}|${state.meetingCode}|${state.title}|${state.inCall}|${state.capturing}`;
    if (key === this.lastReported) return;
    this.lastReported = key;
    sendFromContent({ type: 'meet/state', state }).catch(() => {
      // Background was unreachable (e.g. extension reloaded); retry on next poll.
      this.lastReported = null;
    });
    if (!state.inCall && this.captions.isRunning) this.stopCapture();
  }

  private startCapture(): void {
    if (this.captions.isRunning) return;
    this.captions.start();
    ensureCaptionsOn();
    this.captionsEnforcer = window.setInterval(() => ensureCaptionsOn(), CAPTIONS_ENFORCE_MS);
    this.lastReported = null;
  }

  private stopCapture(): void {
    this.captions.stop();
    if (this.captionsEnforcer !== null) window.clearInterval(this.captionsEnforcer);
    this.captionsEnforcer = null;
    this.lastReported = null;
  }
}

new MeetController().start();
