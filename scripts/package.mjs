// Zips dist/ into release/quilly-v<version>.zip for upload to the Chrome Web Store.
// Run `npm run build` first (or `npm run release`, which does both).
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, rmSync } from 'node:fs';
import { join, resolve } from 'node:path';

const root = resolve(import.meta.dirname, '..');
const dist = join(root, 'dist');
const manifestPath = join(dist, 'manifest.json');
if (!existsSync(manifestPath)) throw new Error('dist/manifest.json missing: run `npm run build` first.');

const pkg = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8'));
const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'));
if (manifest.version !== pkg.version) {
  throw new Error(`Version mismatch: package.json ${pkg.version} vs manifest ${manifest.version}. Run \`npm run sync-version\`.`);
}

const releaseDir = join(root, 'release');
mkdirSync(releaseDir, { recursive: true });
const zip = join(releaseDir, `quilly-v${pkg.version}.zip`);
rmSync(zip, { force: true });
// -X drops macOS resource forks; .DS_Store and maps are excluded explicitly.
execFileSync('zip', ['-r', '-X', '-q', zip, '.', '-x', '*.DS_Store', '*.map'], { cwd: dist, stdio: 'inherit' });
console.log(`release/quilly-v${pkg.version}.zip`);
