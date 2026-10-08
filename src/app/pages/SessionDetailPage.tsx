import { useMemo, useState } from 'react';
import { sessionsRepo } from '../../shared/db';
import { formatDateTime, formatDuration, pluralize } from '../../shared/format';
import { downloadText, exportFilename, renderExport, transcriptToText, type ExportFormat } from '../../shared/transcript';
import { Empty, StatusBadge, TranscriptList } from '../../ui/components';
import { EditableTitle } from '../../ui/EditableTitle';
import { useEntries, useSession, useStickToBottom } from '../../ui/hooks';
import { ArrowLeftIcon, CheckIcon, CodeIcon, CopyIcon, DownloadIcon, FileTextIcon, MarkdownIcon, SearchIcon, TrashIcon } from '../../ui/icons';
import { Menu } from '../../ui/Menu';
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

  const remove = async () => {
    if (!confirm('Delete this session and its transcript? This cannot be undone.')) return;
    await sessionsRepo.delete(session.id);
    navigate('#/sessions');
  };

  const meta = [
    formatDateTime(session.startedAt),
    formatDuration(session.startedAt, session.endedAt),
    pluralize(entries.length, 'caption'),
    session.speakers.length > 0 ? session.speakers.join(', ') : null,
  ].filter((v): v is string => Boolean(v));

  return (
    <div className="grid h-full grid-cols-1 lg:grid-cols-[minmax(0,1fr)_400px]">
      <section className="flex min-h-0 flex-col border-r border-line">
        <header className="border-b border-line px-5 pt-3 pb-4">
          <button className="mb-2 inline-flex items-center gap-1 text-xs text-muted hover:text-fg" onClick={() => navigate('#/sessions')}>
            <ArrowLeftIcon size={14} /> Sessions
          </button>

          <div className="flex items-start justify-between gap-4">
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-3">
                <EditableTitle value={session.title} onSave={(title) => sessionsRepo.put({ ...session, title })} className="min-w-0" />
                <StatusBadge session={session} />
              </div>
              <p className="mt-1 flex flex-wrap items-center gap-x-2 text-xs text-muted">
                {meta.map((item, i) => (
                  <span key={i} className="flex items-center gap-x-2">
                    {i > 0 && <span className="text-line">•</span>}
                    {item}
                  </span>
                ))}
                <span className="flex items-center gap-x-2">
                  <span className="text-line">•</span>
                  <code className="rounded bg-panel-2 px-1 py-0.5 font-mono text-[11px]">{session.meetingCode}</code>
                </span>
              </p>
            </div>

            <div className="flex shrink-0 items-center gap-1.5">
              <Menu
                label={copied ? 'Copied' : 'Export'}
                icon={copied ? <CheckIcon size={14} /> : <DownloadIcon size={14} />}
                items={[
                  { label: 'Copy to clipboard', icon: <CopyIcon size={15} />, onSelect: () => void copy() },
                  'separator',
                  { label: 'Plain text', hint: '.txt', icon: <FileTextIcon size={15} />, onSelect: () => exportAs('txt') },
                  { label: 'Markdown', hint: '.md', icon: <MarkdownIcon size={15} />, onSelect: () => exportAs('md') },
                  { label: 'JSON', hint: '.json', icon: <CodeIcon size={15} />, onSelect: () => exportAs('json') },
                ]}
              />
              <button className="btn-ghost btn-icon text-muted hover:text-rec" onClick={() => void remove()} title="Delete session">
                <TrashIcon size={15} />
              </button>
            </div>
          </div>

          <label className="relative mt-3 block max-w-md">
            <SearchIcon size={15} className="pointer-events-none absolute top-1/2 left-3 -translate-y-1/2 text-muted" />
            <input className="input pl-9" placeholder="Search transcript…" value={query} onChange={(e) => setQuery(e.target.value)} />
            {query && (
              <span className="absolute top-1/2 right-3 -translate-y-1/2 text-[11px] text-muted">
                {visible.length} / {entries.length}
              </span>
            )}
          </label>
        </header>

        <div ref={scrollRef} className="flex-1 overflow-y-auto p-5">
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
