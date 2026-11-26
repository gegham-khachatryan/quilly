import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { AGENT_BRIDGE_DEFAULT_PORT } from '../../../src/shared/agentProtocol';
import { Bridge } from './bridge';
import { ENV, PORT_RANGE } from './catalog';
import { createMcpServer } from './server';

const VERSION = __QUILLY_MCP_VERSION__;

// stdout carries the MCP stream; everything human-readable goes to stderr.
const log = (line: string) => process.stderr.write(`quilly-mcp: ${line}\n`);

const token = process.env[ENV.token]?.trim();
if (!token) {
  log(`${ENV.token} is not set. Copy the pairing token from Quilly → Settings → Local agents.`);
  process.exit(2);
}
// A client that fills the variable from an empty optional field passes a blank string; that means the default too.
const requestedPort = process.env[ENV.port]?.trim();
const port = requestedPort ? Number(requestedPort) : AGENT_BRIDGE_DEFAULT_PORT;
if (!Number.isInteger(port) || port < PORT_RANGE.min || port > PORT_RANGE.max) {
  log(`${ENV.port} must be a port between ${PORT_RANGE.min} and ${PORT_RANGE.max}, got "${requestedPort}".`);
  process.exit(2);
}

const bridge = await Bridge.listen(token, port, { name: 'quilly-mcp', version: VERSION, agent: null }, log);
log(`listening for the Quilly extension on 127.0.0.1:${bridge.port}`);

const server = createMcpServer(bridge, VERSION);
await server.connect(new StdioServerTransport());

const shutdown = () => {
  bridge.close();
  void server.close().finally(() => process.exit(0));
};
process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
process.stdin.on('close', shutdown);
