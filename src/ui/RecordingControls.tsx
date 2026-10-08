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

  const btn = size === 'sm' ? 'w-full py-1.5 text-xs' : 'w-full py-2.5 text-sm';

  return (
    <div className="space-y-2">
      {recording ? (
        <button className={`btn-danger ${btn}`} disabled={busy} onClick={() => run('recording/stop')}>
          <span className="h-2.5 w-2.5 rounded-sm bg-white" /> Stop recording
        </button>
      ) : (
        <button className={`btn-primary ${btn}`} disabled={busy || !canStart} onClick={() => run('recording/start')}>
          <span className="h-2.5 w-2.5 rounded-full bg-rec" /> Start recording
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
