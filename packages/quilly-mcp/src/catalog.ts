// What the server offers and what it is configured with, as data: the CLI and the
// MCP server read it at run time and the desktop-extension manifest is generated
// from it, so a client's install dialog and the running server cannot disagree.

/** Environment variables the CLI is configured through. */
export const ENV = { token: 'QUILLY_TOKEN', port: 'QUILLY_PORT' } as const;

/** Ports the bridge may listen on: unprivileged ones. */
export const PORT_RANGE = { min: 1024, max: 65535 } as const;

export const SERVER_INSTRUCTIONS =
  'Quilly records Google Meet captions into local transcripts. Use list_sessions to find a meeting, get_session to read ' +
  'its transcript, search_transcripts to find who said what across meetings, and wait_for_updates to follow a meeting ' +
  'that is still being recorded. Everything is read-only and served live from the Quilly extension in Chrome.';

/** Every tool reads from the user's own transcripts and changes nothing: no side effects, no outside world. */
const READ_ONLY = { readOnlyHint: true, openWorldHint: false } as const;

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
