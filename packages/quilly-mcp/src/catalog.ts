// What the server offers and what it is configured with, as data: the CLI and the
// MCP server read it at run time, and the desktop-extension manifest, the Claude
// Code plugin and the MCP registry entry are generated from it, so a client's
// install dialog, a directory listing and the running server cannot disagree.
import { AGENT_BRIDGE_DEFAULT_PORT } from '../../../src/shared/agentProtocol';

/** One-line description for listings. The MCP registry accepts at most 100 characters. */
export const SUMMARY = 'Read Google Meet transcripts recorded by the Quilly Chrome extension, including the live meeting.';

/** Environment variables the CLI is configured through. */
export const ENV = { token: 'QUILLY_TOKEN', port: 'QUILLY_PORT' } as const;

/** Ports the bridge may listen on: unprivileged ones. */
export const PORT_RANGE = { min: 1024, max: 65535 } as const;

/**
 * The settings a client asks the user for at install time. Claude Desktop (`user_config` in the
 * MCPB manifest) and Claude Code (`userConfig` in the plugin manifest) take this same shape and
 * both substitute `${user_config.<key>}` into the server's environment.
 */
export const USER_CONFIG = {
  token: {
    type: 'string',
    title: 'Pairing token',
    description: 'Shown in Chrome under Quilly → Settings → Local agents.',
    sensitive: true,
    required: true,
  },
  port: {
    type: 'number',
    title: 'Port',
    description: 'First localhost port to try. Change it only if you changed the port in Quilly’s settings.',
    default: AGENT_BRIDGE_DEFAULT_PORT,
    min: PORT_RANGE.min,
    max: PORT_RANGE.max,
    required: false,
  },
} as const;

/** The server's environment as a client fills it from USER_CONFIG. */
export const USER_CONFIG_ENV = { [ENV.token]: '${user_config.token}', [ENV.port]: '${user_config.port}' };

/** Every tool reads from the user's own transcripts and changes nothing: no side effects, no outside world. */
const READ_ONLY = { readOnlyHint: true, openWorldHint: false } as const;

export const SERVER_INSTRUCTIONS =
  'Quilly records Google Meet captions into local transcripts. Use list_sessions to find a meeting, get_session to read ' +
  'its transcript, search_transcripts to find who said what across meetings, and wait_for_updates to follow a meeting ' +
  'that is still being recorded. Everything is read-only and served live from the Quilly extension in Chrome.';

export const TOOLS = {
  list_sessions: {
    title: 'List recorded meetings',
    description:
      'Lists Quilly sessions, newest first. Filter by free text (matched against title, meeting code and participant names), ' +
      'by an exact participant name, or by status ("recording" for meetings in progress).',
    annotations: READ_ONLY,
  },
  get_session: {
    title: 'Read a meeting transcript',
    description:
      'Returns a session with its full transcript (captions, hand raises and reactions) in the requested format. ' +
      'The response ends with a cursor; for a session that is still recording, pass it to wait_for_updates to follow along. ' +
      'Pass updated_after (a previous cursor) to get only entries added or changed since then.',
    annotations: READ_ONLY,
  },
  wait_for_updates: {
    title: 'Follow a live recording',
    description:
      'Waits until the transcript of a session gains new or changed entries after the given cursor (or until the session ends ' +
      'or the timeout passes), then returns those entries and a new cursor. Loop on it to follow a meeting as it happens. ' +
      'A caption keeps its seq while the person is still speaking, so an entry can come back again with longer text.',
    annotations: READ_ONLY,
  },
  search_transcripts: {
    title: 'Search what was said',
    description: 'Finds transcript entries containing the text, across all sessions or within one, optionally for a single speaker.',
    annotations: READ_ONLY,
  },
} as const satisfies Record<string, { title: string; description: string; annotations: typeof READ_ONLY }>;

export type ToolName = keyof typeof TOOLS;
