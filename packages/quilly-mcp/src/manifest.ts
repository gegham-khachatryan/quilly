// The desktop-extension (MCPB) manifest, generated at pack time from package.json
// and the same catalogue and protocol constants the server runs on. Claude Desktop
// reads it to show the install dialog, ask for the pairing token and start the server.
import { AGENT_BRIDGE_DEFAULT_PORT } from '../../../src/shared/agentProtocol';
import { ENV, PORT_RANGE, TOOLS } from './catalog';

/** Path of the bundled server inside the archive. */
export const SERVER_ENTRY = 'server/index.js';
/** Path of the icon inside the archive. */
export const ICON = 'icon.png';

export interface PackageInfo {
  name: string;
  version: string;
  description: string;
  license: string;
  author: string;
  keywords: string[];
  homepage: string;
  repository: { type: string; url: string };
  engines: { node: string };
}

export function buildManifest(pkg: PackageInfo) {
  return {
    manifest_version: '0.3',
    name: pkg.name,
    display_name: 'Quilly',
    version: pkg.version,
    description: 'Read the Google Meet transcripts recorded by the Quilly Chrome extension, including the meeting in progress.',
    long_description:
      'Gives Claude read access to the transcripts the Quilly Chrome extension records from Google Meet: list and search ' +
      'meetings, read a transcript, and follow the call being recorded as people speak. The extension connects to this ' +
      'server over localhost and answers each request from its own database, so nothing is exported and nothing leaves ' +
      'your computer.\n\n' +
      'Setup: in Chrome open Quilly → Settings → Local agents, switch on "Allow local agents to read transcripts" and ' +
      'paste the pairing token shown there into this extension’s settings.',
    author: { name: pkg.author, url: pkg.repository.url.replace(/\/[^/]+$/, '') },
    repository: { type: pkg.repository.type, url: pkg.repository.url },
    homepage: pkg.repository.url,
    documentation: pkg.homepage,
    support: `${pkg.repository.url}/issues`,
    icon: ICON,
    license: pkg.license,
    keywords: pkg.keywords,
    server: {
      type: 'node',
      entry_point: SERVER_ENTRY,
      mcp_config: {
        command: 'node',
        args: [`\${__dirname}/${SERVER_ENTRY}`],
        env: { [ENV.token]: '${user_config.token}', [ENV.port]: '${user_config.port}' },
      },
    },
    user_config: {
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
    },
    tools: Object.entries(TOOLS).map(([name, tool]) => ({ name, description: tool.title })),
    compatibility: { platforms: ['darwin', 'win32', 'linux'], runtimes: { node: pkg.engines.node } },
  };
}
