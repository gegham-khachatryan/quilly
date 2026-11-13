// Runs in the page's main world on meet.google.com at document_start (see
// manifest "world": "MAIN"), so the hooks exist before Meet sets up its call.
//
// Meet's client gets captions from the server over a WebRTC data channel, not
// from the DOM. The channel is `captions_v2`, pre-negotiated with the call and
// open whether captions are on or off. To turn captions on the client sends a
// small request on it naming the language; the server acknowledges and then
// sends caption frames on the same channel, which the client acknowledges one
// by one. Sending that request from here makes the server stream captions
// while Meet's own captions stay exactly as the user left them: no CC button
// press, no caption band, no layout change. (Verified in a live call on
// 2026-11-13. The earlier `captions` + `media-session` protocol no longer
// delivers anything.)
//
// This file only speaks that protocol. It is inert until the content script
// asks for captions, and everything it learns leaves through DOM events:
//
//   content -> page   `quilly:captions-request`  {action: 'start', language, fallbackLanguage} | {action: 'stop'} | {action: 'status'}
//   page -> content   `quilly:captions-event`    {type: 'status', version, streaming}
//                                                {type: 'caption', stream, device, utterance, version, text, final}
//
// `detail` is always a JSON string: objects do not cross the world boundary.
// The content script side lives in src/content/channelCaptions.ts.
(() => {
  // Installed once per page; the background re-injects main-world files into
  // tabs that were open before Quilly was installed or updated.
  if (window.__quillyCaptionsChannel) return;
  window.__quillyCaptionsChannel = true;
  if (typeof RTCPeerConnection !== 'function' || typeof RTCDataChannel !== 'function') return;

  const REQUEST_EVENT = 'quilly:captions-request';
  const PAGE_EVENT = 'quilly:captions-event';
  const PROTOCOL_VERSION = 2;

  const CAPTIONS_LABEL = 'captions_v2';
  const DEFAULT_LANGUAGE = 'en-US';
  /**
   * Meet numbers its own requests 1, 2, 3… per call. Ours come from a range it
   * will not reach, so the two never collide and our acknowledgements can be
   * told apart (and kept away from Meet's client, which did not ask).
   */
  const OWN_REQUEST_ID_BASE = 1_000_000;
  /** Meet may send a setup request right after the channel opens; ours goes out once it has been quiet this long. */
  const SETTLE_MS = 1500;
  /** Let Meet's own captions-off take effect before asking the server again. */
  const REASSERT_MS = 300;
  const ACK_TIMEOUT_MS = 3000;
  /** Unacknowledged requests in a row before giving up, so the content script can fall back. */
  const MAX_FAILURES = 3;

  // ---- protobuf wire format, schema-less --------------------------------------
  const encoder = new TextEncoder();
  const decoder = new TextDecoder('utf-8', { fatal: true });

  function readVarint(bytes, i) {
    let result = 0n;
    let shift = 0n;
    for (;;) {
      if (i >= bytes.length) throw new Error('varint past end');
      const b = bytes[i++];
      result |= BigInt(b & 0x7f) << shift;
      if (!(b & 0x80)) return [result, i];
      shift += 7n;
      if (shift > 63n) throw new Error('varint too long');
    }
  }

  /** -> [{ field, wire, value }]; value is a bigint for varints, bytes otherwise. Throws on malformed input. */
  function decode(bytes) {
    const fields = [];
    let i = 0;
    while (i < bytes.length) {
      let tag;
      [tag, i] = readVarint(bytes, i);
      const field = Number(tag >> 3n);
      const wire = Number(tag & 7n);
      if (field === 0) throw new Error('field 0');
      if (wire === 0) {
        let value;
        [value, i] = readVarint(bytes, i);
        fields.push({ field, wire, value });
      } else if (wire === 1 || wire === 5) {
        const size = wire === 1 ? 8 : 4;
        if (i + size > bytes.length) throw new Error('fixed past end');
        fields.push({ field, wire, value: bytes.subarray(i, i + size) });
        i += size;
      } else if (wire === 2) {
        let length;
        [length, i] = readVarint(bytes, i);
        const end = i + Number(length);
        if (end > bytes.length) throw new Error('length past end');
        fields.push({ field, wire, value: bytes.subarray(i, end) });
        i = end;
      } else throw new Error(`wire type ${wire}`);
    }
    return fields;
  }

  /** The field at `path`, descending through length-delimited messages; undefined when absent or malformed. */
  function at(bytes, path) {
    try {
      let current = bytes;
      for (let depth = 0; depth < path.length; depth++) {
        const hit = decode(current).find((f) => f.field === path[depth]);
        if (!hit) return undefined;
        if (depth === path.length - 1) return hit;
        if (hit.wire !== 2) return undefined;
        current = hit.value;
      }
    } catch {
      // not the shape we know
    }
    return undefined;
  }

  const textOf = (field) => {
    if (!field || field.wire !== 2) return null;
    try {
      return decoder.decode(field.value);
    } catch {
      return null;
    }
  };

  function writeVarint(n) {
    let v = BigInt(n);
    const out = [];
    for (;;) {
      const b = Number(v & 0x7fn);
      v >>= 7n;
      if (v === 0n) return out.concat(b);
      out.push(b | 0x80);
    }
  }

  function encode(fields) {
    const parts = [];
    for (const { field, wire, value } of fields) {
      parts.push(...writeVarint((BigInt(field) << 3n) | BigInt(wire)));
      if (wire === 0) parts.push(...writeVarint(value));
      else parts.push(...writeVarint(value.length), ...value);
    }
    return Uint8Array.from(parts);
  }
  const varint = (field, value) => ({ field, wire: 0, value });
  const string = (field, text) => ({ field, wire: 2, value: encoder.encode(text) });
  const message = (field, fields) => ({ field, wire: 2, value: encode(fields) });

  // ---- Meet's messages on captions_v2 ---------------------------------------------
  //
  // Request (client -> server):
  //   on:   {1: {2: {1: requestId, 2: {1: {2: lang, 3: lang}}}}}
  //   off:  {1: {2: {1: requestId, 2: {1: ""}}}}
  // Acknowledgement (server -> client):
  //   {1: {2: {1: requestId, 3: ""}}}
  // Caption frame (server -> client):
  //   {1: {1: {1: utteranceId, 2: version, 3: {2: final?, 3: text, 4: lang, 5: lang, 6: "spaces/<space>/devices/<n>"}}, 6: {1: unixSeconds}}}
  // The text of an utterance is replaced as its version rises; a final frame
  // ends it and the next speech gets the next utterance id. Meet's client
  // acknowledges every frame ({1: {1: {1: utteranceId, 2: version, 3: 1}}}),
  // and does so with its captions off too, so nothing here has to.
  function buildRequest(requestId, language) {
    const config = language === null ? [] : [string(2, language), string(3, language)];
    return encode([message(1, [message(2, [varint(1, requestId), message(2, [message(1, config)])])])]);
  }

  /** -> { requestId, language } for a request; language is null for "off". Undefined for anything else. */
  function readRequest(bytes) {
    const id = at(bytes, [1, 2, 1]);
    const config = at(bytes, [1, 2, 2, 1]);
    if (!id || id.wire !== 0 || !config || config.wire !== 2) return undefined;
    return { requestId: Number(id.value), language: textOf(at(config.value, [2])) || null };
  }

  function readAck(bytes) {
    const id = at(bytes, [1, 2, 1]);
    return id && id.wire === 0 ? Number(id.value) : null;
  }

  function readCaption(bytes) {
    const frame = at(bytes, [1, 1]);
    if (!frame || frame.wire !== 2) return null;
    const utterance = at(frame.value, [1]);
    const version = at(frame.value, [2]);
    const body = at(frame.value, [3]);
    if (!utterance || utterance.wire !== 0 || !body || body.wire !== 2) return null;
    const device = textOf(at(body.value, [6]));
    if (!device) return null;
    const final = at(body.value, [2]);
    return {
      device,
      utterance: utterance.value.toString(),
      version: version && version.wire === 0 ? Number(version.value) : 0,
      text: textOf(at(body.value, [3])) ?? '',
      final: Boolean(final && final.wire === 0 && final.value !== 0n),
    };
  }

  function toBytes(data) {
    if (data instanceof ArrayBuffer) return new Uint8Array(data);
    if (ArrayBuffer.isView(data)) return new Uint8Array(data.buffer, data.byteOffset, data.byteLength);
    return null;
  }

  // ---- state -----------------------------------------------------------------------
  const nativeCreate = RTCPeerConnection.prototype.createDataChannel;
  const nativeSend = RTCDataChannel.prototype.send;

  /** captions_v2 channels created under the hook; a call has one, a reconnect may bring another. */
  const channels = new Set();
  const lastActivity = new WeakMap(); // channel -> when it opened or Meet last sent a request on it
  /** channel -> language of Meet's own latest request, null after "off" (or before any): what the user has in Meet. */
  const meetCaptions = new WeakMap();
  /** Language of Meet's most recent "on" in this page, kept after captions are turned off again. */
  let meetLanguage = null;
  /** Set while the content script wants captions: { language, fallbackLanguage }. */
  let wanted = null;
  /** Our standing request: { channel, language, requestId, acked }. */
  let own = null;
  let requestCount = 0;
  let failures = 0;
  let syncTimer = 0;
  let ackTimer = 0;
  /** Counts caption (re)starts. Utterance ids carry on across a restart but their text starts over, so entries must not. */
  let stream = 0;
  let framesSeen = 0;

  /** One line per state change, so a console paste shows how far the request got. */
  const log = (...args) => console.info('[quilly] captions channel:', ...args);
  const post = (payload) => document.dispatchEvent(new CustomEvent(PAGE_EVENT, { detail: JSON.stringify(payload) }));
  const report = () =>
    post({ type: 'status', version: PROTOCOL_VERSION, streaming: own !== null && own.acked && own.channel.readyState === 'open' });

  function activeChannel() {
    let active = null;
    for (const channel of channels) if (channel.readyState === 'open') active = channel;
    return active;
  }

  function send(channel, language) {
    const requestId = OWN_REQUEST_ID_BASE + ++requestCount;
    // The native send: the hook below must not read our own request as Meet's.
    nativeSend.call(channel, buildRequest(requestId, language).buffer);
    return requestId;
  }

  function scheduleSync(delay) {
    window.clearTimeout(syncTimer);
    syncTimer = window.setTimeout(sync, delay);
  }

  /** Brings the server in line with `wanted`: captions requested by us, in the wanted language, on the call's open channel. */
  function sync() {
    window.clearTimeout(syncTimer);
    if (!wanted) {
      release();
      return;
    }
    const channel = activeChannel();
    if (own && own.channel !== channel) forget();
    if (channel && failures < MAX_FAILURES) {
      const quietFor = performance.now() - (lastActivity.get(channel) ?? 0);
      const language = wanted.language || meetCaptions.get(channel) || meetLanguage || wanted.fallbackLanguage || DEFAULT_LANGUAGE;
      if (!own && quietFor < SETTLE_MS) scheduleSync(SETTLE_MS - quietFor);
      else if (!own || own.language !== language) request(channel, language);
    }
    report();
  }

  function request(channel, language) {
    forget();
    let requestId;
    try {
      requestId = send(channel, language);
    } catch (error) {
      log('could not send the request:', error);
      failures++;
      scheduleSync(REASSERT_MS);
      return;
    }
    stream++;
    own = { channel, language, requestId, acked: false };
    log(`requested captions in ${language}`);
    ackTimer = window.setTimeout(() => {
      if (!own || own.requestId !== requestId || own.acked) return;
      failures++;
      log(`no acknowledgement (attempt ${failures} of ${MAX_FAILURES})`);
      own = null;
      sync();
    }, ACK_TIMEOUT_MS);
  }

  function forget() {
    window.clearTimeout(ackTimer);
    own = null;
  }

  /** Quilly no longer wants captions: tell the server to stop, unless Meet's own captions are on and need the stream. */
  function release() {
    const current = own;
    forget();
    if (!current || current.channel.readyState !== 'open' || meetCaptions.get(current.channel)) return;
    try {
      send(current.channel, null);
      log('stopped');
    } catch {
      // the call is going away
    }
  }

  function onMessage(channel, event) {
    const bytes = toBytes(event.data);
    if (!bytes) return;
    const ack = readAck(bytes);
    if (ack !== null) {
      if (ack <= OWN_REQUEST_ID_BASE) return; // Meet's own
      // Ours. Meet's client has no such request pending; keep the reply from it.
      event.stopImmediatePropagation();
      if (!own || own.requestId !== ack || own.channel !== channel) return;
      window.clearTimeout(ackTimer);
      own.acked = true;
      failures = 0;
      log('server acknowledged; captions will arrive as people speak');
      report();
      return;
    }
    if (!wanted) return;
    const caption = readCaption(bytes);
    if (!caption) return;
    if (framesSeen++ === 0) log('first caption frame received');
    post({ type: 'caption', stream, ...caption });
  }

  /** Meet's own requests: what the user has switched on in Meet, and in which language. */
  function observeRequest(channel, data) {
    const bytes = toBytes(data);
    const meet = bytes && readRequest(bytes);
    if (!meet) return;
    lastActivity.set(channel, performance.now());
    meetCaptions.set(channel, meet.language);
    if (meet.language) meetLanguage = meet.language;
    if (!wanted || !own || own.channel !== channel) return;
    // Meet's request replaced ours on the server: captions are now off, or on in Meet's language.
    stream++;
    if (meet.language && (!wanted.language || wanted.language === meet.language)) own.language = meet.language;
    else {
      own.language = null;
      scheduleSync(REASSERT_MS);
    }
  }

  // ---- hooks ---------------------------------------------------------------------
  RTCPeerConnection.prototype.createDataChannel = function (label, ...rest) {
    const channel = nativeCreate.call(this, label, ...rest);
    try {
      if (label === CAPTIONS_LABEL) {
        channels.add(channel);
        // Registered before Meet's own handlers, so acknowledgements of our requests can be withheld from them.
        channel.addEventListener('message', (event) => {
          try {
            onMessage(channel, event);
          } catch {
            // never break Meet's own handling
          }
        });
        channel.addEventListener('open', () => {
          lastActivity.set(channel, performance.now());
          if (wanted) sync();
        });
        channel.addEventListener('close', () => {
          channels.delete(channel);
          if (wanted) sync();
        });
      }
    } catch {
      // never let bookkeeping break Meet's call setup
    }
    return channel;
  };

  RTCDataChannel.prototype.send = function (data) {
    try {
      if (channels.has(this)) observeRequest(this, data);
    } catch {
      // observation only
    }
    return nativeSend.call(this, data);
  };

  document.addEventListener(REQUEST_EVENT, (event) => {
    let request;
    try {
      request = JSON.parse(event.detail);
    } catch {
      return;
    }
    if (request.action === 'start') {
      wanted = { language: String(request.language || ''), fallbackLanguage: String(request.fallbackLanguage || '') };
      failures = 0;
      if (!activeChannel()) log(channels.size ? 'waiting for the captions channel to open' : 'no captions channel seen; the call was set up before this script loaded, or Meet has not connected yet');
      sync();
    } else if (request.action === 'stop') {
      wanted = null;
      sync();
      report();
    } else if (request.action === 'status') report();
  });
})();
