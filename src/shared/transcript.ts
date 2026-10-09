import { formatClock } from './format';
import type { Session, TranscriptEntry } from './types';

/** One line per entry: "Name: text" for captions, "✋ Name raised their hand" / "Name reacted 👍" for events. */
function entryLine(entry: TranscriptEntry): string {
  switch (entry.kind) {
    case 'caption':
      return `${entry.speaker}: ${entry.text}`;
    case 'hand':
      return `✋ ${entry.speaker} ${entry.text}`;
    case 'reaction':
      return `${entry.speaker} reacted ${entry.text}`;
  }
}

/** Plain-text rendering used for exports and as the AI context. */
export function transcriptToText(session: Session, entries: TranscriptEntry[]): string {
  return entries.map((e) => `[${formatClock(e.startedAt - session.startedAt)}] ${entryLine(e)}`).join('\n');
}

export function countCaptions(entries: TranscriptEntry[]): number {
  return entries.reduce((n, e) => n + (e.kind === 'caption' ? 1 : 0), 0);
}

export function transcriptToMarkdown(session: Session, entries: TranscriptEntry[]): string {
  const header = [
    `# ${session.title || session.meetingCode}`,
    '',
    `- Meeting: ${session.meetingCode}`,
    `- Started: ${new Date(session.startedAt).toLocaleString()}`,
    session.endedAt ? `- Ended: ${new Date(session.endedAt).toLocaleString()}` : null,
    session.speakers.length ? `- Participants: ${session.speakers.join(', ')}` : null,
    '',
    '## Transcript',
    '',
  ]
    .filter((l): l is string => l !== null)
    .join('\n');
  const body = entries
    .map((e) => {
      const clock = `\`${formatClock(e.startedAt - session.startedAt)}\``;
      return e.kind === 'caption' ? `**${e.speaker}** ${clock}  \n${e.text}` : `_${entryLine(e)}_ ${clock}`;
    })
    .join('\n\n');
  return `${header}${body}\n`;
}

export function transcriptToJson(session: Session, entries: TranscriptEntry[]): string {
  return JSON.stringify({ session, entries }, null, 2);
}

export type ExportFormat = 'txt' | 'md' | 'json';

export function exportFilename(session: Session, format: ExportFormat): string {
  const date = new Date(session.startedAt).toISOString().slice(0, 16).replace('T', '_').replace(':', '-');
  const slug = (session.title || session.meetingCode).replace(/[^a-z0-9-_]+/gi, '-').replace(/^-+|-+$/g, '').slice(0, 60);
  return `${date}_${slug || 'meet'}.${format}`;
}

export function renderExport(session: Session, entries: TranscriptEntry[], format: ExportFormat): string {
  switch (format) {
    case 'txt':
      return transcriptToText(session, entries);
    case 'md':
      return transcriptToMarkdown(session, entries);
    case 'json':
      return transcriptToJson(session, entries);
  }
}

export function downloadText(filename: string, content: string, mime = 'text/plain'): void {
  const url = URL.createObjectURL(new Blob([content], { type: `${mime};charset=utf-8` }));
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
