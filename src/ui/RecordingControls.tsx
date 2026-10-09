import { useState } from 'react';
import { sendToBackground } from '../shared/messages';
import type { ActiveRecording, TabRecordingState } from '../shared/types';

/**
 * Start/stop button + status line.
 * - `state` describes the tab the UI is attached to (where a new recording would start).
 * - `recording` is the recording the Stop button acts on. The side panel passes the
 *   session being viewed, which may live in another tab; the stop still reaches it.
 */
export function RecordingControls({
  state,
  recording,
  onChanged,
  size = 'md',
}: {
  state: TabRecordingState | null;
  recording: ActiveRecording | null;
  onChanged: () => void;
  size?: 'sm' | 'md';
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const run = async (action: () => Promise<unknown>) => {
    setBusy(true);
    setError(null);
    try {
      await action();
      onChanged();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };

  if (!state && !recording) return <p className="text-xs text-muted">Connecting…</p>;

  const canStart = Boolean(state?.isMeet && state.meet?.inCall);
  const inOtherTab = recording !== null && recording.tabId !== state?.tabId;
  const captions = recording && !inOtherTab ? state?.meet?.captions : undefined;
  const captionsNote = captions === 'off' ? ' · turning on captions…' : captions === 'unavailable' ? ' · captions unavailable in this call' : '';
  const statusText = recording
    ? `Recording ${recording.session.title}${captionsNote}`
    : !state?.isMeet
      ? 'Open a Google Meet tab to record.'
      : !state.meet
        ? state.pageLoading
          ? 'Meet page is loading…'
          : 'Can’t reach this Meet tab. Reload the page to connect.'
        : state.meet.inCall
          ? state.autoStartSuppressed
            ? 'Stopped. Auto-start is paused until this call ends.'
            : state.meet.captions === 'unavailable'
              ? 'In a call, but captions are unavailable here.'
              : 'In a call. Ready to record.'
          : 'Join the call to start recording.';

  const btn = size === 'sm' ? 'w-full py-2 text-xs font-semibold' : 'w-full py-3 text-sm font-semibold';

  return (
    <div className="space-y-2">
      {recording ? (
        <button
          className={`btn-stop ${btn}`}
          disabled={busy}
          onClick={() => void run(() => sendToBackground({ type: 'recording/stop', tabId: recording.tabId }))}
        >
          <span className="rec-dot" /> Stop recording
        </button>
      ) : (
        <button
          className={`btn-brand ${btn}`}
          disabled={busy || !canStart || !state}
          onClick={() => state && void run(() => sendToBackground({ type: 'recording/start', tabId: state.tabId }))}
        >
          <span className="relative inline-flex h-3 w-3 items-center justify-center rounded-full bg-white/25">
            <span className="h-1.5 w-1.5 rounded-full bg-white" />
          </span>
          Start recording
        </button>
      )}
      <p className="flex items-center gap-1.5 text-xs text-muted">
        {recording && <span className="rec-dot shrink-0" />}
        <span className="min-w-0 flex-1 truncate">{statusText}</span>
        {inOtherTab && (
          <button
            className="shrink-0 text-accent hover:underline"
            onClick={() => void sendToBackground({ type: 'tab/focus', tabId: recording.tabId })}
            title="Switch to the Meet tab being recorded"
          >
            Go to tab
          </button>
        )}
      </p>
      {error && <p className="text-xs text-rec">{error}</p>}
    </div>
  );
}
