import { useEffect, useRef, useState, type ReactNode } from 'react';
import { formatClock, formatTime } from '../shared/format';
import type { Session, TranscriptEntry } from '../shared/types';

export function Toggle({ checked, onChange, label, hint }: { checked: boolean; onChange: (v: boolean) => void; label: string; hint?: string }) {
  return (
    <label className="flex cursor-pointer items-center justify-between gap-3">
      <span>
        <span className="block text-sm">{label}</span>
        {hint && <span className="block text-xs text-muted">{hint}</span>}
      </span>
      <button
        type="button"
        role="switch"
        aria-checked={checked}
        onClick={() => onChange(!checked)}
        className={`relative h-6 w-10 shrink-0 rounded-full transition-colors ${checked ? 'bg-accent' : 'bg-line'}`}
      >
        <span className={`absolute top-0.5 h-5 w-5 rounded-full bg-white transition-transform ${checked ? 'left-[18px]' : 'left-0.5'}`} />
      </button>
    </label>
  );
}

export function StatusBadge({ session }: { session: Pick<Session, 'status'> }) {
  return session.status === 'recording' ? (
    <span className="inline-flex items-center gap-1.5 rounded-full bg-rec/15 px-2 py-0.5 text-xs font-medium text-rec">
      <span className="rec-dot" /> Recording
    </span>
  ) : (
    <span className="rounded-full bg-panel-2 px-2 py-0.5 text-xs text-muted">Completed</span>
  );
}

export function Empty({ title, children }: { title: string; children?: ReactNode }) {
  return (
    <div className="flex flex-col items-center justify-center gap-2 p-8 text-center">
      <p className="text-sm font-medium">{title}</p>
      {children && <div className="text-xs text-muted">{children}</div>}
    </div>
  );
}

const SPEAKER_PALETTE = [
  { text: 'text-sky-300', bg: 'bg-sky-950', ring: 'ring-sky-700' },
  { text: 'text-emerald-300', bg: 'bg-emerald-950', ring: 'ring-emerald-700' },
  { text: 'text-amber-300', bg: 'bg-amber-950', ring: 'ring-amber-700' },
  { text: 'text-fuchsia-300', bg: 'bg-fuchsia-950', ring: 'ring-fuchsia-700' },
  { text: 'text-rose-300', bg: 'bg-rose-950', ring: 'ring-rose-700' },
  { text: 'text-lime-300', bg: 'bg-lime-950', ring: 'ring-lime-700' },
  { text: 'text-violet-300', bg: 'bg-violet-950', ring: 'ring-violet-700' },
  { text: 'text-cyan-300', bg: 'bg-cyan-950', ring: 'ring-cyan-700' },
];

export function speakerStyle(name: string) {
  let h = 0;
  for (const ch of name) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  return SPEAKER_PALETTE[h % SPEAKER_PALETTE.length]!;
}

export function speakerColor(name: string): string {
  return speakerStyle(name).text;
}

export function Avatar({ name, size = 'md' }: { name: string; size?: 'sm' | 'md' }) {
  const style = speakerStyle(name);
  const initials = name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0]!.toUpperCase())
    .join('');
  const dims = size === 'sm' ? 'h-6 w-6 text-[10px]' : 'h-8 w-8 text-xs';
  return (
    <span className={`inline-flex shrink-0 items-center justify-center rounded-full font-semibold ring-1 ${dims} ${style.bg} ${style.text} ${style.ring}`} aria-hidden>
      {initials || '?'}
    </span>
  );
}

/** Consecutive entries from the same speaker within a short gap are shown as one turn. */
const GROUP_GAP_MS = 90_000;

interface Turn {
  speaker: string;
  startedAt: number;
  entries: TranscriptEntry[];
}

function groupTurns(entries: TranscriptEntry[]): Turn[] {
  const turns: Turn[] = [];
  for (const entry of entries) {
    const last = turns.at(-1);
    const lastEntry = last?.entries.at(-1);
    if (last && lastEntry && last.speaker === entry.speaker && entry.startedAt - lastEntry.startedAt < GROUP_GAP_MS) {
      last.entries.push(entry);
    } else {
      turns.push({ speaker: entry.speaker, startedAt: entry.startedAt, entries: [entry] });
    }
  }
  return turns;
}

