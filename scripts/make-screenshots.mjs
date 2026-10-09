// Frames raw captures into store-ready screenshots (1280×800) with a caption band.
//   input : docs/screenshots/raw/<name>.png  (any size, ideally 1280×800 or wider)
//   text  : docs/screenshots/captions.json   ({ name: { title, subtitle } })
//   output: docs/screenshots/<name>.png      (used by README.md and uploaded to the Web Store)
// Missing raw captures get a labelled placeholder so the README renders until real ones exist.
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

const W = 1280;
const H = 800;
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
const dir = join(root, 'docs', 'screenshots');
const rawDir = join(dir, 'raw');
const captions = JSON.parse(readFileSync(join(dir, 'captions.json'), 'utf8'));
const logo = readFileSync(join(root, 'public', 'logo.svg'), 'utf8').replace(/width="\d+" height="\d+"/, 'width="40" height="40"');
const work = mkdtempSync(join(tmpdir(), 'quilly-shots-'));
mkdirSync(rawDir, { recursive: true });

const escape = (s) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;');

try {
  for (const [name, { title, subtitle }] of Object.entries(captions)) {
    const raw = join(rawDir, `${name}.png`);
    const hasRaw = existsSync(raw);
    const shot = hasRaw
      ? `<img class="shot" src="${pathToFileURL(raw).href}" alt="">`
      : `<div class="shot placeholder"><span>Screenshot placeholder</span><code>docs/screenshots/raw/${name}.png</code></div>`;
    const html = `<!doctype html><html><head><meta charset="utf-8"><style>
      html,body{margin:0;width:${W}px;height:${H}px;overflow:hidden;background:#0f1117;font-family:-apple-system,"SF Pro Display","Segoe UI",Inter,Roboto,Helvetica,Arial,sans-serif;color:#e7eaf2}
      .glow{position:absolute;inset:0;background:radial-gradient(900px 500px at 20% -10%,rgba(79,70,229,.35),transparent 60%),radial-gradient(700px 400px at 100% 0%,rgba(192,38,211,.22),transparent 60%)}
      .band{position:absolute;left:64px;right:64px;top:52px;display:flex;align-items:center;gap:18px}
      .band svg{flex:none;border-radius:10px;box-shadow:0 6px 18px rgba(0,0,0,.35)}
      h1{margin:0;font-size:38px;font-weight:700;letter-spacing:-.6px;line-height:1.1}
      p{margin:6px 0 0;font-size:19px;color:#aab1c3;line-height:1.3}
      .frame{position:absolute;left:64px;right:64px;top:176px;height:${H}px;border-radius:16px 16px 0 0;overflow:hidden;background:#171a22;box-shadow:0 -2px 0 rgba(255,255,255,.06),0 30px 80px rgba(0,0,0,.55)}
      .shot{display:block;width:100%;height:auto}
      .placeholder{height:100%;display:flex;flex-direction:column;align-items:center;justify-content:flex-start;padding-top:180px;gap:10px;color:#8b93a7;font-size:22px}
      .placeholder code{font:14px ui-monospace,SFMono-Regular,Menlo,monospace;color:#6ea8fe}
    </style></head><body>
      <div class="glow"></div>
      <div class="band">${logo}<div><h1>${escape(title)}</h1><p>${escape(subtitle)}</p></div></div>
      <div class="frame">${shot}</div>
    </body></html>`;
    const page = join(work, `${name}.html`);
    writeFileSync(page, html);
    execFileSync(
      chrome,
      ['--headless=new', '--hide-scrollbars', '--force-device-scale-factor=1', `--window-size=${W},${H}`, `--screenshot=${join(dir, `${name}.png`)}`, pathToFileURL(page).href],
      { stdio: 'ignore' },
    );
    console.log(`docs/screenshots/${name}.png${hasRaw ? '' : ' (placeholder)'}`);
  }
} finally {
  rmSync(work, { recursive: true, force: true });
}
