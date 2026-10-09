import { errorEnvelope, sendFromContent, type BackgroundToContentMessage } from '../shared/messages';
import { getSettings, onSettingsChange } from '../shared/settings';
import type { CaptionUpsert, MeetState, Settings } from '../shared/types';
import { CaptionObserver } from './captionObserver';
import { MeetEventObserver } from './eventObserver';
import { ensureCaptionsOn, getCaptionsStatus, getMeetingCode, getMeetingTitle, isInCall, setCaptionsOverlayHidden, setKeepAlive, turnCaptionsOff } from './meetDom';

const STATE_POLL_MS = 1500;
const CAPTIONS_ENFORCE_MS = 4000;

class MeetController {
  private readonly captions = new CaptionObserver((entry) => this.send(entry));
  private readonly events = new MeetEventObserver((entry) => this.send(entry));
  private lastReported: string | null = null;
  private captionsEnforcer: number | null = null;
  /** True when captions were off before recording started, so we switch them back off at stop. */
  private captionsEnabledByUs = false;
  private settings: Settings | null = null;

  start(): void {
    void getSettings().then((s) => this.applySettings(s));
    onSettingsChange((s) => this.applySettings(s));
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
      captions: getCaptionsStatus(),
    };
  }

  private reportState(): void {
    const state = this.snapshot();
    const key = JSON.stringify(state);
    if (key === this.lastReported) return;
    this.lastReported = key;
    sendFromContent({ type: 'meet/state', state }).catch(() => {
      // Background was unreachable (e.g. extension reloaded); retry on next poll.
      this.lastReported = null;
    });
    if (!state.inCall && this.captions.isRunning) this.stopCapture();
  }

  private send(entry: CaptionUpsert): void {
    sendFromContent({ type: 'caption/upsert', entry }).catch(() => undefined);
  }

  private startCapture(): void {
    if (this.captions.isRunning) return;
    this.captions.start();
    this.events.start();
    ensureCaptionsOn();
    this.captionsEnforcer = window.setInterval(() => ensureCaptionsOn(), CAPTIONS_ENFORCE_MS);
    this.applyCaptureEffects();
    this.lastReported = null;
  }

  private stopCapture(): void {
    this.captions.stop();
    this.events.stop();
    if (this.captionsEnforcer !== null) window.clearInterval(this.captionsEnforcer);
    this.captionsEnforcer = null;
    if (this.captionsEnabledByUs && isInCall()) turnCaptionsOff();
    this.captionsEnabledByUs = false;
    this.applyCaptureEffects();
    this.lastReported = null;
  }

  private applySettings(settings: Settings): void {
    this.settings = settings;
    this.applyCaptureEffects();
  }

  /** Visibility shim and overlay hiding are only active while capturing. */
  private applyCaptureEffects(): void {
    const capturing = this.captions.isRunning;
    setKeepAlive(capturing && (this.settings?.keepAliveInBackground ?? true));
    setCaptionsOverlayHidden(capturing && (this.settings?.hideCaptionsOverlay ?? false));
  }
}

new MeetController().start();
