// Runs in the page's main world on meet.google.com (see manifest "world": "MAIN").
//
// Captures the call's audio without touching captions:
// - RTCPeerConnection is wrapped so every remote audio track Meet receives is known.
// - navigator.mediaDevices.getUserMedia is wrapped so the local microphone track is known.
// When the content script asks to start, the tracks are routed through a 16 kHz
// AudioContext into two capture busses (local = "You", remote = everyone else).
// Audio is cut into chunks at pauses in speech, silent chunks are dropped, and
// each chunk is posted to the content script as 16-bit PCM. Web Audio keeps
// running in background tabs, so this is unaffected by tab visibility.
//
// Only Meet's own tracks are tapped; nothing is recorded until asked, and the
// microphone follows Meet's mute state (a muted track yields silence).
(() => {
  const NS = '__meetHunterAudio';
  const SAMPLE_RATE = 16000;
  const MIN_CHUNK_S = 8;
  const MAX_CHUNK_S = 40;
  const SILENCE_SPLIT_S = 0.6;
  const SPEECH_RMS = 0.012;
  const MIN_SPEECH_RATIO = 0.03;

  const tracks = { local: new Set(), remote: new Set() };
  const engine = { ctx: null, workletUrl: null, busses: null, sources: new Map(), chunkers: null, running: false };

  // ---- track discovery -------------------------------------------------------
  const addTrack = (bus, track) => {
    if (!track || track.kind !== 'audio' || tracks[bus].has(track)) return;
    tracks[bus].add(track);
    track.addEventListener('ended', () => {
      tracks[bus].delete(track);
      detach(track);
      reportStatus();
    });
    if (engine.running) attach(bus, track);
    reportStatus();
  };

  const NativePC = window.RTCPeerConnection;
  if (NativePC) {
    const Wrapped = function RTCPeerConnection(...args) {
      const pc = new NativePC(...args);
      pc.addEventListener('track', (event) => addTrack('remote', event.track));
      return pc;
    };
    Wrapped.prototype = NativePC.prototype;
    Object.setPrototypeOf(Wrapped, NativePC);
    window.RTCPeerConnection = Wrapped;
    if ('webkitRTCPeerConnection' in window) window.webkitRTCPeerConnection = Wrapped;
  }

  const mediaDevices = navigator.mediaDevices;
  if (mediaDevices && typeof mediaDevices.getUserMedia === 'function') {
    const nativeGUM = mediaDevices.getUserMedia.bind(mediaDevices);
    mediaDevices.getUserMedia = async (constraints) => {
      const stream = await nativeGUM(constraints);
      for (const track of stream.getAudioTracks()) addTrack('local', track);
      return stream;
    };
  }

  // ---- capture engine --------------------------------------------------------
  class Chunker {
    constructor(bus) {
      this.bus = bus;
      this.reset();
    }
    reset() {
      this.buffers = [];
      this.length = 0;
      this.speech = 0;
      this.silenceRun = 0;
      this.startedAt = null;
    }
    push(samples) {
      if (this.startedAt === null) this.startedAt = Date.now() - (samples.length / SAMPLE_RATE) * 1000;
      let sum = 0;
      for (let i = 0; i < samples.length; i++) sum += samples[i] * samples[i];
      const silent = Math.sqrt(sum / samples.length) < SPEECH_RMS;
      this.silenceRun = silent ? this.silenceRun + samples.length : 0;
      if (!silent) this.speech += samples.length;
      this.buffers.push(samples);
      this.length += samples.length;
      const seconds = this.length / SAMPLE_RATE;
      if ((seconds >= MIN_CHUNK_S && this.silenceRun >= SILENCE_SPLIT_S * SAMPLE_RATE) || seconds >= MAX_CHUNK_S) this.flush();
    }
    flush() {
      if (this.length === 0) return;
      const { buffers, length, speech, startedAt } = this;
      this.reset();
      if (speech / length < MIN_SPEECH_RATIO) return; // nothing said: skip the upload entirely
      const pcm = new Int16Array(length);
      let offset = 0;
      for (const b of buffers) {
        for (let i = 0; i < b.length; i++) pcm[offset + i] = Math.max(-32768, Math.min(32767, Math.round(b[i] * 32767)));
        offset += b.length;
      }
      post({ kind: 'chunk', bus: this.bus, startedAt, durationMs: (length / SAMPLE_RATE) * 1000, sampleRate: SAMPLE_RATE, pcm: pcm.buffer }, [pcm.buffer]);
    }
  }

  const post = (payload, transfer) => window.postMessage({ [NS]: payload }, location.origin, transfer);

  const reportStatus = () => {
    if (!engine.running) return;
    post({ kind: 'status', state: engine.ctx?.state ?? 'closed', local: tracks.local.size, remote: tracks.remote.size });
  };

  async function createCaptureNode(ctx) {
    if (engine.workletUrl) {
      try {
        await ctx.audioWorklet.addModule(engine.workletUrl);
        return (onSamples) => {
          const node = new AudioWorkletNode(ctx, 'meet-hunter-capture', { numberOfInputs: 1, numberOfOutputs: 1, channelCount: 1, channelCountMode: 'explicit' });
          node.port.onmessage = (e) => onSamples(e.data);
          return node;
        };
      } catch (error) {
        console.warn('[meet-hunter] audio worklet unavailable, using ScriptProcessorNode', error);
      }
    }
    return (onSamples) => {
      const node = ctx.createScriptProcessor(2048, 1, 1);
      node.onaudioprocess = (e) => onSamples(Float32Array.from(e.inputBuffer.getChannelData(0)));
      return node;
    };
  }

  async function start(workletUrl) {
    if (engine.running) return;
    engine.running = true;
    engine.workletUrl = workletUrl;
    const ctx = new AudioContext({ sampleRate: SAMPLE_RATE });
    engine.ctx = ctx;
    const makeCapture = await createCaptureNode(ctx);
    const sink = ctx.createGain(); // nodes must reach the destination to be pulled; keep it inaudible
    sink.gain.value = 0;
    sink.connect(ctx.destination);
    engine.chunkers = { local: new Chunker('local'), remote: new Chunker('remote') };
    engine.busses = {};
    for (const bus of ['local', 'remote']) {
      const input = ctx.createGain();
      const capture = makeCapture((samples) => engine.chunkers?.[bus].push(samples));
      input.connect(capture);
      capture.connect(sink);
      engine.busses[bus] = input;
    }
    for (const bus of ['local', 'remote']) for (const track of tracks[bus]) attach(bus, track);
    ctx.onstatechange = reportStatus;
    await resume();
    reportStatus();
  }

  /** Autoplay policy may leave the context suspended until the user interacts with the page. */
  async function resume() {
    const ctx = engine.ctx;
    if (!ctx || ctx.state !== 'suspended') return;
    await ctx.resume().catch(() => undefined);
    if (ctx.state === 'suspended') {
      const retry = () => {
        if (engine.ctx === ctx) void ctx.resume().catch(() => undefined);
      };
      for (const type of ['pointerdown', 'keydown']) window.addEventListener(type, retry, { once: true, capture: true });
    }
  }

  function attach(bus, track) {
    if (!engine.ctx || !engine.busses || engine.sources.has(track) || track.readyState === 'ended') return;
    try {
      const source = engine.ctx.createMediaStreamSource(new MediaStream([track]));
      source.connect(engine.busses[bus]);
      engine.sources.set(track, source);
    } catch (error) {
      console.warn('[meet-hunter] could not tap audio track', error);
    }
  }

  function detach(track) {
    const source = engine.sources.get(track);
    if (!source) return;
    source.disconnect();
    engine.sources.delete(track);
  }

  function stop() {
    if (!engine.running) return;
    engine.chunkers?.local.flush();
    engine.chunkers?.remote.flush();
    for (const track of Array.from(engine.sources.keys())) detach(track);
    const ctx = engine.ctx;
    engine.ctx = null;
    engine.busses = null;
    engine.chunkers = null;
    engine.running = false;
    void ctx?.close().catch(() => undefined);
  }

  // ---- commands from the content script ----------------------------------------
  window.addEventListener('message', (event) => {
    if (event.source !== window) return;
    const command = event.data?.[NS];
    if (!command || typeof command !== 'object' || !('cmd' in command)) return;
    if (command.cmd === 'start') void start(command.workletUrl);
    else if (command.cmd === 'stop') stop();
  });
})();
