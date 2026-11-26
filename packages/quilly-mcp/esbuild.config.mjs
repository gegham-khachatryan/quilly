// Shared esbuild settings for the two artefacts built from src/cli.ts: the npm
// package (build.mjs) and the desktop-extension bundle (mcpb.mjs). Both inline the
// extension's shared protocol and transcript modules (imported relatively from
// ../../src/shared) so each artefact carries one copy of the contract.
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

export const packageDir = fileURLToPath(new URL('.', import.meta.url));
export const pkg = JSON.parse(readFileSync(new URL('./package.json', import.meta.url), 'utf8'));

export const cliOptions = {
  absWorkingDir: packageDir,
  entryPoints: ['src/cli.ts'],
  bundle: true,
  platform: 'node',
  format: 'esm',
  target: 'node20',
  define: { __QUILLY_MCP_VERSION__: JSON.stringify(pkg.version) },
  logLevel: 'info',
};
