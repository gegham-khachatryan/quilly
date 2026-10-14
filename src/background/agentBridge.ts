import {
  AGENT_BRIDGE_PORT_SPAN,
  AGENT_BRIDGE_PROBE_MAX_MS,
  AGENT_BRIDGE_PROBE_MIN_MS,
  AGENT_PROTOCOL_VERSION,
  parseFrame,
  proofFor,
  proofsMatch,
  randomNonce,
  type AgentBridgeStatus,
  type AgentRequest,
  type AgentResponse,
  type BridgeFrame,
  type BridgeIdentity,
  type ExtensionFrame,
  type TranscriptMatch,
} from '../shared/agentProtocol';
import { entriesRepo, sessionsRepo } from '../shared/db';
import { onBroadcast } from '../shared/messages';
import { getSettings, onSettingsChange } from '../shared/settings';
import type { Session, Settings } from '../shared/types';

/**
 * Client side of the local agent bridge (see shared/agentProtocol.ts).
 *
 * A bridge (`quilly-mcp`) cannot reach into the extension, so the worker goes
 * looking for one: every port in the configured range is probed on worker
 * start and on an alarm, and each bridge found gets its own socket. While a
 * socket is open the bridge pings every 20 s, which keeps this worker alive;
 * when none is running the worker suspends as usual and the alarm wakes it to
 * try again.
 *
 * Chrome logs every refused probe as an extension error, so the alarm backs
 * off while probes keep coming up empty: each one doubles the delay from the
 * minimum to the maximum, and finding a bridge, a settings change or the
 * settings page asking for status brings it back to the minimum. The count
 * lives in session storage because the worker is suspended between alarms.
 */
const ALARM = 'agent-bridge';
const EMPTY_PROBES_KEY = 'agentBridgeEmptyProbes';
/** The settings page polls for status every couple of seconds; it gets a fresh probe at most this often. */
const STATUS_PROBE_GAP_MS = 5_000;
/** Close codes in the application range so logs tell handshake failures apart from network ones. */
const CLOSE_BAD_PROOF = 4001;
const CLOSE_BAD_VERSION = 4002;
const CLOSE_REJECTED = 4003;
const CLOSE_RECONFIGURED = 4004;

interface Connection {
  port: number;
  socket: WebSocket;
  /** Set once the bridge's proof checked out and it reported ready. */
  bridge: BridgeIdentity | null;
}

const connections = new Map<number, Connection>();
/** Token + port the open sockets were made with; a change closes them all. Null until the first sync. */
let configKey: string | null = null;
let lastProbeAt = 0;

/**
 * When a sync probes: `always`; `throttled`, at most every STATUS_PROBE_GAP_MS
 * for a polling settings page; `unless-scheduled`, only when no alarm is
 * pending, so a worker restart does not add probes between alarms.
 */
type ProbePolicy = 'always' | 'throttled' | 'unless-scheduled';

export function startAgentBridge(): void {
  chrome.alarms.onAlarm.addListener((alarm) => {
    if (alarm.name === ALARM) void sync();
  });
  onSettingsChange((settings) => void sync(settings));
  onBroadcast((event) => {
    for (const conn of readyConnections()) send(conn.socket, { type: 'event', event });
  });
  void sync(undefined, 'unless-scheduled');
}

/** Current connections; also kicks off a probe so a page polling this sees a fresh bridge quickly. */
export async function getAgentBridgeStatus(): Promise<AgentBridgeStatus> {
  await setEmptyProbes(0); // someone is watching: back to the fast cadence
  const settings = await sync(undefined, 'throttled');
  return {
    enabled: settings.agentBridgeEnabled,
    connections: readyConnections().map((c) => ({ port: c.port, bridge: c.bridge! })),
  };
}

/** Applies the settings and, per `policy`, probes for bridges. */
async function sync(settings?: Settings, policy: ProbePolicy = 'always'): Promise<Settings> {
  const current = settings ?? (await getSettings());
  const key = current.agentBridgeEnabled && current.agentBridgeToken ? `${current.agentBridgeToken}:${current.agentBridgePort}` : '';
  if (configKey !== null && key !== configKey) {
    closeAll(CLOSE_RECONFIGURED);
    await setEmptyProbes(0);
  }
  configKey = key;
  if (!key) {
    await chrome.alarms.clear(ALARM);
    return current;
  }
  const due =
    policy === 'always' ||
    (policy === 'throttled' && Date.now() - lastProbeAt >= STATUS_PROBE_GAP_MS) ||
    (policy === 'unless-scheduled' && !(await chrome.alarms.get(ALARM)));
  if (due) await probe(current);
  return current;
}

/** Opens a socket to every port without one and schedules the next probe with the current back-off. */
async function probe(settings: Settings): Promise<void> {
  lastProbeAt = Date.now();
  for (let port = settings.agentBridgePort; port < settings.agentBridgePort + AGENT_BRIDGE_PORT_SPAN; port++) {
    if (!connections.has(port)) connect(port, settings.agentBridgeToken);
  }
  const emptyProbes = await getEmptyProbes();
  const delayMs = Math.min(AGENT_BRIDGE_PROBE_MIN_MS * 2 ** emptyProbes, AGENT_BRIDGE_PROBE_MAX_MS);
  await setEmptyProbes(emptyProbes + 1); // a bridge reporting ready resets this
  await chrome.alarms.create(ALARM, { delayInMinutes: delayMs / 60_000 });
}

