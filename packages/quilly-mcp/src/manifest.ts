// The desktop-extension (MCPB) manifest, generated at pack time from package.json
// and the same catalogue and protocol constants the server runs on. Claude Desktop
// reads it to show the install dialog, ask for the pairing token and start the server.
import { SUMMARY, TOOLS, USER_CONFIG, USER_CONFIG_ENV } from './catalog';

/** Path of the bundled server inside the archive. */
export const SERVER_ENTRY = 'server/index.js';
/** Path of the icon inside the archive. */
export const ICON = 'icon.png';

/** The fields of package.json the generated manifests and listings are built from. */
export interface PackageInfo {
  name: string;
  version: string;
  /** The server's name in the MCP registry; the registry checks it against the published npm package. */
  mcpName: string;
  license: string;
  author: string;
  keywords: string[];
  homepage: string;
  repository: { type: string; url: string; directory: string };
  engines: { node: string };
}

/** Where a listing sends people, derived from the repository URL. */
export function links(pkg: PackageInfo) {
  const repository = pkg.repository.url;
  return {
    repository,
    author: { name: pkg.author, url: repository.replace(/\/[^/]+$/, '') },
    documentation: pkg.homepage,
    support: `${repository}/issues`,
  };
}

export function buildManifest(pkg: PackageInfo) {
  const { repository, author, documentation, support } = links(pkg);
  return {
    manifest_version: '0.3',
    name: pkg.name,
    display_name: 'Quilly',
    version: pkg.version,
    description: SUMMARY,
    long_description:
      'Gives Claude read access to the transcripts the Quilly Chrome extension records from Google Meet: list and search ' +
      'meetings, read a transcript, and follow the call being recorded as people speak. The extension connects to this ' +
      'server over localhost and answers each request from its own database, so nothing is exported and nothing leaves ' +
      'your computer.\n\n' +
      'Setup: in Chrome open Quilly → Settings → Local agents, switch on "Allow local agents to read transcripts" and ' +
      'paste the pairing token shown there into this extension’s settings.',
    author,
    repository: { type: pkg.repository.type, url: repository },
    homepage: repository,
    documentation,
    support,
    icon: ICON,
    license: pkg.license,
    keywords: pkg.keywords,
    server: {
      type: 'node',
      entry_point: SERVER_ENTRY,
      mcp_config: {
        command: 'node',
        args: [`\${__dirname}/${SERVER_ENTRY}`],
        env: USER_CONFIG_ENV,
      },
    },
    user_config: USER_CONFIG,
    tools: Object.entries(TOOLS).map(([name, tool]) => ({ name, description: tool.title })),
    compatibility: { platforms: ['darwin', 'win32', 'linux'], runtimes: { node: pkg.engines.node } },
  };
}
