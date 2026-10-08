import type { ReactNode } from 'react';
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
  { text: 'text-sky-300', bg: 'bg-sky-500/20', ring: 'ring-sky-400/40' },
  { text: 'text-emerald-300', bg: 'bg-emerald-500/20', ring: 'ring-emerald-400/40' },
  { text: 'text-amber-300', bg: 'bg-amber-500/20', ring: 'ring-amber-400/40' },
  { text: 'text-fuchsia-300', bg: 'bg-fuchsia-500/20', ring: 'ring-fuchsia-400/40' },
  { text: 'text-rose-300', bg: 'bg-rose-500/20', ring: 'ring-rose-400/40' },
  { text: 'text-lime-300', bg: 'bg-lime-500/20', ring: 'ring-lime-400/40' },
  { text: 'text-violet-300', bg: 'bg-violet-500/20', ring: 'ring-violet-400/40' },
  { text: 'text-cyan-300', bg: 'bg-cyan-500/20', ring: 'ring-cyan-400/40' },
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
