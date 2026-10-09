// AudioWorklet processor: forwards mono input blocks to the main thread.
// Batches ~128 ms of audio per message to keep message overhead low.
class MeetHunterCapture extends AudioWorkletProcessor {
  constructor() {
    super();
    this.chunks = [];
    this.length = 0;
  }
  process(inputs) {
    const channel = inputs[0]?.[0];
    if (channel) {
      this.chunks.push(Float32Array.from(channel));
      this.length += channel.length;
      if (this.length >= 2048) {
        const out = new Float32Array(this.length);
        let offset = 0;
        for (const c of this.chunks) {
          out.set(c, offset);
          offset += c.length;
        }
        this.chunks = [];
        this.length = 0;
        this.port.postMessage(out, [out.buffer]);
      }
    }
    return true;
  }
}
registerProcessor('meet-hunter-capture', MeetHunterCapture);
