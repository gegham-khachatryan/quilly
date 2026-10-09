// Runs in the page's main world on meet.google.com (see manifest "world": "MAIN").
//
// Google Meet stops rendering live captions when its tab is hidden. Two things
// cause that and both are handled here, only while Meet Hunter is recording
// (the content script sets `data-meet-hunter-keepalive="1"` on <html>):
//
// 1. Meet reads the Page Visibility API / focus and goes idle. We report the
//    document as visible and focused and swallow the visibilitychange/blur events.
// 2. Meet's UI framework batches DOM updates in requestAnimationFrame, and the
//    browser never fires animation frames for a hidden tab regardless of what the
//    page believes. While hidden, we serve frames from timers instead. Timers are
//    not throttled for a tab with an active call (audible + WebRTC), so updates
//    keep flowing at close to the usual rate.
//
// With the flag absent everything behaves natively.
(() => {
  const FLAG = 'meetHunterKeepalive';
  const FRAME_MS = 16;
  const active = () => document.documentElement.dataset[FLAG] === '1';

  const nativeHiddenGetter = Object.getOwnPropertyDescriptor(Document.prototype, 'hidden')?.get;
  const reallyHidden = () => (nativeHiddenGetter ? nativeHiddenGetter.call(document) : false);

  // ---- 1. visibility & focus ------------------------------------------------
  const define = (proto, prop, getter) => {
    const original = Object.getOwnPropertyDescriptor(proto, prop);
    if (!original || !original.get) return;
    Object.defineProperty(proto, prop, {
      configurable: true,
      enumerable: original.enumerable,
      get() {
        return active() ? getter() : original.get.call(this);
      },
    });
  };

  define(Document.prototype, 'hidden', () => false);
  define(Document.prototype, 'visibilityState', () => 'visible');

  const originalHasFocus = Document.prototype.hasFocus;
  Document.prototype.hasFocus = function () {
    return active() ? true : originalHasFocus.call(this);
  };

  // ---- 2. animation frames while hidden --------------------------------------
  const nativeRAF = window.requestAnimationFrame.bind(window);
  const nativeCAF = window.cancelAnimationFrame.bind(window);
  const pendingNative = new Map(); // native id -> callback, so frames can be migrated when the tab hides
  const timers = new Map(); // simulated id -> timeout id
  let nextSimulatedId = -1; // negative ids never collide with native ones

  const simulateFrame = (callback) => {
    const id = nextSimulatedId--;
    const timeout = setTimeout(() => {
      timers.delete(id);
      callback(performance.now());
    }, FRAME_MS);
    timers.set(id, timeout);
    return id;
  };

  window.requestAnimationFrame = function (callback) {
    if (active() && reallyHidden()) return simulateFrame(callback);
    const id = nativeRAF((timestamp) => {
      pendingNative.delete(id);
      callback(timestamp);
    });
    pendingNative.set(id, callback);
    return id;
  };

  window.cancelAnimationFrame = function (id) {
    const timeout = timers.get(id);
    if (timeout !== undefined) {
      clearTimeout(timeout);
      timers.delete(id);
      return;
    }
    pendingNative.delete(id);
    nativeCAF(id);
  };

  /** Frames requested natively just before the tab hid would stall until it is shown again. */
  const migratePendingFrames = () => {
    for (const [id, callback] of pendingNative) {
      nativeCAF(id);
      simulateFrame(callback);
    }
    pendingNative.clear();
  };

  // ---- events ----------------------------------------------------------------
  const onVisibilityChange = (event) => {
    if (!active()) return;
    if (reallyHidden()) migratePendingFrames();
    event.stopImmediatePropagation();
  };
  for (const type of ['visibilitychange', 'webkitvisibilitychange']) document.addEventListener(type, onVisibilityChange, true);

  const swallow = (event) => {
    if (active()) event.stopImmediatePropagation();
  };
  for (const type of ['blur', 'pagehide', 'freeze']) window.addEventListener(type, swallow, true);
})();
