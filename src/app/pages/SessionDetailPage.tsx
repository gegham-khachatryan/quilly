import { useMemo, useRef, useState, type CSSProperties } from 'react';
import { sessionsRepo } from '../../shared/db';
import { formatDateTime, formatDuration, pluralize } from '../../shared/format';
import { countCaptions, downloadText, exportFilename, renderExport, transcriptToText, type ExportFormat } from '../../shared/transcript';
import { Empty, ParticipantsStack, StatusBadge, TranscriptList } from '../../ui/components';
import { EditableTitle } from '../../ui/EditableTitle';
import { useEntries, useSession, useStickToBottom } from '../../ui/hooks';
import { CheckIcon, CodeIcon, CopyIcon, DownloadIcon, FileTextIcon, MarkdownIcon, SearchIcon, TrashIcon } from '../../ui/icons';
import { Menu } from '../../ui/Menu';
import { ResizeHandle, useStoredWidth } from '../../ui/ResizeHandle';
import { AiPanel } from '../components/AiPanel';
import { navigate } from '../router';

const AI_PANEL_DEFAULT = 420;
const AI_PANEL_MIN = 320;
const AI_PANEL_MAX = 900;

export function SessionDetailPage({ sessionId }: { sessionId: string }) {
  const [session] = useSession(sessionId);
  const entries = useEntries(sessionId);
  const [query, setQuery] = useState('');
  const [copied, setCopied] = useState(false);
  const live = session?.status === 'recording';
  const scrollRef = useStickToBottom<HTMLDivElement>(live ? entries.at(-1)?.updatedAt : null);
  const [aiWidth, setAiWidth, resetAiWidth] = useStoredWidth('ui.aiPanelWidth', AI_PANEL_DEFAULT, AI_PANEL_MIN, AI_PANEL_MAX);
  const asideRef = useRef<HTMLElement>(null);

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

  return (
    <div className="grid h-full grid-cols-1 lg:grid-cols-[minmax(0,1fr)_var(--ai-w)]" style={{ '--ai-w': `${aiWidth}px` } as CSSProperties}>
      <section className="flex min-h-0 flex-col">
        {/* Header */}
        <header className="relative z-20 border-b border-line bg-panel/60 backdrop-blur">
          <div className="mx-auto w-full max-w-4xl px-6 py-4">
            <div className="flex items-start justify-between gap-6">
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-3">
                  <EditableTitle value={session.title} onSave={(title) => sessionsRepo.put({ ...session, title })} className="min-w-0" />
                  <StatusBadge session={session} />
                </div>
                <div className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted">
                  <span>{formatDateTime(session.startedAt)}</span>
                  <Dot />
                  <span>{formatDuration(session.startedAt, session.endedAt)}</span>
                  <Dot />
                  <span>{pluralize(countCaptions(entries), 'caption')}</span>
                  <Dot />
                  <code className="rounded bg-panel-2 px-1.5 py-0.5 font-mono text-[11px] text-fg/80">{session.meetingCode}</code>
                </div>
              </div>

              <div className="flex shrink-0 items-center gap-2">
                <Menu
                  label={copied ? 'Copied' : 'Export'}
                  icon={copied ? <CheckIcon size={16} /> : <DownloadIcon size={16} />}
                  items={[
                    { label: 'Copy to clipboard', icon: <CopyIcon size={16} />, onSelect: () => void copy() },
                    'separator',
                    { label: 'Plain text', hint: '.txt', icon: <FileTextIcon size={16} />, onSelect: () => exportAs('txt') },
                    { label: 'Markdown', hint: '.md', icon: <MarkdownIcon size={16} />, onSelect: () => exportAs('md') },
                    { label: 'JSON', hint: '.json', icon: <CodeIcon size={16} />, onSelect: () => exportAs('json') },
                  ]}
                />
                <button className="btn-ghost btn-icon text-muted hover:bg-rec/15 hover:text-rec" onClick={() => void remove()} title="Delete session">
                  <TrashIcon size={22} />
                </button>
              </div>
            </div>
          </div>
        </header>

        {/* Toolbar: its speaker popover must float above the transcript but stay under the header's menus. */}
        <div className="relative z-10 border-b border-line">
          <div className="mx-auto flex w-full max-w-4xl items-center gap-3 px-6 py-2.5">
            <label className="relative block flex-1 max-w-sm">
              <SearchIcon size={15} className="pointer-events-none absolute top-1/2 left-3 -translate-y-1/2 text-muted" />
              <input className="input py-1.5 pl-9" placeholder="Search transcript…" value={query} onChange={(e) => setQuery(e.target.value)} />
              {query && (
                <span className="absolute top-1/2 right-3 -translate-y-1/2 text-[11px] tabular-nums text-muted">
                  {visible.length} / {entries.length}
                </span>
              )}
            </label>
            <div className="ml-auto flex items-center gap-3">
              {live && (
                <span className="inline-flex items-center gap-1.5 text-xs text-muted">
                  <span className="rec-dot" /> Live
                </span>
              )}
              <ParticipantsStack
                names={session.speakers}
                selected={session.speakers.find((n) => n.toLowerCase() === query.trim().toLowerCase()) ?? null}
                onSelect={(name) => setQuery(name ?? '')}
              />
            </div>
          </div>
        </div>

        {/* Transcript */}
        <div ref={scrollRef} className="flex-1 overflow-y-auto">
          <div className="mx-auto w-full max-w-4xl px-6 py-6">
            <TranscriptList entries={visible} startedAt={session.startedAt} highlight={query} />
            {query && visible.length === 0 && entries.length > 0 && <p className="py-10 text-center text-sm text-muted">No captions match “{query}”.</p>}
          </div>
        </div>
      </section>

      <aside ref={asideRef} className="relative min-h-0 border-l border-line bg-panel">
        <ResizeHandle
          label="Resize AI panel"
          onDrag={(clientX) => {
            const right = asideRef.current?.getBoundingClientRect().right ?? window.innerWidth;
            setAiWidth(Math.min(right - clientX, window.innerWidth * 0.6));
          }}
          onReset={resetAiWidth}
        />
        <AiPanel session={session} entries={entries} />
      </aside>
    </div>
  );
}

function Dot() {
  return <span className="h-1 w-1 rounded-full bg-line" aria-hidden />;
}
