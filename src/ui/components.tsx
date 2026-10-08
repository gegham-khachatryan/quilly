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

const SPEAKER_COLORS = ['text-sky-300', 'text-emerald-300', 'text-amber-300', 'text-fuchsia-300', 'text-rose-300', 'text-lime-300', 'text-violet-300', 'text-cyan-300'];

export function speakerColor(name: string): string {
  let h = 0;
  for (const ch of name) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  return SPEAKER_COLORS[h % SPEAKER_COLORS.length] ?? SPEAKER_COLORS[0]!;
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
  return (
    <ol className={compact ? 'space-y-2' : 'space-y-3'}>
      {entries.map((entry, i) => {
        const prev = entries[i - 1];
        const sameSpeaker = prev?.speaker === entry.speaker;
        return (
          <li key={entry.id} className={sameSpeaker && compact ? 'pl-0' : ''}>
            {!(sameSpeaker && compact) && (
              <div className="mb-0.5 flex items-baseline gap-2">
                <span className={`text-xs font-semibold ${speakerColor(entry.speaker)}`}>{entry.speaker}</span>
                <span className="text-[11px] text-muted" title={formatTime(entry.startedAt)}>
                  {formatClock(entry.startedAt - startedAt)}
                </span>
              </div>
            )}
            <p className={`${compact ? 'text-[13px]' : 'text-sm'} leading-relaxed text-fg/90`}>
              <Highlighted text={entry.text} query={highlight} />
            </p>
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
