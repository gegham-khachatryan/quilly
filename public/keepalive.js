// Runs in the page's main world on meet.google.com (see manifest "world": "MAIN").
//
// Google Meet stops rendering live captions when it believes the tab is hidden,
// which pauses capture whenever the user switches tabs. While Meet Hunter is
// recording, the content script sets `data-meet-hunter-keepalive="1"` on <html>;
// only then do we report the document as visible/focused and swallow the
// visibility/blur events Meet uses to go idle. With the flag absent everything
// behaves natively.
(() => {
  const FLAG = 'meetHunterKeepalive';
  const active = () => document.documentElement.dataset[FLAG] === '1';

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

  const swallow = (event) => {
    if (active()) event.stopImmediatePropagation();
  };
  for (const type of ['visibilitychange', 'webkitvisibilitychange']) document.addEventListener(type, swallow, true);
  for (const type of ['blur', 'pagehide', 'freeze']) window.addEventListener(type, swallow, true);
})();
