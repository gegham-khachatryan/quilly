import { useEffect, useState } from 'react';
import { formatDuration } from '../shared/format';
import { TranscriptList } from '../ui/components';
import { openAppPage, useCurrentTabId, useEntries, useSessions, useStickToBottom, useTabState } from '../ui/hooks';
import { RecordingControls } from '../ui/RecordingControls';

/**
 * Live view for the active Meet tab. While a session is recording it streams
 * captions in; once it stops, it keeps showing the last session for that tab.
 */
export function SidePanel() {
  const tabId = useCurrentTabId();
  const [state, refresh] = useTabState(tabId);
  const [sessions] = useSessions();
  const [shownSessionId, setShownSessionId] = useState<string | null>(null);

  // Prefer the live session; otherwise fall back to the most recent one so the
  // panel is still useful right after stopping.
  useEffect(() => {
    if (state?.session) setShownSessionId(state.session.id);
    else if (!shownSessionId && sessions?.[0]) setShownSessionId(sessions[0].id);
  }, [state?.session, sessions, shownSessionId]);

  const session = state?.session ?? sessions?.find((s) => s.id === shownSessionId) ?? null;
  const entries = useEntries(session?.id ?? null);
  const scrollRef = useStickToBottom<HTMLDivElement>(entries.at(-1)?.updatedAt);
  const [, tick] = useState(0);
  useEffect(() => {
    if (!state?.session) return;
    const t = window.setInterval(() => tick((n) => n + 1), 1000);
    return () => window.clearInterval(t);
  }, [state?.session]);

  return (
    <div className="flex h-full flex-col">
      <header className="space-y-2 border-b border-line p-3">
        <div className="flex items-center justify-between">
          <h1 className="flex items-center gap-2 text-sm font-semibold">
            <img src="/logo.svg" alt="" className="h-4 w-4" /> Live transcript
          </h1>
          <button className="text-xs text-muted hover:text-fg" onClick={() => openAppPage('#/sessions')}>
            All sessions
          </button>
        </div>
        <RecordingControls state={state} onChanged={() => void refresh()} size="sm" />
      </header>

      {session && (
        <div className="flex items-center justify-between gap-2 border-b border-line bg-panel px-3 py-2 text-xs">
          <button className="truncate text-left font-medium hover:underline" onClick={() => openAppPage(`#/sessions/${session.id}`)} title="Open session">
            {session.title}
          </button>
          <span className="shrink-0 text-muted">
            {entries.length} · {formatDuration(session.startedAt, session.endedAt)}
          </span>
        </div>
      )}

      <div ref={scrollRef} className="flex-1 overflow-y-auto p-3">
        {session ? (
          <TranscriptList entries={entries} startedAt={session.startedAt} compact />
        ) : (
          <p className="p-4 text-center text-xs text-muted">Start a recording to see captions here as they are spoken.</p>
        )}
      </div>
    </div>
  );
}
