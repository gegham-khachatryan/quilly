// Builds the npm package's CLI. npm dependencies stay external: npm installs them.
import { build } from 'esbuild';
import { cliOptions } from './esbuild.config.mjs';

await build({
  ...cliOptions,
  outfile: 'dist/cli.js',
  packages: 'external',
  banner: { js: '#!/usr/bin/env node' },
});
