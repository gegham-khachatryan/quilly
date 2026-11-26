import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import type { AgentEvent } from '../../../src/shared/agentProtocol';
import { formatClock } from '../../../src/shared/format';
import { transcriptToMarkdown, transcriptToText } from '../../../src/shared/transcript';
import type { Session, TranscriptEntry } from '../../../src/shared/types';
import type { Bridge } from './bridge';
import { SERVER_INSTRUCTIONS, TOOLS } from './catalog';

const DEFAULT_LIST_LIMIT = 20;
const DEFAULT_SEARCH_LIMIT = 50;
const DEFAULT_WAIT_SECONDS = 30;
const MAX_WAIT_SECONDS = 120;

const sessionStatus = z.enum(['recording', 'completed']);
const transcriptFormat = z.enum(['text', 'markdown', 'json']);

export function createMcpServer(bridge: Bridge, version: string): McpServer {
  const server = new McpServer({ name: 'quilly', version }, { instructions: SERVER_INSTRUCTIONS });

  server.server.oninitialized = () => bridge.setAgent(server.server.getClientVersion()?.name ?? null);

  server.registerTool(
    'list_sessions',
    {
      ...TOOLS.list_sessions,
      inputSchema: {
        query: z.string().optional().describe('Text to match against title, meeting code and participants'),
        speaker: z.string().optional().describe('Only sessions where this person spoke (exact name as Meet shows it)'),
        status: sessionStatus.optional(),
        limit: z.number().int().positive().max(200).optional().describe(`Default ${DEFAULT_LIST_LIMIT}`),
      },
    },
    async ({ query, speaker, status, limit }) => {
      const sessions = await bridge.listSessions({ type: 'sessions/list', query, speaker, status, limit: limit ?? DEFAULT_LIST_LIMIT });
      return json(sessions.map(summarize));
    },
  );

  server.registerTool(
    'get_session',
    {
      ...TOOLS.get_session,
      inputSchema: {
        session_id: z.string(),
        format: transcriptFormat.optional().describe('Default "text": one timestamped line per entry'),
        updated_after: z.number().int().nonnegative().optional().describe('Cursor from an earlier call'),
      },
    },
    async ({ session_id, format, updated_after }) => {
      const session = await bridge.getSession(session_id);
      if (!session) return failure(`No session with id ${session_id}.`);
      const entries = await bridge.listEntries({ type: 'entries/list', sessionId: session.id, updatedAfter: updated_after });
      return text(renderSession(session, entries, format ?? 'text', updated_after));
    },
  );

  server.registerTool(
    'wait_for_updates',
    {
      ...TOOLS.wait_for_updates,
      inputSchema: {
        session_id: z.string(),
        cursor: z.number().int().nonnegative().describe('Cursor from get_session or the previous wait_for_updates'),
        timeout_seconds: z.number().int().positive().max(MAX_WAIT_SECONDS).optional().describe(`Default ${DEFAULT_WAIT_SECONDS}`),
      },
    },
    async ({ session_id, cursor, timeout_seconds }) => {
      let session = await bridge.getSession(session_id);
      if (!session) return failure(`No session with id ${session_id}.`);
      let entries = await bridge.listEntries({ type: 'entries/list', sessionId: session.id, updatedAfter: cursor });
      if (entries.length === 0 && session.status === 'recording') {
        const concerns = (event: AgentEvent) => (event.type === 'entries/changed' ? event.sessionId === session_id : event.sessionId === session_id || !event.sessionId);
        await bridge.waitForEvent(concerns, (timeout_seconds ?? DEFAULT_WAIT_SECONDS) * 1000);
        session = (await bridge.getSession(session_id)) ?? session;
        entries = await bridge.listEntries({ type: 'entries/list', sessionId: session.id, updatedAfter: cursor });
      }
      const next = Math.max(cursor, ...entries.map((e) => e.updatedAt));
      const lines = entries.length ? transcriptToText(session, entries) : '(no changes)';
      return text(`${statusLine(session)}\n${lines}\n\ncursor: ${next}`);
    },
  );

  server.registerTool(
    'search_transcripts',
    {
      ...TOOLS.search_transcripts,
      inputSchema: {
        query: z.string().min(1),
        session_id: z.string().optional(),
        speaker: z.string().optional().describe('Exact name as Meet shows it'),
        limit: z.number().int().positive().max(500).optional().describe(`Default ${DEFAULT_SEARCH_LIMIT}`),
      },
    },
    async ({ query, session_id, speaker, limit }) => {
      const matches = await bridge.search({ type: 'transcript/search', query, sessionId: session_id, speaker, limit: limit ?? DEFAULT_SEARCH_LIMIT });
      if (matches.length === 0) return text('No matches.');
      const bySession = new Map<string, { session: Session; entries: TranscriptEntry[] }>();
      for (const { session, entry } of matches) {
        const group = bySession.get(session.id) ?? { session, entries: [] };
        group.entries.push(entry);
        bySession.set(session.id, group);
      }
      const blocks = Array.from(bySession.values()).map(({ session, entries }) => `## ${titleOf(session)} (${session.id})\n${transcriptToText(session, entries)}`);
      return text(blocks.join('\n\n'));
    },
  );

  return server;
}

function summarize(session: Session) {
  return {
    id: session.id,
    title: titleOf(session),
    meetingCode: session.meetingCode,
    status: session.status,
    startedAt: new Date(session.startedAt).toISOString(),
    endedAt: session.endedAt ? new Date(session.endedAt).toISOString() : null,
    durationMinutes: Math.round(((session.endedAt ?? Date.now()) - session.startedAt) / 60_000),
    speakers: session.speakers,
    captions: session.entryCount,
    events: session.eventCount,
  };
}

function renderSession(session: Session, entries: TranscriptEntry[], format: 'text' | 'markdown' | 'json', updatedAfter: number | undefined): string {
  const cursor = Math.max(updatedAfter ?? 0, ...entries.map((e) => e.updatedAt));
  if (format === 'json') return JSON.stringify({ session, entries, cursor }, null, 2);
  const body = format === 'markdown' ? transcriptToMarkdown(session, entries) : `${header(session)}\n\n${entries.length ? transcriptToText(session, entries) : '(no entries yet)'}`;
  const follow = session.status === 'recording' ? ` — still recording; call wait_for_updates with this cursor to follow` : '';
  return `${body}\n\ncursor: ${cursor}${follow}`;
}

function header(session: Session): string {
  return [
    `# ${titleOf(session)}`,
    `id: ${session.id}`,
    `meeting: ${session.meetingCode}`,
    statusLine(session),
    `started: ${new Date(session.startedAt).toISOString()}`,
    session.endedAt ? `ended: ${new Date(session.endedAt).toISOString()}` : null,
    `participants: ${session.speakers.join(', ') || '(none yet)'}`,
    `captions: ${session.entryCount}, events: ${session.eventCount}`,
  ]
    .filter((line): line is string => line !== null)
    .join('\n');
}

function statusLine(session: Session): string {
  return session.status === 'recording' ? `status: recording (${formatClock(Date.now() - session.startedAt)} so far)` : 'status: completed';
}

function titleOf(session: Session): string {
  return session.title || session.meetingCode;
}

function text(value: string) {
  return { content: [{ type: 'text' as const, text: value }] };
}

function json(value: unknown) {
  return text(JSON.stringify(value, null, 2));
}

function failure(message: string) {
  return { content: [{ type: 'text' as const, text: message }], isError: true };
}
