import type { AudioBus, AudioChunk, AudioTapStatus } from '../shared/types';

const NS = '__meetHunterAudio';

type TapMessage =
  | { kind: 'chunk'; bus: AudioBus; startedAt: number; durationMs: number; sampleRate: number; pcm: ArrayBuffer }
  | { kind: 'status'; state: AudioTapStatus['state']; local: number; remote: number };

/**
 * Isolated-world side of the audio tap. Commands go to audiotap.js (main world)
 * via window.postMessage; PCM chunks come back the same way and are wrapped as
 * WAV for the background to transcribe.
 */
export class AudioTapBridge {
  status: AudioTapStatus | null = null;
  private sessionId: string | null = null;

  constructor(
    private readonly emit: (chunk: AudioChunk) => void,
    private readonly onStatus: () => void,
  ) {
    window.addEventListener('message', (event) => this.onMessage(event));
  }

  get isRunning(): boolean {
    return this.sessionId !== null;
  }

  start(sessionId: string): void {
    this.sessionId = sessionId;
    this.status = { state: 'suspended', local: 0, remote: 0 };
    this.post({ cmd: 'start', workletUrl: chrome.runtime.getURL('audio-worklet.js') });
  }

  stop(): void {
    this.post({ cmd: 'stop' }); // the tap flushes its last chunk before closing; sessionId stays set until it arrives
    const ending = this.sessionId;
    this.status = null;
    window.setTimeout(() => {
      if (this.sessionId === ending) this.sessionId = null;
    }, 1000);
  }

  private post(command: Record<string, unknown>): void {
    window.postMessage({ [NS]: command }, location.origin);
  }

  private onMessage(event: MessageEvent): void {
    if (event.source !== window) return;
    const message = (event.data as Record<string, unknown> | null)?.[NS] as TapMessage | undefined;
    if (!message || typeof message !== 'object' || !('kind' in message)) return;
    if (message.kind === 'status') {
      if (!this.status) return;
      this.status = { state: message.state, local: message.local, remote: message.remote };
      this.onStatus();
    } else if (message.kind === 'chunk' && this.sessionId) {
      this.emit({
        sessionId: this.sessionId,
        bus: message.bus,
        startedAt: message.startedAt,
        durationMs: message.durationMs,
        wavBase64: toBase64(encodeWav(new Int16Array(message.pcm), message.sampleRate)),
      });
    }
  }
}

function encodeWav(pcm: Int16Array, sampleRate: number): Uint8Array {
  const bytes = new Uint8Array(44 + pcm.byteLength);
  const view = new DataView(bytes.buffer);
  const ascii = (offset: number, text: string) => {
    for (let i = 0; i < text.length; i++) bytes[offset + i] = text.charCodeAt(i);
  };
  ascii(0, 'RIFF');
  view.setUint32(4, 36 + pcm.byteLength, true);
  ascii(8, 'WAVE');
  ascii(12, 'fmt ');
  view.setUint32(16, 16, true); // PCM header size
  view.setUint16(20, 1, true); // PCM
  view.setUint16(22, 1, true); // mono
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * 2, true); // byte rate
  view.setUint16(32, 2, true); // block align
  view.setUint16(34, 16, true); // bits per sample
  ascii(36, 'data');
  view.setUint32(40, pcm.byteLength, true);
  bytes.set(new Uint8Array(pcm.buffer, pcm.byteOffset, pcm.byteLength), 44);
  return bytes;
}

function toBase64(bytes: Uint8Array): string {
  let binary = '';
  for (let i = 0; i < bytes.length; i += 0x8000) binary += String.fromCharCode.apply(null, Array.from(bytes.subarray(i, i + 0x8000)));
  return btoa(binary);
}
