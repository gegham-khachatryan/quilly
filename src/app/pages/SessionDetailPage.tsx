import { useMemo, useState } from 'react';
import { sessionsRepo } from '../../shared/db';
import { formatDateTime, formatDuration } from '../../shared/format';
import { downloadText, exportFilename, renderExport, transcriptToText, type ExportFormat } from '../../shared/transcript';
import { Empty, StatusBadge, TranscriptList } from '../../ui/components';
import { useEntries, useSession, useStickToBottom } from '../../ui/hooks';
import { AiPanel } from '../components/AiPanel';
import { navigate } from '../router';

export function SessionDetailPage({ sessionId }: { sessionId: string }) {
  const [session] = useSession(sessionId);
  const entries = useEntries(sessionId);
  const [query, setQuery] = useState('');
  const [copied, setCopied] = useState(false);
  const live = session?.status === 'recording';
  const scrollRef = useStickToBottom<HTMLDivElement>(live ? entries.at(-1)?.updatedAt : null);

  const visible = useMemo(() => {
    const q = query.trim().toLowerCase();
    return q ? entries.filter((e) => e.text.toLowerCase().includes(q) || e.speaker.toLowerCase().includes(q)) : entries;
  }, [entries, query]);

  if (session === undefined) return null;
  if (session === null) {
    return (
      <Empty title="Session not found">
        <button className="text-accent hover:underline" onClick={() => navigate('#/sessions')}>
          Back to sessions
        </button>
      </Empty>
    );
  }

  const exportAs = (format: ExportFormat) => {
    const mime = format === 'json' ? 'application/json' : format === 'md' ? 'text/markdown' : 'text/plain';
    downloadText(exportFilename(session, format), renderExport(session, entries, format), mime);
  };

  const copy = async () => {
    await navigator.clipboard.writeText(transcriptToText(session, entries));
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1500);
  };

  const rename = async () => {
    const title = prompt('Session title', session.title)?.trim();
    if (title && title !== session.title) await sessionsRepo.put({ ...session, title });
  };

  const remove = async () => {
    if (!confirm('Delete this session and its transcript? This cannot be undone.')) return;
    await sessionsRepo.delete(session.id);
    navigate('#/sessions');
  };

  return (
    <div className="grid h-full grid-cols-1 lg:grid-cols-[minmax(0,1fr)_400px]">
      <section className="flex min-h-0 flex-col border-r border-line">
        <header className="space-y-3 border-b border-line p-4">
          <div className="flex items-start justify-between gap-4">
            <div className="min-w-0">
              <button className="text-xs text-muted hover:text-fg" onClick={() => navigate('#/sessions')}>
                ← Sessions
              </button>
              <h1 className="mt-1 flex items-center gap-2 text-lg font-semibold">
                <span className="truncate">{session.title}</span>
                <StatusBadge session={session} />
              </h1>
              <p className="mt-0.5 flex flex-wrap gap-x-3 text-xs text-muted">
                <span>{formatDateTime(session.startedAt)}</span>
                <span>{formatDuration(session.startedAt, session.endedAt)}</span>
                <span>{entries.length} captions</span>
                <span className="font-mono">{session.meetingCode}</span>
                {session.speakers.length > 0 && <span>{session.speakers.join(', ')}</span>}
              </p>
            </div>
            <div className="flex shrink-0 flex-wrap justify-end gap-1.5">
              <button className="btn-ghost px-2 py-1 text-xs" onClick={() => void rename()}>
                Rename
              </button>
              <button className="btn-ghost px-2 py-1 text-xs" onClick={() => void copy()}>
                {copied ? 'Copied' : 'Copy'}
              </button>
              <button className="btn-ghost px-2 py-1 text-xs" onClick={() => exportAs('txt')}>
                .txt
              </button>
              <button className="btn-ghost px-2 py-1 text-xs" onClick={() => exportAs('md')}>
                .md
              </button>
              <button className="btn-ghost px-2 py-1 text-xs" onClick={() => exportAs('json')}>
                .json
              </button>
              <button className="btn-ghost px-2 py-1 text-xs text-muted hover:text-rec" onClick={() => void remove()}>
                Delete
              </button>
            </div>
          </div>
          <input className="input" placeholder="Search transcript…" value={query} onChange={(e) => setQuery(e.target.value)} />
        </header>
        <div ref={scrollRef} className="flex-1 overflow-y-auto p-4">
          <TranscriptList entries={visible} startedAt={session.startedAt} highlight={query} />
          {query && visible.length === 0 && entries.length > 0 && <p className="text-center text-sm text-muted">No matches.</p>}
        </div>
      </section>
      <aside className="min-h-0 bg-panel">
        <AiPanel session={session} entries={entries} />
      </aside>
    </div>
  );
}
