import { useMemo, useState } from 'react';
import { sessionsRepo } from '../../shared/db';
import { formatDateTime, formatDuration } from '../../shared/format';
import { Empty, StatusBadge } from '../../ui/components';
import { useSessions } from '../../ui/hooks';
import { navigate } from '../router';

export function SessionsPage() {
  const [sessions, refresh] = useSessions();
  const [query, setQuery] = useState('');

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!sessions) return [];
    if (!q) return sessions;
    return sessions.filter((s) => [s.title, s.meetingCode, ...s.speakers].some((v) => v.toLowerCase().includes(q)));
  }, [sessions, query]);

  const remove = async (id: string) => {
    if (!confirm('Delete this session and its transcript? This cannot be undone.')) return;
    await sessionsRepo.delete(id);
    await refresh();
  };

  return (
    <div className="mx-auto max-w-4xl space-y-4 p-6">
      <div className="flex items-center justify-between gap-4">
        <h1 className="text-lg font-semibold">Sessions</h1>
        <input className="input max-w-xs" placeholder="Search title, code, participant…" value={query} onChange={(e) => setQuery(e.target.value)} />
      </div>

      {sessions === null ? null : sessions.length === 0 ? (
        <div className="card">
          <Empty title="No sessions recorded yet">Join a Google Meet call. With auto-start on, recording begins automatically.</Empty>
        </div>
      ) : (
        <ul className="card divide-y divide-line">
          {filtered.map((s) => (
            <li key={s.id} className="flex items-center gap-4 px-4 py-3 hover:bg-panel-2/60">
              <button className="min-w-0 flex-1 text-left" onClick={() => navigate(`#/sessions/${s.id}`)}>
                <div className="flex items-center gap-2">
                  <span className="truncate text-sm font-medium">{s.title}</span>
                  <StatusBadge session={s} />
                </div>
                <div className="mt-0.5 flex flex-wrap gap-x-3 text-xs text-muted">
                  <span>{formatDateTime(s.startedAt)}</span>
                  <span>{formatDuration(s.startedAt, s.endedAt)}</span>
                  <span>{s.entryCount} captions</span>
                  <span className="font-mono">{s.meetingCode}</span>
                  {s.speakers.length > 0 && <span className="truncate">{s.speakers.join(', ')}</span>}
                </div>
              </button>
              <button className="btn-ghost px-2 py-1 text-xs text-muted hover:text-rec" onClick={() => void remove(s.id)} title="Delete session">
                Delete
              </button>
            </li>
          ))}
          {filtered.length === 0 && <li className="p-6 text-center text-sm text-muted">No sessions match “{query}”.</li>}
        </ul>
      )}
    </div>
  );
}
