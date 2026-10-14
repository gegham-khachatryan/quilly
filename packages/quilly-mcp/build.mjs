// Bundles the CLI with the extension's shared protocol and transcript modules
// (imported relatively from ../../src/shared) so the published package carries
// one copy of the contract; npm dependencies stay external.
import { build } from 'esbuild';
import { readFileSync } from 'node:fs';

const pkg = JSON.parse(readFileSync(new URL('./package.json', import.meta.url), 'utf8'));

await build({
  entryPoints: ['src/cli.ts'],
  outfile: 'dist/cli.js',
  bundle: true,
  packages: 'external',
  platform: 'node',
  format: 'esm',
  target: 'node20',
  banner: { js: '#!/usr/bin/env node' },
  define: { __QUILLY_MCP_VERSION__: JSON.stringify(pkg.version) },
  logLevel: 'info',
});
