import { useState } from 'react';
import { sendToBackground } from '../shared/messages';
import type { TabRecordingState } from '../shared/types';

/** Start/stop button + status line shared by the popup and side panel. */
export function RecordingControls({ state, onChanged, size = 'md' }: { state: TabRecordingState | null; onChanged: () => void; size?: 'sm' | 'md' }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const run = async (type: 'recording/start' | 'recording/stop') => {
    if (!state) return;
    setBusy(true);
    setError(null);
    try {
      await sendToBackground({ type, tabId: state.tabId });
      onChanged();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };

  if (!state) return <p className="text-xs text-muted">Connecting…</p>;

  const recording = Boolean(state.session);
  const canStart = state.isMeet && state.meet?.inCall;
  const statusText = !state.isMeet
    ? 'Open a Google Meet tab to record.'
    : !state.meet
      ? 'Meet page is loading…'
      : recording
        ? `Recording ${state.session?.title ?? ''}`
        : state.meet.inCall
          ? 'In a call. Ready to record.'
          : 'Join the call to start recording.';

  const btn = size === 'sm' ? 'w-full py-2 text-xs font-semibold' : 'w-full py-3 text-sm font-semibold';

  return (
    <div className="space-y-2">
      {recording ? (
        <button className={`btn-stop ${btn}`} disabled={busy} onClick={() => run('recording/stop')}>
          <span className="rec-dot" /> Stop recording
        </button>
      ) : (
        <button className={`btn-brand ${btn}`} disabled={busy || !canStart} onClick={() => run('recording/start')}>
          <span className="relative inline-flex h-3 w-3 items-center justify-center rounded-full bg-white/25">
            <span className="h-1.5 w-1.5 rounded-full bg-white" />
          </span>
          Start recording
        </button>
      )}
      <p className="flex items-center gap-1.5 text-xs text-muted">
        {recording && <span className="rec-dot shrink-0" />}
        <span className="truncate">{statusText}</span>
      </p>
      {error && <p className="text-xs text-rec">{error}</p>}
    </div>
  );
}
