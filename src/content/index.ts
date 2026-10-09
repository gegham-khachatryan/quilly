import { errorEnvelope, sendFromContent, type BackgroundToContentMessage } from '../shared/messages';
import { DEFAULT_SETTINGS, getSettings, onSettingsChange, updateSettings } from '../shared/settings';
import type { CaptionUpsert, MeetState, Settings } from '../shared/types';
import { CaptionObserver } from './captionObserver';
import { MeetEventObserver } from './eventObserver';
import {
  ensureCaptionsOn,
  getCaptionsStatus,
  getMeetingCode,
  getMeetingTitle,
  isCaptionsShortcut,
  isCaptionsToggleTarget,
  isInCall,
  setCaptionsOverlayHidden,
  setKeepAlive,
  showToast,
  turnCaptionsOff,
} from './meetDom';

const STATE_POLL_MS = 1500;
const CAPTIONS_ENFORCE_MS = 4000;

class MeetController {
  private readonly captions = new CaptionObserver((entry) => this.send(entry));
  private readonly events = new MeetEventObserver((entry) => this.send(entry));
  private lastReported: string | null = null;
  private captionsEnforcer: number | null = null;
  /** True when captions were off before recording started, so we switch them back off at stop. */
  private captionsEnabledByUs = false;
  /** Set once captions were seen on during this capture; after that, "off" means the user turned them off. */
  private sawCaptionsOn = false;
  private readonly guard = new CaptionsControlGuard(() => this.toggleOverlay());
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
    this.guard.detach();
    if (this.captionsEnabledByUs && isInCall()) turnCaptionsOff();
    this.captionsEnabledByUs = false;
    this.applyCaptureEffects();
    this.lastReported = null;
  }

  /**
   * Captions are the transcript source, so they must stay on while recording.
   * If they were switched off through a path we do not intercept (e.g. Meet's
   * settings menu), turn them back on and read the intent as "hide the overlay".
   */
  private enforceCaptions(): void {
    const status = ensureCaptionsOn();
    if (status === 'on') this.sawCaptionsOn = true;
    if (status === 'off' && this.sawCaptionsOn && !(this.settings ?? DEFAULT_SETTINGS).hideCaptionsOverlay) {
      void updateSettings({ hideCaptionsOverlay: true });
      showToast('Captions hidden. Quilly keeps recording them.');
    }
  }

  /** Meet's captions control becomes show/hide while recording. The preference is persisted. */
  private toggleOverlay(): void {
    const hidden = !(this.settings ?? DEFAULT_SETTINGS).hideCaptionsOverlay;
    void updateSettings({ hideCaptionsOverlay: hidden });
    showToast(hidden ? 'Captions hidden. Quilly keeps recording them.' : 'Captions shown.');
  }

  private applySettings(settings: Settings): void {
    this.settings = settings;
    this.applyCaptureEffects();
  }

  /** Visibility shim and overlay hiding are only active while capturing. */
  private applyCaptureEffects(): void {
    const capturing = this.captions.isRunning;
    const settings = this.settings ?? DEFAULT_SETTINGS;
    setKeepAlive(capturing && settings.keepAliveInBackground);
    setCaptionsOverlayHidden(capturing && settings.hideCaptionsOverlay);
  }
}

/**
 * While recording, intercepts the ways a user turns captions off in Meet (the
 * toolbar button and the "c" shortcut) and routes them to the overlay toggle
 * instead, so the transcript source is never cut.
 */
class CaptionsControlGuard {
  private attached = false;

  constructor(private readonly onToggle: () => void) {}

  attach(): void {
    if (this.attached) return;
    this.attached = true;
    for (const type of ['pointerdown', 'mousedown', 'mouseup', 'click'] as const) document.addEventListener(type, this.onPointer, true);
    window.addEventListener('keydown', this.onKey, true);
  }

  detach(): void {
    if (!this.attached) return;
    this.attached = false;
    for (const type of ['pointerdown', 'mousedown', 'mouseup', 'click'] as const) document.removeEventListener(type, this.onPointer, true);
    window.removeEventListener('keydown', this.onKey, true);
  }

  private readonly onPointer = (event: Event): void => {
    if (!isCaptionsToggleTarget(event.target)) return;
    event.preventDefault();
    event.stopImmediatePropagation();
    if (event.type === 'click') this.onToggle();
  };

  private readonly onKey = (event: KeyboardEvent): void => {
    if (!isCaptionsShortcut(event)) return;
    event.preventDefault();
    event.stopImmediatePropagation();
    this.onToggle();
  };
}

new MeetController().start();
