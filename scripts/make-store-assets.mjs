// Rasterises the store artwork in store/*.svg to PNG at exactly the size declared in each SVG.
// Uses headless Chrome, which renders the SVGs with the same engine the Web Store's visitors use.
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, readdirSync, readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

const CHROME_CANDIDATES = [
  process.env.CHROME_BIN,
  '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  '/usr/bin/google-chrome',
  '/usr/bin/chromium',
  '/usr/bin/chromium-browser',
].filter(Boolean);
const chrome = CHROME_CANDIDATES.find((p) => existsSync(p));
if (!chrome) throw new Error('Chrome not found. Set CHROME_BIN to a Chrome/Chromium binary.');

const root = resolve(import.meta.dirname, '..');
const src = join(root, 'store');
const out = join(src, 'out');
mkdirSync(out, { recursive: true });

for (const file of readdirSync(src).filter((f) => f.endsWith('.svg'))) {
  const size = /width="(\d+)" height="(\d+)"/.exec(readFileSync(join(src, file), 'utf8'));
  if (!size) throw new Error(`${file}: missing width/height attributes`);
  const target = join(out, file.replace(/\.svg$/, '.png'));
  execFileSync(
    chrome,
    [
      '--headless=new',
      '--hide-scrollbars',
      '--force-device-scale-factor=1',
      `--window-size=${size[1]},${size[2]}`,
      `--screenshot=${target}`,
      pathToFileURL(join(src, file)).href,
    ],
    { stdio: 'ignore' },
  );
  console.log(`store/out/${file.replace(/\.svg$/, '.png')} (${size[1]}×${size[2]})`);
}
