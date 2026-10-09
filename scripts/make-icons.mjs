// Renders the toolbar icons from their SVG sources with headless Chrome:
//   public/logo.svg        -> public/icons/icon{16,32,48,128}.png  (brand mark)
//   scripts/icons/rec.svg  -> public/icons/rec{16,32,48,128}.png   (recording state, swapped in by the background)
// The PNGs are committed; run `npm run icons` after changing either SVG.
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

const SIZES = [16, 32, 48, 128];
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
const outDir = join(root, 'public', 'icons');
mkdirSync(outDir, { recursive: true });
const work = mkdtempSync(join(tmpdir(), 'quilly-icons-'));

const sources = [
  { name: 'icon', svg: join(root, 'public', 'logo.svg') },
  { name: 'rec', svg: join(root, 'scripts', 'icons', 'rec.svg') },
];

try {
  for (const { name, svg } of sources) {
    const markup = readFileSync(svg, 'utf8');
    for (const size of SIZES) {
      const sized = markup.replace(/width="\d+" height="\d+"/, `width="${size}" height="${size}"`);
      const page = join(work, `${name}${size}.html`);
      writeFileSync(page, `<!doctype html><html><head><meta charset="utf-8"><style>html,body{margin:0;background:transparent}svg{display:block}</style></head><body>${sized}</body></html>`);
      execFileSync(
        chrome,
        [
          '--headless=new',
          '--hide-scrollbars',
          '--force-device-scale-factor=1',
          '--default-background-color=00000000',
          `--window-size=${size},${size}`,
          `--screenshot=${join(outDir, `${name}${size}.png`)}`,
          pathToFileURL(page).href,
        ],
        { stdio: 'ignore' },
      );
    }
    console.log(`public/icons/${name}{${SIZES.join(',')}}.png`);
  }
} finally {
  rmSync(work, { recursive: true, force: true });
}
