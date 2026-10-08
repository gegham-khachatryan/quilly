import { useEffect, useState } from 'react';
import { formatDateTime, formatDuration } from '../shared/format';
import type { Session } from '../shared/types';
import { Empty, StatusBadge, TranscriptList } from '../ui/components';
import { openAppPage, useCurrentTabId, useEntries, useSessions, useStickToBottom, useTabState } from '../ui/hooks';
import { RecordingControls } from '../ui/RecordingControls';

/**
 * Side panel for the active Meet tab.
 * - Live session: streams its transcript (and keeps showing it after it ends, in the same panel instance).
 * - Otherwise: list of recent sessions; picking one shows its transcript inline.
 */
export function SidePanel() {
  const tabId = useCurrentTabId();
  const [state, refresh] = useTabState(tabId);
  const [sessions] = useSessions();
  const [viewedId, setViewedId] = useState<string | null>(null);

  const liveId = state?.session?.id ?? null;
  useEffect(() => {
    if (liveId) setViewedId(liveId);
  }, [liveId]);

  const viewed = (liveId && state?.session) || sessions?.find((s) => s.id === viewedId) || null;

  return (
    <div className="flex h-full flex-col">
      <header className="space-y-2 border-b border-line p-3">
        <div className="flex items-center justify-between">
          <h1 className="flex items-center gap-2 text-sm font-semibold">
            <img src="/logo.svg" alt="" className="h-4 w-4" /> {viewed ? 'Transcript' : 'Meet Hunter'}
          </h1>
          <button className="text-xs text-muted hover:text-fg" onClick={() => openAppPage('#/sessions')}>
            All sessions
          </button>
        </div>
        <RecordingControls state={state} onChanged={() => void refresh()} size="sm" />
      </header>

      {viewed ? (
        <TranscriptPane session={viewed} live={viewed.id === liveId} onBack={() => setViewedId(null)} />
      ) : (
        <RecentSessions sessions={sessions} onSelect={(id) => setViewedId(id)} />
      )}
    </div>
  );
}

function TranscriptPane({ session, live, onBack }: { session: Session; live: boolean; onBack: () => void }) {
  const entries = useEntries(session.id);
  const scrollRef = useStickToBottom<HTMLDivElement>(live ? entries.at(-1)?.updatedAt : null);
  const [, tick] = useState(0);
  useEffect(() => {
    if (!live) return;
    const t = window.setInterval(() => tick((n) => n + 1), 1000);
    return () => window.clearInterval(t);
  }, [live]);

  return (
    <>
      <div className="flex items-center gap-2 border-b border-line bg-panel px-3 py-2 text-xs">
        {!live && (
          <button className="shrink-0 text-muted hover:text-fg" onClick={onBack} title="Back to recent sessions">
            ←
          </button>
        )}
        <button className="min-w-0 flex-1 truncate text-left font-medium hover:underline" onClick={() => openAppPage(`#/sessions/${session.id}`)} title="Open session">
          {session.title}
        </button>
        <span className="shrink-0 text-muted">
          {entries.length} · {formatDuration(session.startedAt, session.endedAt)}
        </span>
      </div>
      <div ref={scrollRef} className="flex-1 overflow-y-auto p-3">
        <TranscriptList entries={entries} startedAt={session.startedAt} compact />
      </div>
    </>
  );
}

function RecentSessions({ sessions, onSelect }: { sessions: Session[] | null; onSelect: (id: string) => void }) {
  if (sessions === null) return null;
  if (sessions.length === 0) {
    return (
      <div className="flex-1">
        <Empty title="No sessions yet">Join a Google Meet call to start recording. Captions will stream here live.</Empty>
      </div>
    );
  }
  return (
    <div className="flex-1 overflow-y-auto">
      <p className="px-3 pt-3 pb-1 text-[11px] font-semibold uppercase tracking-wide text-muted">Recent sessions</p>
      <ul className="divide-y divide-line">
        {sessions.slice(0, 20).map((s) => (
          <li key={s.id}>
            <button className="flex w-full flex-col gap-0.5 px-3 py-2.5 text-left hover:bg-panel-2" onClick={() => onSelect(s.id)}>
              <span className="flex w-full items-center gap-2">
                <span className="min-w-0 flex-1 truncate text-sm font-medium">{s.title}</span>
                {s.status === 'recording' && <StatusBadge session={s} />}
              </span>
              <span className="flex flex-wrap gap-x-2 text-[11px] text-muted">
                <span>{formatDateTime(s.startedAt)}</span>
                <span>{formatDuration(s.startedAt, s.endedAt)}</span>
                <span>{s.entryCount} captions</span>
              </span>
              {s.speakers.length > 0 && <span className="w-full truncate text-[11px] text-muted">{s.speakers.join(', ')}</span>}
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}
