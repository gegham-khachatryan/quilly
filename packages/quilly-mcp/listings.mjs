// Writes the committed files that list the server: the Claude Code plugin, the
// marketplace that offers it and the MCP registry entry (see src/listings.ts).
// Run it after changing the version, the catalogue or the icon.
//
//   node listings.mjs           write the files
//   node listings.mjs --check   fail if a file on disk differs from what would be written
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { importTs, packageDir, pkg } from './esbuild.config.mjs';

const root = resolve(packageDir, '..', '..');
const { buildPlugin, buildMarketplace, buildRegistryEntry, PLUGIN_DIR, PLUGIN_ICON } = await importTs('src/listings.ts');

const json = (value) => Buffer.from(`${JSON.stringify(value, null, 2)}\n`);
const files = {
  [`${PLUGIN_DIR}/.claude-plugin/plugin.json`]: json(buildPlugin(pkg)),
  [`${PLUGIN_DIR}/${PLUGIN_ICON}`]: readFileSync(join(packageDir, 'icon.png')),
  '.claude-plugin/marketplace.json': json(buildMarketplace(pkg)),
  'packages/quilly-mcp/server.json': json(buildRegistryEntry(pkg)),
};

const check = process.argv.includes('--check');
const stale = [];
for (const [path, content] of Object.entries(files)) {
  const target = join(root, path);
  if (existsSync(target) && readFileSync(target).equals(content)) continue;
  stale.push(path);
  if (check) continue;
  mkdirSync(dirname(target), { recursive: true });
  writeFileSync(target, content);
  console.log(path);
}
if (check && stale.length > 0) {
  console.error(`Out of date: ${stale.join(', ')}. Run \`npm run listings -w ${pkg.name}\` and commit the result.`);
  process.exit(1);
}