async function getEmptyProbes(): Promise<number> {
  const value = (await chrome.storage.session.get(EMPTY_PROBES_KEY))[EMPTY_PROBES_KEY];
  return typeof value === 'number' ? value : 0;
}

async function setEmptyProbes(count: number): Promise<void> {
  await chrome.storage.session.set({ [EMPTY_PROBES_KEY]: count });
}

function readyConnections(): Connection[] {
  return Array.from(connections.values()).filter((c) => c.bridge !== null && c.socket.readyState === WebSocket.OPEN);
}

function closeAll(code: number): void {
  for (const conn of connections.values()) conn.socket.close(code);
  connections.clear();
}

function connect(port: number, token: string): void {
  const socket = new WebSocket(`ws://127.0.0.1:${port}/`);
  const conn: Connection = { port, socket, bridge: null };
  const nonce = randomNonce();
  connections.set(port, conn);

  socket.onopen = () => send(socket, { type: 'hello', version: AGENT_PROTOCOL_VERSION, nonce });
  socket.onmessage = (event) => {
    const frame = parseFrame<BridgeFrame>(event.data);
    if (frame) void onFrame(conn, frame, token, nonce).catch((error) => console.warn('[quilly] agent bridge frame failed:', error));
  };
  // Nothing listens on most ports most of the time; the failed open shows up as a close.
  socket.onerror = () => undefined;
  socket.onclose = () => {
    if (connections.get(port) === conn) connections.delete(port);
  };
}

async function onFrame(conn: Connection, frame: BridgeFrame, token: string, ourNonce: string): Promise<void> {
  const { socket } = conn;
  switch (frame.type) {
    case 'challenge': {
      if (frame.version !== AGENT_PROTOCOL_VERSION) return socket.close(CLOSE_BAD_VERSION);
      // The bridge proves it holds the token before this side proves anything.
      if (!proofsMatch(frame.proof, await proofFor(token, ourNonce))) return socket.close(CLOSE_BAD_PROOF);
      return send(socket, { type: 'auth', proof: await proofFor(token, frame.nonce) });
    }
    case 'ready':
      conn.bridge = frame.bridge;
      return setEmptyProbes(0);
    case 'identify':
      conn.bridge = frame.bridge;
      return;
    case 'reject':
      console.warn(`[quilly] agent bridge on port ${conn.port} rejected the connection: ${frame.reason}`);
      return socket.close(CLOSE_REJECTED);
    case 'ping':
      return send(socket, { type: 'pong' });
    case 'request': {
      if (!conn.bridge) return; // nothing is served before the handshake completes
      try {
        send(socket, { type: 'response', id: frame.id, result: await handleRequest(frame.request) });
      } catch (error) {
        send(socket, { type: 'response', id: frame.id, error: error instanceof Error ? error.message : String(error) });
      }
      return;
    }
  }
}

function send(socket: WebSocket, frame: ExtensionFrame): void {
  if (socket.readyState === WebSocket.OPEN) socket.send(JSON.stringify(frame));
}

// ---- read-only queries over the repos ---------------------------------------
async function handleRequest(request: AgentRequest): Promise<AgentResponse[AgentRequest['type']]> {
  switch (request.type) {
    case 'sessions/list': {
      const q = request.query?.trim().toLowerCase() ?? '';
      const speaker = request.speaker?.trim().toLowerCase() ?? '';
      const sessions = (await sessionsRepo.list()).filter(
        (s) =>
          (!request.status || s.status === request.status) &&
          (!speaker || s.speakers.some((name) => name.toLowerCase() === speaker)) &&
          (!q || [s.title, s.meetingCode, ...s.speakers].some((v) => v.toLowerCase().includes(q))),
      );
      return request.limit ? sessions.slice(0, request.limit) : sessions;
    }
    case 'sessions/get':
      return (await sessionsRepo.get(request.sessionId)) ?? null;
    case 'entries/list': {
      const entries = await entriesRepo.list(request.sessionId);
      const since = request.updatedAfter;
      return since === undefined ? entries : entries.filter((e) => e.updatedAt > since);
    }
    case 'transcript/search':
      return searchTranscripts(request);
  }
}

async function searchTranscripts(request: Extract<AgentRequest, { type: 'transcript/search' }>): Promise<TranscriptMatch[]> {
  const q = request.query.trim().toLowerCase();
  if (!q) return [];
  const speaker = request.speaker?.trim().toLowerCase() ?? '';
  const limit = request.limit ?? 50;
  const sessions: Session[] = request.sessionId
    ? [await sessionsRepo.get(request.sessionId)].filter((s): s is Session => s !== undefined)
    : await sessionsRepo.list();
  const matches: TranscriptMatch[] = [];
  for (const session of sessions) {
    if (speaker && !session.speakers.some((name) => name.toLowerCase() === speaker)) continue;
    for (const entry of await entriesRepo.list(session.id)) {
      if (speaker && entry.speaker.toLowerCase() !== speaker) continue;
      if (!entry.text.toLowerCase().includes(q)) continue;
      matches.push({ session, entry });
      if (matches.length >= limit) return matches;
    }
  }
  return matches;
}
