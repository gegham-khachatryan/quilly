import { errorEnvelope, sendFromContent, type BackgroundToContentMessage } from '../shared/messages';
import { getSettings, onSettingsChange } from '../shared/settings';
import type { AudioChunk, CaptionUpsert, CaptureSource, MeetState, Settings } from '../shared/types';
import { AudioTapBridge } from './audioBridge';
import { CaptionObserver } from './captionObserver';
import { MeetEventObserver } from './eventObserver';
import { ensureCaptionsOn, getMeetingCode, getMeetingTitle, isInCall, setCaptionsOverlayHidden, setKeepAlive } from './meetDom';

const STATE_POLL_MS = 1500;
const CAPTIONS_ENFORCE_MS = 4000;

class MeetController {
  private readonly captions = new CaptionObserver((entry) => this.sendEntry(entry));
  private readonly events = new MeetEventObserver((entry) => this.sendEntry(entry));
  private readonly audio = new AudioTapBridge(
    (chunk) => this.sendChunk(chunk),
    () => this.reportState(),
  );
  private sessionId: string | null = null;
  private source: CaptureSource | null = null;
  private lastReported: string | null = null;
  private captionsEnforcer: number | null = null;
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
        this.startCapture(message.sessionId);
        return this.snapshot();
      case 'capture/stop':
        this.stopCapture();
        return this.snapshot();
    }
  }

  private get capturing(): boolean {
    return this.sessionId !== null;
  }

  private snapshot(): MeetState {
    return {
      url: location.href,
      meetingCode: getMeetingCode(),
      title: getMeetingTitle(),
      inCall: isInCall(),
      capturing: this.capturing,
      audio: this.source === 'audio' ? this.audio.status : null,
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
    if (!state.inCall && this.capturing) this.stopCapture();
  }

  private sendEntry(entry: CaptionUpsert): void {
    sendFromContent({ type: 'caption/upsert', entry }).catch(() => undefined);
  }

  private sendChunk(chunk: AudioChunk): void {
    sendFromContent({ type: 'audio/chunk', chunk }).catch(() => undefined);
  }

  private startCapture(sessionId: string): void {
    if (this.capturing) return;
    this.sessionId = sessionId;
    this.source = this.settings?.captureSource ?? 'captions';
    this.events.start();
    if (this.source === 'audio') {
      this.audio.start(sessionId);
    } else {
      this.captions.start();
      ensureCaptionsOn();
      this.captionsEnforcer = window.setInterval(() => ensureCaptionsOn(), CAPTIONS_ENFORCE_MS);
    }
    this.applyCaptureEffects();
    this.reportState();
  }

  private stopCapture(): void {
    if (!this.capturing) return;
    this.sessionId = null;
    this.events.stop();
    this.captions.stop();
    if (this.audio.isRunning) this.audio.stop();
    if (this.captionsEnforcer !== null) window.clearInterval(this.captionsEnforcer);
    this.captionsEnforcer = null;
    this.source = null;
    this.applyCaptureEffects();
    this.reportState();
  }

  private applySettings(settings: Settings): void {
    this.settings = settings;
    // Switching the transcript source mid-recording restarts the pipeline on the same session.
    if (this.capturing && this.source !== settings.captureSource) {
      const sessionId = this.sessionId!;
      this.stopCapture();
      this.startCapture(sessionId);
      return;
    }
    this.applyCaptureEffects();
  }

  /** Visibility shim and overlay hiding only matter while reading captions from the DOM. */
  private applyCaptureEffects(): void {
    const captionsLive = this.capturing && this.source === 'captions';
    setKeepAlive(captionsLive && (this.settings?.keepAliveInBackground ?? true));
    setCaptionsOverlayHidden(captionsLive && (this.settings?.hideCaptionsOverlay ?? false));
  }
}

new MeetController().start();
