import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { AGENT_BRIDGE_DEFAULT_PORT } from '../../../src/shared/agentProtocol';
import { Bridge } from './bridge';
import { createMcpServer } from './server';

const VERSION = __QUILLY_MCP_VERSION__;

// stdout carries the MCP stream; everything human-readable goes to stderr.
const log = (line: string) => process.stderr.write(`quilly-mcp: ${line}\n`);

const token = process.env.QUILLY_TOKEN?.trim();
if (!token) {
  log('QUILLY_TOKEN is not set. Copy the pairing token from Quilly → Settings → Local agents.');
  process.exit(2);
}
const port = Number(process.env.QUILLY_PORT ?? AGENT_BRIDGE_DEFAULT_PORT);
if (!Number.isInteger(port) || port < 1024 || port > 65535) {
  log(`QUILLY_PORT must be a port between 1024 and 65535, got "${process.env.QUILLY_PORT}".`);
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
