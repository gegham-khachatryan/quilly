import { createServer, type Server as HttpServer } from 'node:http';
import { WebSocketServer, type WebSocket } from 'ws';
import {
  AGENT_BRIDGE_PING_MS,
  AGENT_BRIDGE_PORT_SPAN,
  AGENT_BRIDGE_PROBE_MAX_MS,
  AGENT_PROTOCOL_VERSION,
  parseFrame,
  proofFor,
  proofsMatch,
  randomNonce,
  type AgentEvent,
  type AgentRequest,
  type AgentResponse,
  type BridgeFrame,
  type BridgeIdentity,
  type ExtensionFrame,
} from '../../../src/shared/agentProtocol';

/**
 * Server side of the agent bridge: listens on a localhost port, pairs with
 * the extension through the mutual handshake in shared/agentProtocol.ts, and
 * turns MCP tool calls into requests over the socket.
 *
 * Several Chrome profiles may each run Quilly and connect; list-like requests
 * are fanned out and merged, session-scoped ones go to whichever peer knows
 * the session.
 */
const HANDSHAKE_TIMEOUT_MS = 5_000;
const REQUEST_TIMEOUT_MS = 15_000;
/**
 * A request made before any extension has connected waits this long for one:
 * the extension probes at least this often (plus slack for alarm jitter), so
 * the first tool call after start-up succeeds instead of asking for a retry.
 * While the wait keeps timing out, as when Chrome is closed, requests fail
 * fast until a full wait has passed since the last one, so an absent extension
 * costs the agent one wait rather than one per call.
 */
const CONNECT_WAIT_MS = AGENT_BRIDGE_PROBE_MAX_MS + 10_000;

export class NotConnectedError extends Error {
  constructor(waitedMs: number) {
    const waited = waitedMs > 0 ? `No extension connected within ${Math.round(waitedMs / 1000)} seconds. ` : 'The Quilly extension is not connected. ';
    super(
      waited +
        'Make sure Chrome is running with Quilly installed, "Allow local agents to read transcripts" is on in Quilly’s settings, ' +
        'and the token there matches QUILLY_TOKEN. The extension looks for this server every 30 seconds to 2 minutes; try again shortly.',
    );
    this.name = 'NotConnectedError';
  }
}

interface Peer {
  socket: WebSocket;
  ready: boolean;
  /** Whether the pong for the last ping arrived; a silent peer is dropped on the next tick. */
  alive: boolean;
  pending: Map<number, { resolve: (value: unknown) => void; reject: (error: Error) => void; timer: NodeJS.Timeout }>;
}

type EventListener = (event: AgentEvent) => void;

export class Bridge {
  readonly port: number;
  private readonly peers = new Set<Peer>();
  private readonly listeners = new Set<EventListener>();
  /** Requests waiting for the first peer to finish its handshake. */
  private readonly connectWaiters = new Set<() => void>();
  private lastConnectWaitTimedOutAt = 0;
  private identity: BridgeIdentity;
  private nextId = 1;
  private readonly pingTimer: NodeJS.Timeout;

  private constructor(
    private readonly http: HttpServer,
    private readonly wss: WebSocketServer,
    private readonly token: string,
    identity: BridgeIdentity,
  ) {
    this.port = (http.address() as { port: number }).port;
    this.identity = identity;
    wss.on('connection', (socket) => this.accept(socket));
    this.pingTimer = setInterval(() => this.pingAll(), AGENT_BRIDGE_PING_MS);
  }

