export function formatClock(ms: number): string {
  const total = Math.max(0, Math.floor(ms / 1000));
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  const mm = String(m).padStart(2, '0');
  const ss = String(s).padStart(2, '0');
  return h > 0 ? `${h}:${mm}:${ss}` : `${mm}:${ss}`;
}

/** Human duration for lists: "42s", "1m 18s", "1h 05m". Live sessions count from now. */
export function formatDuration(startedAt: number, endedAt: number | null): string {
  const total = Math.max(0, Math.floor(((endedAt ?? Date.now()) - startedAt) / 1000));
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  if (h > 0) return `${h}h ${String(m).padStart(2, '0')}m`;
  if (m > 0) return `${m}m ${String(s).padStart(2, '0')}s`;
  return `${s}s`;
}

const timeFmt = new Intl.DateTimeFormat(undefined, { hour: '2-digit', minute: '2-digit' });
const weekdayFmt = new Intl.DateTimeFormat(undefined, { weekday: 'short', day: 'numeric', month: 'short' });
const fullFmt = new Intl.DateTimeFormat(undefined, { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' });

function startOfDay(ts: number): number {
  const d = new Date(ts);
  d.setHours(0, 0, 0, 0);
  return d.getTime();
}

/** Friendly absolute date: "Today, 17:30" · "Yesterday, 09:15" · "Mon 6 Oct, 10:00" · "Tue 3 Mar 2025, 14:00". */
export function formatDateTime(ts: number, now = Date.now()): string {
  const days = Math.round((startOfDay(now) - startOfDay(ts)) / 86_400_000);
  const time = timeFmt.format(ts);
  if (days === 0) return `Today, ${time}`;
  if (days === 1) return `Yesterday, ${time}`;
  if (days === -1) return `Tomorrow, ${time}`;
  const sameYear = new Date(ts).getFullYear() === new Date(now).getFullYear();
  return `${(sameYear ? weekdayFmt : fullFmt).format(ts)}, ${time}`;
}

/** Friendly relative time for compact rows: "just now", "5 min ago", "2 h ago", then falls back to the date. */
export function formatRelative(ts: number, now = Date.now()): string {
  const diff = Math.max(0, now - ts);
  const min = Math.round(diff / 60_000);
  if (min < 1) return 'just now';
  if (min < 60) return `${min} min ago`;
  const hours = Math.round(min / 60);
  if (hours < 24 && startOfDay(ts) === startOfDay(now)) return `${hours} h ago`;
  return formatDateTime(ts, now);
}

export function formatTime(ts: number): string {
  return new Date(ts).toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit', second: '2-digit' });
}

export function newId(): string {
  return crypto.randomUUID();
}

export function pluralize(count: number, singular: string, plural = `${singular}s`): string {
  return `${count} ${count === 1 ? singular : plural}`;
}
