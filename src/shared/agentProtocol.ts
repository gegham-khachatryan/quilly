import type { Session, SessionStatus, TranscriptEntry } from './types';

/**
 * Contract between the extension and a local agent bridge (the `quilly-mcp`
 * package). The bridge listens on localhost; the extension's service worker
 * connects to it over a WebSocket, proves it holds the pairing token, and then
 * answers read-only requests from the agent and pushes change events.
 *
 * This module is bundled into both sides, so it must stay free of `chrome.*`
 * and DOM APIs: only Web Crypto, which the service worker and Node share.
 */
export const AGENT_PROTOCOL_VERSION = 1;

/** First port a bridge tries; each bridge binds the first free one in [port, port + span). */
export const AGENT_BRIDGE_DEFAULT_PORT = 47800;
export const AGENT_BRIDGE_PORT_SPAN = 4;

/** The bridge pings at this interval; Chrome keeps the worker alive while frames arrive within 30 s. */
export const AGENT_BRIDGE_PING_MS = 20_000;

/**
 * How often the extension looks for bridges: the minimum right after local
 * agents are switched on or a bridge was found, doubling to the maximum while
 * nothing new turns up. A bridge waits for the maximum before failing a tool
 * call with "not connected", so a probe is guaranteed to fall inside the wait.
 */
export const AGENT_BRIDGE_PROBE_MIN_MS = 30_000;
export const AGENT_BRIDGE_PROBE_MAX_MS = 120_000;

// ---- requests: bridge -> extension ------------------------------------------
export type AgentRequest =
  | { type: 'sessions/list'; query?: string; speaker?: string; status?: SessionStatus; limit?: number }
  | { type: 'sessions/get'; sessionId: string }
  /**
   * Entries of a session in seq order. `updatedAfter` (ms epoch) narrows it to
   * entries added or changed since then: the caption block being spoken keeps
   * its seq while its text grows, so a time cursor is what a live follower needs.
   */
  | { type: 'entries/list'; sessionId: string; updatedAfter?: number }
  | { type: 'transcript/search'; query: string; sessionId?: string; speaker?: string; limit?: number };

export interface TranscriptMatch {
  session: Session;
  entry: TranscriptEntry;
}

export type AgentResponse = {
  'sessions/list': Session[];
  'sessions/get': Session | null;
  'entries/list': TranscriptEntry[];
  'transcript/search': TranscriptMatch[];
};

// ---- events: extension -> bridge (fire and forget) --------------------------
export type AgentEvent = { type: 'sessions/changed'; sessionId?: string } | { type: 'entries/changed'; sessionId: string };

// ---- wire frames -------------------------------------------------------------
/**
 * Handshake, in order:
 *   extension -> bridge  hello     (protocol version, extension nonce)
 *   bridge -> extension  challenge (bridge nonce, proof over the extension nonce)
 *   extension -> bridge  auth      (proof over the bridge nonce)  — only after the bridge's proof checked out
 *   bridge -> extension  ready
 * Either side closes with `reject` when a proof or version does not match.
 * Both proofs are HMAC-SHA256 over the peer's nonce, keyed with the pairing token.
 */
export type ExtensionFrame =
  | { type: 'hello'; version: number; nonce: string }
  | { type: 'auth'; proof: string }
  | { type: 'response'; id: number; result: unknown }
  | { type: 'response'; id: number; error: string }
  | { type: 'event'; event: AgentEvent }
  | { type: 'pong' };

export type BridgeFrame =
  | { type: 'challenge'; version: number; nonce: string; proof: string }
  | { type: 'ready'; bridge: BridgeIdentity }
  /** Sent again when the bridge learns which agent is on the other end (after MCP initialize). */
  | { type: 'identify'; bridge: BridgeIdentity }
  | { type: 'reject'; reason: string }
  | { type: 'request'; id: number; request: AgentRequest }
  | { type: 'ping' };

export interface BridgeIdentity {
  name: string;
  version: string;
  /** Display name of the MCP client, e.g. "claude-code", once known. */
  agent: string | null;
}

/** Status the extension reports to its own settings page. */
export interface AgentBridgeStatus {
  enabled: boolean;
  connections: { port: number; bridge: BridgeIdentity }[];
}

// ---- crypto helpers (Web Crypto, shared by the worker and Node) --------------
const encoder = new TextEncoder();

export function randomNonce(): string {
  return toHex(crypto.getRandomValues(new Uint8Array(16)));
}

export function newPairingToken(): string {
  return toHex(crypto.getRandomValues(new Uint8Array(32)));
}

export async function proofFor(token: string, nonce: string): Promise<string> {
  const key = await crypto.subtle.importKey('raw', encoder.encode(token), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  return toHex(new Uint8Array(await crypto.subtle.sign('HMAC', key, encoder.encode(nonce))));
}

/** Constant-time comparison so a wrong proof is not distinguishable by timing. */
export function proofsMatch(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

function toHex(bytes: Uint8Array): string {
  return Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
}

export function parseFrame<T>(raw: unknown): T | null {
  if (typeof raw !== 'string') return null;
  try {
    const value: unknown = JSON.parse(raw);
    return typeof value === 'object' && value !== null && typeof (value as { type?: unknown }).type === 'string' ? (value as T) : null;
  } catch {
    return null;
  }
}

/** How the MCP server for a given client is registered; shown in Settings and the README. */
export function agentSetupCommand(token: string, port: number): string {
  const env = port === AGENT_BRIDGE_DEFAULT_PORT ? `-e QUILLY_TOKEN=${token}` : `-e QUILLY_TOKEN=${token} -e QUILLY_PORT=${port}`;
  return `claude mcp add quilly ${env} -- npx -y quilly-mcp`;
}

export function agentSetupJson(token: string, port: number): string {
  const env: Record<string, string> = { QUILLY_TOKEN: token };
  if (port !== AGENT_BRIDGE_DEFAULT_PORT) env.QUILLY_PORT = String(port);
  return JSON.stringify({ mcpServers: { quilly: { command: 'npx', args: ['-y', 'quilly-mcp'], env } } }, null, 2);
}
