// Zips the build into release/quilly-v<version>.zip for upload to the Chrome Web Store.
// Run `npm run build` first (or `npm run release`, which does both).
//
// The zip is built from a staging copy of dist/ with the manifest `key` removed:
// the Web Store rejects uploads that carry one, and the store assigns the public
// extension its own ID. The key stays in dist/ so the unpacked developer build keeps
// a stable ID (and its local data) regardless of the folder it is loaded from.
import { execFileSync } from 'node:child_process';
import { cpSync, existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';

const root = resolve(import.meta.dirname, '..');
const dist = join(root, 'dist');
if (!existsSync(join(dist, 'manifest.json'))) throw new Error('dist/manifest.json missing: run `npm run build` first.');

const pkg = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8'));
const releaseDir = join(root, 'release');
const stage = join(releaseDir, 'stage');
rmSync(stage, { recursive: true, force: true });
mkdirSync(releaseDir, { recursive: true });
cpSync(dist, stage, { recursive: true });

const manifestPath = join(stage, 'manifest.json');
const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'));
if (manifest.version !== pkg.version) {
  throw new Error(`Version mismatch: package.json ${pkg.version} vs manifest ${manifest.version}. Run \`npm run sync-version\`.`);
}
delete manifest.key;
writeFileSync(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`);

const zip = join(releaseDir, `quilly-v${pkg.version}.zip`);
rmSync(zip, { force: true });
try {
  // -X drops macOS resource forks; .DS_Store and maps are excluded explicitly.
  execFileSync('zip', ['-r', '-X', '-q', zip, '.', '-x', '*.DS_Store', '*.map'], { cwd: stage, stdio: 'inherit' });
} finally {
  rmSync(stage, { recursive: true, force: true });
}
console.log(`release/quilly-v${pkg.version}.zip`);
