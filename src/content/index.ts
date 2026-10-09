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
  setCaptionsButtonState,
  setCaptionsOverlayHidden,
  setKeepAlive,
  showToast,
  turnCaptionsOff,
} from './meetDom';

const STATE_POLL_MS = 1500;
const CAPTIONS_ENFORCE_MS = 4000;
/**
 * Announced on `document` when a controller starts. Chrome leaves the previous
 * content script in place when the extension is reloaded or updated (with a dead
 * chrome.runtime), and the background may inject a fresh copy into an open tab;
 * the earlier instance hears this and disposes itself so exactly one owns the page.
 */
const TAKEOVER_EVENT = 'quilly:takeover';

function runtimeAlive(): boolean {
  try {
    return Boolean(chrome.runtime?.id);
  } catch {
    return false;
  }
}

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
  private readonly instanceId = Math.random().toString(36).slice(2);
  private poll: number | null = null;
  private offSettings: (() => void) | null = null;
  private disposed = false;

  start(): void {
    document.addEventListener(TAKEOVER_EVENT, this.onTakeover);
    document.dispatchEvent(new CustomEvent(TAKEOVER_EVENT, { detail: this.instanceId }));
    void getSettings().then((s) => this.applySettings(s));
    this.offSettings = onSettingsChange((s) => this.applySettings(s));
    chrome.runtime.onMessage.addListener(this.onMessage);
    this.poll = window.setInterval(() => this.reportState(), STATE_POLL_MS);
    this.reportState();
  }

  /**
   * Hand the page over to a newer instance: stop observing and undo every DOM
   * effect, but leave Meet's captions as they are. The new instance resumes the
   * recording (the background re-issues capture/start) and owns the restore.
   */
  private dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    document.removeEventListener(TAKEOVER_EVENT, this.onTakeover);
    if (this.poll !== null) window.clearInterval(this.poll);
    this.poll = null;
    try {
      chrome.runtime.onMessage.removeListener(this.onMessage);
      this.offSettings?.();
    } catch {
      // runtime already gone
    }
    this.offSettings = null;
    this.teardownCapture({ restoreCaptions: false });
  }

  private readonly onTakeover = (event: Event): void => {
    if ((event as CustomEvent<string>).detail === this.instanceId) return;
    this.dispose();
  };

  private readonly onMessage = (message: BackgroundToContentMessage, _sender: unknown, sendResponse: (r: unknown) => void): boolean => {
    try {
      sendResponse(this.handle(message));
    } catch (error) {
      sendResponse(errorEnvelope(error));
    }
    return false;
  };

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
    if (this.disposed) return;
    if (!runtimeAlive()) {
      // Extension reloaded or removed: this copy is orphaned. Clean up the page.
      this.dispose();
      return;
    }
    if (this.captions.isRunning) this.applyCaptureEffects();
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
    this.captionsEnabledByUs = ensureCaptionsOn() === 'off';
    this.sawCaptionsOn = false;
    this.captionsEnforcer = window.setInterval(() => this.enforceCaptions(), CAPTIONS_ENFORCE_MS);
    this.guard.attach();
    this.applyCaptureEffects();
    this.lastReported = null;
  }

  private stopCapture(): void {
    this.teardownCapture({ restoreCaptions: true });
  }

  private teardownCapture({ restoreCaptions }: { restoreCaptions: boolean }): void {
    this.captions.stop();
    this.events.stop();
    if (this.captionsEnforcer !== null) window.clearInterval(this.captionsEnforcer);
    this.captionsEnforcer = null;
    this.guard.detach();
    if (restoreCaptions && this.captionsEnabledByUs && isInCall()) turnCaptionsOff();
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
    this.applyCaptureEffects(); // Meet re-renders the toolbar; keep the button state current
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
    if (this.disposed) return; // a newer instance owns the page's DOM effects now
    this.settings = settings;
    this.applyCaptureEffects();
  }

  /** Visibility shim and overlay hiding are only active while capturing. */
  private applyCaptureEffects(): void {
    const capturing = this.captions.isRunning;
    const settings = this.settings ?? DEFAULT_SETTINGS;
    setKeepAlive(capturing && settings.keepAliveInBackground);
    setCaptionsOverlayHidden(capturing && settings.hideCaptionsOverlay);
    setCaptionsButtonState(capturing ? (settings.hideCaptionsOverlay ? 'hidden' : 'shown') : null);
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