  /** Binds the first free port in [basePort, basePort + span) so several bridges can coexist. */
  static async listen(token: string, basePort: number, identity: BridgeIdentity, log: (line: string) => void): Promise<Bridge> {
    for (let port = basePort; port < basePort + AGENT_BRIDGE_PORT_SPAN; port++) {
      const http = createServer((_req, res) => {
        res.writeHead(426, { 'content-type': 'text/plain' }).end('quilly-mcp bridge: WebSocket only\n');
      });
      try {
        await new Promise<void>((resolve, reject) => {
          http.once('error', reject);
          http.listen(port, '127.0.0.1', () => {
            http.off('error', reject);
            resolve();
          });
        });
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code === 'EADDRINUSE') {
          log(`port ${port} is taken, trying the next one`);
          continue;
        }
        throw error;
      }
      return new Bridge(http, new WebSocketServer({ server: http }), token, identity);
    }
    throw new Error(`No free port in ${basePort}-${basePort + AGENT_BRIDGE_PORT_SPAN - 1}; stop another quilly-mcp or set QUILLY_PORT.`);
  }

  get connected(): boolean {
    return this.readyPeers().length > 0;
  }

  /** Tells connected extensions which agent is on this end, so their settings page can name it. */
  setAgent(agent: string | null): void {
    this.identity = { ...this.identity, agent };
    for (const peer of this.readyPeers()) send(peer.socket, { type: 'identify', bridge: this.identity });
  }

  onEvent(listener: EventListener): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  /** Resolves with the first event the predicate accepts, or null after `timeoutMs`. */
  waitForEvent(accept: (event: AgentEvent) => boolean, timeoutMs: number): Promise<AgentEvent | null> {
    return new Promise((resolve) => {
      const off = this.onEvent((event) => {
        if (!accept(event)) return;
        clearTimeout(timer);
        off();
        resolve(event);
      });
      const timer = setTimeout(() => {
        off();
        resolve(null);
      }, timeoutMs);
    });
  }

  async listSessions(request: Extract<AgentRequest, { type: 'sessions/list' }>): Promise<AgentResponse['sessions/list']> {
    const merged = (await this.fanOut(request)).flat().sort((a, b) => b.startedAt - a.startedAt);
    return request.limit ? merged.slice(0, request.limit) : merged;
  }

  async getSession(sessionId: string): Promise<AgentResponse['sessions/get']> {
    return (await this.fanOut({ type: 'sessions/get', sessionId })).find((s) => s !== null) ?? null;
  }

  async listEntries(request: Extract<AgentRequest, { type: 'entries/list' }>): Promise<AgentResponse['entries/list']> {
    return (await this.fanOut(request)).find((entries) => entries.length > 0) ?? [];
  }

  async search(request: Extract<AgentRequest, { type: 'transcript/search' }>): Promise<AgentResponse['transcript/search']> {
    const merged = (await this.fanOut(request)).flat();
    return request.limit ? merged.slice(0, request.limit) : merged;
  }

  close(): void {
    clearInterval(this.pingTimer);
    for (const peer of this.peers) peer.socket.close(1001);
    this.wss.close();
    this.http.close();
  }

  private readyPeers(): Peer[] {
    return Array.from(this.peers).filter((p) => p.ready);
  }

  private async fanOut<R extends AgentRequest>(request: R): Promise<AgentResponse[R['type']][]> {
    const peers = await this.peersForRequest();
    const results = await Promise.allSettled(peers.map((peer) => this.request<AgentResponse[R['type']]>(peer, request)));
    const values: AgentResponse[R['type']][] = [];
    let firstFailure: unknown;
    for (const result of results) {
      if (result.status === 'fulfilled') values.push(result.value as AgentResponse[R['type']]);
      else firstFailure ??= result.reason;
    }
    if (values.length === 0) throw firstFailure;
    return values;
  }

  /** Ready peers, after waiting for the extension to show up if none has yet. */
  private async peersForRequest(): Promise<Peer[]> {
    let peers = this.readyPeers();
    if (peers.length > 0) return peers;
    if (Date.now() - this.lastConnectWaitTimedOutAt < CONNECT_WAIT_MS) throw new NotConnectedError(0);
    const connected = await this.waitForPeer(CONNECT_WAIT_MS);
    peers = this.readyPeers();
    if (peers.length > 0) return peers;
    if (!connected) this.lastConnectWaitTimedOutAt = Date.now();
    throw new NotConnectedError(CONNECT_WAIT_MS);
  }

  /** Resolves true when a peer completes the handshake, false after `timeoutMs`. */
  private waitForPeer(timeoutMs: number): Promise<boolean> {
    return new Promise((resolve) => {
      const waiter = () => {
        clearTimeout(timer);
        resolve(true);
      };
      const timer = setTimeout(() => {
        this.connectWaiters.delete(waiter);
        resolve(false);
      }, timeoutMs);
      this.connectWaiters.add(waiter);
    });
  }

  private request<T>(peer: Peer, request: AgentRequest): Promise<T> {
    return new Promise<T>((resolve, reject) => {
      const id = this.nextId++;
      const timer = setTimeout(() => {
        peer.pending.delete(id);
        reject(new Error(`The Quilly extension did not answer ${request.type} within ${REQUEST_TIMEOUT_MS / 1000}s.`));
      }, REQUEST_TIMEOUT_MS);
      peer.pending.set(id, { resolve: resolve as (value: unknown) => void, reject, timer });
      send(peer.socket, { type: 'request', id, request });
    });
  }

  private accept(socket: WebSocket): void {
    const peer: Peer = { socket, ready: false, alive: true, pending: new Map() };
    const ourNonce = randomNonce();
    this.peers.add(peer);
    const handshakeTimer = setTimeout(() => {
      if (!peer.ready) socket.close(4000, 'handshake timeout');
    }, HANDSHAKE_TIMEOUT_MS);

    socket.on('message', (data) => {
      const frame = parseFrame<ExtensionFrame>(data.toString());
      if (frame) void this.onFrame(peer, frame, ourNonce).catch((error) => socket.close(4000, String(error)));
    });
    socket.on('close', () => {
      clearTimeout(handshakeTimer);
      this.peers.delete(peer);
      for (const { reject, timer } of peer.pending.values()) {
        clearTimeout(timer);
        reject(new NotConnectedError(0));
      }
      peer.pending.clear();
    });
    socket.on('error', () => undefined); // close follows
  }

  private async onFrame(peer: Peer, frame: ExtensionFrame, ourNonce: string): Promise<void> {
    switch (frame.type) {
      case 'hello': {
        if (frame.version !== AGENT_PROTOCOL_VERSION) {
          send(peer.socket, { type: 'reject', reason: `protocol ${frame.version} is not supported; update quilly-mcp or the extension` });
          return peer.socket.close(4002);
        }
        // Prove we hold the token first; the extension answers only if the proof checks out.
        return send(peer.socket, { type: 'challenge', version: AGENT_PROTOCOL_VERSION, nonce: ourNonce, proof: await proofFor(this.token, frame.nonce) });
      }
      case 'auth': {
        if (!proofsMatch(frame.proof, await proofFor(this.token, ourNonce))) {
          send(peer.socket, { type: 'reject', reason: 'pairing token does not match' });
          return peer.socket.close(4001);
        }
        peer.ready = true;
        send(peer.socket, { type: 'ready', bridge: this.identity });
        for (const waiter of this.connectWaiters) waiter();
        this.connectWaiters.clear();
        return;
      }
      case 'response': {
        const pending = peer.pending.get(frame.id);
        if (!pending) return;
        peer.pending.delete(frame.id);
        clearTimeout(pending.timer);
        if ('error' in frame) pending.reject(new Error(frame.error));
        else pending.resolve(frame.result);
        return;
      }
      case 'event':
        if (!peer.ready) return;
        for (const listener of this.listeners) listener(frame.event);
        return;
      case 'pong':
        peer.alive = true;
        return;
    }
  }

  private pingAll(): void {
    for (const peer of this.readyPeers()) {
      if (!peer.alive) {
        peer.socket.terminate();
        continue;
      }
      peer.alive = false;
      send(peer.socket, { type: 'ping' });
    }
  }
}

function send(socket: WebSocket, frame: BridgeFrame): void {
  if (socket.readyState === socket.OPEN) socket.send(JSON.stringify(frame));
}
