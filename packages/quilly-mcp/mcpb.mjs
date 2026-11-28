// Packs the server as a desktop extension: release/quilly-mcp-v<version>.mcpb at the
// repository root. Claude Desktop installs that file from Settings → Extensions and
// asks for the pairing token in a dialog, so nobody has to edit a JSON config.
//
// Unlike the npm package, the archive has to run with no install step, so npm
// dependencies are bundled into the one server file. The manifest is generated
// from src/manifest.ts and validated by the packer.
import { packExtension } from '@anthropic-ai/mcpb';
import { build } from 'esbuild';
import { cpSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { cliOptions, importTs, packageDir, pkg } from './esbuild.config.mjs';

const root = resolve(packageDir, '..', '..');
const releaseDir = join(root, 'release');
const stage = join(releaseDir, 'mcpb-stage');
const output = join(releaseDir, `${pkg.name}-v${pkg.version}.mcpb`);

const { buildManifest, SERVER_ENTRY, ICON } = await importTs('src/manifest.ts');

rmSync(stage, { recursive: true, force: true });
mkdirSync(stage, { recursive: true });
try {
  await build({
    ...cliOptions,
    outfile: join(stage, SERVER_ENTRY),
    // ws loads these two native accelerators only if they are installed; it works without them.
    external: ['bufferutil', 'utf-8-validate'],
    // The bundled CommonJS dependencies call require() for Node built-ins, which an ES module has to create.
    banner: { js: "import { createRequire as __createRequire } from 'node:module';\nconst require = __createRequire(import.meta.url);" },
  });
  writeFileSync(join(stage, 'manifest.json'), `${JSON.stringify(buildManifest(pkg), null, 2)}\n`);
  // Marks the server file as an ES module for Node.
  writeFileSync(join(stage, 'package.json'), `${JSON.stringify({ name: pkg.name, version: pkg.version, private: true, type: 'module' }, null, 2)}\n`);
  cpSync(join(packageDir, 'icon.png'), join(stage, ICON));
  cpSync(join(root, 'LICENSE'), join(stage, 'LICENSE'));

  rmSync(output, { force: true });
  if (!(await packExtension({ extensionPath: stage, outputPath: output, silent: true }))) {
    throw new Error('mcpb pack failed: the generated manifest did not validate.');
  }
} finally {
  rmSync(stage, { recursive: true, force: true });
}
console.log(`release/${pkg.name}-v${pkg.version}.mcpb`);