export function TranscriptList({
  entries,
  startedAt,
  compact = false,
  highlight,
}: {
  entries: TranscriptEntry[];
  startedAt: number;
  compact?: boolean;
  highlight?: string;
}) {
  if (entries.length === 0) return <Empty title="No captions yet">Captions appear here as people speak.</Empty>;
  const turns = groupTurns(entries);
  return (
    <ol className={compact ? 'space-y-3' : 'space-y-5'}>
      {turns.map((turn) => {
        const style = speakerStyle(turn.speaker);
        return (
          <li key={turn.entries[0]!.id} className="flex gap-3">
            <Avatar name={turn.speaker} size={compact ? 'sm' : 'md'} />
            <div className="min-w-0 flex-1">
              <div className="mb-1 flex items-baseline gap-2">
                <span className={`truncate text-xs font-semibold ${style.text}`}>{turn.speaker}</span>
                <span className="shrink-0 text-[11px] tabular-nums text-muted" title={formatTime(turn.startedAt)}>
                  {formatClock(turn.startedAt - startedAt)}
                </span>
              </div>
              <div className={compact ? 'space-y-1' : 'space-y-1.5'}>
                {turn.entries.map((entry) => (
                  <p key={entry.id} className={`${compact ? 'text-[13px]' : 'text-[15px]'} leading-relaxed text-fg/90`} title={formatClock(entry.startedAt - startedAt)}>
                    <Highlighted text={entry.text} query={highlight} />
                  </p>
                ))}
              </div>
            </div>
          </li>
        );
      })}
    </ol>
  );
}

function Highlighted({ text, query }: { text: string; query?: string }) {
  if (!query?.trim()) return <>{text}</>;
  const parts = text.split(new RegExp(`(${escapeRegExp(query.trim())})`, 'ig'));
  return (
    <>
      {parts.map((part, i) =>
        part.toLowerCase() === query.trim().toLowerCase() ? (
          <mark key={i} className="rounded bg-amber-400/30 text-fg">
            {part}
          </mark>
        ) : (
          part
        ),
      )}
    </>
  );
}

function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/** Two avatars + "+N" summary; the full list is in the tooltip and in a popover when onSelect is given. */
export function ParticipantsStack({
  names,
  shown = 2,
  selected,
  onSelect,
}: {
  names: string[];
  shown?: number;
  selected?: string | null;
  onSelect?: (name: string | null) => void;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (!ref.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', onDown);
    return () => document.removeEventListener('mousedown', onDown);
  }, [open]);

  if (names.length === 0) return null;
  const rest = names.length - shown;
  const selectedName = selected && names.find((n) => n.toLowerCase() === selected.toLowerCase());

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        className={`inline-flex items-center gap-2 rounded-full border py-0.5 pr-2.5 pl-0.5 text-xs transition-colors hover:border-accent/50 ${
          selectedName ? 'border-accent bg-accent/10' : 'border-line bg-panel-2/60'
        }`}
        title={names.join(', ')}
        onClick={() => (onSelect ? setOpen((v) => !v) : undefined)}
      >
        <span className="flex -space-x-1.5">
          {(selectedName ? [selectedName] : names.slice(0, shown)).map((name) => (
            <span key={name} className="rounded-full ring-2 ring-panel">
              <Avatar name={name} size="sm" />
            </span>
          ))}
        </span>
        <span className="text-muted">
          {selectedName ? <span className="text-fg">{selectedName}</span> : rest > 0 ? `+${rest}` : names.length === 1 ? names[0] : `${names.length}`}
        </span>
      </button>
      {open && onSelect && (
        <div className="absolute right-0 z-20 mt-1 min-w-52 overflow-hidden rounded-md border border-line bg-panel p-1 shadow-2xl">
          <p className="px-2 py-1 text-[11px] font-semibold uppercase tracking-wide text-muted">Filter by speaker</p>
          {names.map((name) => {
            const active = selectedName === name;
            return (
              <button
                key={name}
                type="button"
                className={`flex w-full items-center gap-2 rounded px-2 py-1.5 text-left text-sm hover:bg-panel-2 ${active ? 'text-accent' : ''}`}
                onClick={() => {
                  onSelect(active ? null : name);
                  setOpen(false);
                }}
              >
                <Avatar name={name} size="sm" />
                <span className="flex-1 truncate">{name}</span>
                {active && <span className="text-[11px]">on</span>}
              </button>
            );
          })}
          {selectedName && (
            <button type="button" className="mt-1 w-full rounded px-2 py-1.5 text-left text-xs text-muted hover:bg-panel-2" onClick={() => { onSelect(null); setOpen(false); }}>
              Clear filter
            </button>
          )}
        </div>
      )}
    </div>
  );
}
