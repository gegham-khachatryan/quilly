import { transcribeAudio } from '../shared/openrouter';
import { getSettings } from '../shared/settings';
import type { AudioChunk } from '../shared/types';
import { appendEntry, clearIssue, setIssue } from './sessionManager';

const REQUEST_TIMEOUT_MS = 90_000;
const SPEAKER_LABEL = { local: 'You', remote: 'Participants' } as const;

// One request at a time per session keeps entries in order and avoids rate-limit bursts.
const queues = new Map<string, Promise<void>>();

/** Transcribes an audio chunk via OpenRouter and appends the text as a caption entry. */
export async function handleAudioChunk(chunk: AudioChunk): Promise<void> {
  const settings = await getSettings();
  if (!settings.openRouterApiKey) {
    await setIssue(chunk.sessionId, 'Audio transcription needs an OpenRouter API key. Add one in Settings.');
    return;
  }

  const task = async () => {
    try {
      const text = await transcribeAudio({
        apiKey: settings.openRouterApiKey,
        model: settings.transcriptionModel,
        wavBase64: chunk.wavBase64,
        signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
      });
      if (text) {
        await appendEntry(chunk.sessionId, {
          localId: `audio:${chunk.bus}:${chunk.startedAt}`,
          kind: 'caption',
          speaker: SPEAKER_LABEL[chunk.bus],
          text,
          startedAt: chunk.startedAt,
        });
      }
      await clearIssue(chunk.sessionId);
    } catch (error) {
      const reason = error instanceof Error ? error.message : String(error);
      console.warn('[meet-hunter] transcription failed', reason);
      await setIssue(chunk.sessionId, `Transcription failed: ${reason}`);
    }
  };
  const next = (queues.get(chunk.sessionId) ?? Promise.resolve()).then(task, task);
  queues.set(chunk.sessionId, next);
  await next;
}
