import { useMemo, useState } from 'react';
import { sessionsRepo } from '../../shared/db';
import { formatDateTime, formatDuration, pluralize } from '../../shared/format';
import { Avatar, Empty, StatusBadge } from '../../ui/components';
import { useSessions } from '../../ui/hooks';
import { SearchIcon, TrashIcon } from '../../ui/icons';
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
    <div className="h-full overflow-y-auto">
      <div className="mx-auto max-w-4xl space-y-5 px-6 py-6">
        <div className="flex items-center justify-between gap-4">
          <div>
            <h1 className="text-lg font-semibold">Sessions</h1>
            {sessions && sessions.length > 0 && <p className="text-xs text-muted">{pluralize(sessions.length, 'recorded meeting')}</p>}
          </div>
          <label className="relative block w-72">
            <SearchIcon size={15} className="pointer-events-none absolute top-1/2 left-3 -translate-y-1/2 text-muted" />
            <input className="input py-1.5 pl-9" placeholder="Search title, code, participant…" value={query} onChange={(e) => setQuery(e.target.value)} />
          </label>
        </div>

        {sessions === null ? null : sessions.length === 0 ? (
          <div className="card">
            <Empty title="No sessions recorded yet">Join a Google Meet call. With auto-start on, recording begins automatically.</Empty>
          </div>
        ) : (
          <ul className="space-y-2">
            {filtered.map((s) => {
              const live = s.status === 'recording';
              return (
                <li key={s.id}>
                  <div
                    role="link"
                    tabIndex={0}
                    onClick={() => navigate(`#/sessions/${s.id}`)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') navigate(`#/sessions/${s.id}`);
                    }}
                    className={`card group flex cursor-pointer items-center gap-4 px-4 py-3 transition-colors hover:border-accent/50 hover:bg-panel-2/60 ${live ? 'border-rec/40' : ''}`}
                  >
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <span className="truncate text-sm font-medium">{s.title}</span>
                        {live && <StatusBadge session={s} />}
                      </div>
                      <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted">
                        <span>{formatDateTime(s.startedAt)}</span>
                        <span>{formatDuration(s.startedAt, s.endedAt)}</span>
                        <span>{pluralize(s.entryCount, 'caption')}</span>
                        <code className="rounded bg-panel-2 px-1.5 py-0.5 font-mono text-[11px] text-fg/70">{s.meetingCode}</code>
                      </div>
                    </div>
                    {s.speakers.length > 0 && (
                      <div className="hidden items-center sm:flex" title={s.speakers.join(', ')}>
                        <div className="flex -space-x-1.5">
                          {s.speakers.slice(0, 4).map((name) => (
                            <span key={name} className="rounded-full ring-2 ring-panel">
                              <Avatar name={name} size="sm" />
                            </span>
                          ))}
                        </div>
                        {s.speakers.length > 4 && <span className="ml-1.5 text-[11px] text-muted">+{s.speakers.length - 4}</span>}
                      </div>
                    )}
                    <button
                      className="btn-ghost btn-icon text-muted opacity-0 transition-opacity group-hover:opacity-100 hover:bg-rec/15 hover:text-rec focus:opacity-100"
                      onClick={(e) => {
                        e.stopPropagation();
                        void remove(s.id);
                      }}
                      title="Delete session"
                    >
                      <TrashIcon size={20} />
                    </button>
                  </div>
                </li>
              );
            })}
            {filtered.length === 0 && <li className="card p-8 text-center text-sm text-muted">No sessions match “{query}”.</li>}
          </ul>
        )}
      </div>
    </div>
  );
}
