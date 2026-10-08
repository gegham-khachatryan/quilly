// Rasterizes the extension icons without image dependencies.
//   icons/icon{16,32,48,128}.png  - brand logo (gradient tile + white waveform), mirrors public/logo.svg
//   icons/rec{16,32,48,128}.png   - recording state (red dot on dark tile), swapped in by the background
// Shapes are drawn with signed-distance functions and 4x4 supersampling for clean anti-aliasing.
import { deflateSync } from 'node:zlib';
import { mkdirSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';

const outDir = resolve(import.meta.dirname, '../public/icons');
mkdirSync(outDir, { recursive: true });

// ---- PNG encoding -----------------------------------------------------------
const crcTable = new Uint32Array(256).map((_, n) => {
  let c = n;
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  return c >>> 0;
});
const crc32 = (buf) => {
  let c = 0xffffffff;
  for (const b of buf) c = crcTable[(c ^ b) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
};
const chunk = (type, data) => {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const body = Buffer.concat([Buffer.from(type, 'ascii'), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body));
  return Buffer.concat([len, body, crc]);
};
function encodePng(size, rgba) {
  const rows = [];
  for (let y = 0; y < size; y++) rows.push(Buffer.from([0]), rgba.subarray(y * size * 4, (y + 1) * size * 4));
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0);
  ihdr.writeUInt32BE(size, 4);
  ihdr.set([8, 6, 0, 0, 0], 8);
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(Buffer.concat(rows), { level: 9 })),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

// ---- Geometry (unit square, 0..1) -------------------------------------------
const sdRoundedBox = (x, y, r) => {
  const dx = Math.abs(x - 0.5) - (0.5 - r);
  const dy = Math.abs(y - 0.5) - (0.5 - r);
  return Math.hypot(Math.max(dx, 0), Math.max(dy, 0)) + Math.min(Math.max(dx, dy), 0) - r;
};
const sdCircle = (x, y, cx, cy, r) => Math.hypot(x - cx, y - cy) - r;
const sdCapsule = (x, y, cx, y0, y1, r) => {
  const py = Math.min(Math.max(y, y0), y1);
  return Math.hypot(x - cx, y - py) - r;
};
const coverage = (sd, px) => Math.min(1, Math.max(0, 0.5 - sd / px)); // px = size of one sample in unit space
const mix = (a, b, t) => a.map((v, i) => v * (1 - t) + b[i] * t);
const hex = (h) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16));

// ---- Scenes: return [r,g,b,a] (0..255 / 0..1) for a unit-space point ---------
const INDIGO = hex('#4f46e5');
const FUCHSIA = hex('#c026d3');
const WHITE = [255, 255, 255];
const DARK = hex('#1f232b');
const RED = hex('#ef4444');

const BARS = [
  [28 / 128, 50 / 128, 78 / 128],
  [46 / 128, 38 / 128, 90 / 128],
  [64 / 128, 28 / 128, 100 / 128],
  [82 / 128, 38 / 128, 90 / 128],
  [100 / 128, 50 / 128, 78 / 128],
];

function logoScene(x, y, px) {
  const tile = coverage(sdRoundedBox(x, y, 28 / 128), px);
  if (tile <= 0) return [0, 0, 0, 0];
  let color = mix(INDIGO, FUCHSIA, (x + y) / 2);
  // top sheen
  const sheen = Math.max(0, 0.18 * (1 - y / 0.5)) * (y < 0.5 ? 1 : 0);
  color = mix(color, WHITE, sheen);
  // waveform
  let bars = 0;
  for (const [cx, y0, y1] of BARS) bars = Math.max(bars, coverage(sdCapsule(x, y, cx, y0, y1, 5.5 / 128), px));
  color = mix(color, WHITE, bars * 0.96);
  return [...color, tile];
}

function recScene(x, y, px) {
  const tile = coverage(sdRoundedBox(x, y, 28 / 128), px);
  if (tile <= 0) return [0, 0, 0, 0];
  let color = DARK;
  const halo = coverage(sdCircle(x, y, 0.5, 0.5, 0.40), px) * 0.22;
  color = mix(color, RED, halo);
  const dot = coverage(sdCircle(x, y, 0.5, 0.5, 0.26), px);
  color = mix(color, RED, dot);
  // soft specular on the dot
  const spec = coverage(sdCircle(x, y, 0.43, 0.42, 0.07), px) * 0.35 * dot;
  color = mix(color, WHITE, spec);
  return [...color, tile];
}

// ---- Rasterize with supersampling --------------------------------------------
function render(size, scene, ss = 4) {
  const out = Buffer.alloc(size * size * 4);
  const px = 1 / (size * ss);
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      let r = 0, g = 0, b = 0, a = 0;
      for (let sy = 0; sy < ss; sy++) {
        for (let sx = 0; sx < ss; sx++) {
          const [cr, cg, cb, ca] = scene((x + (sx + 0.5) / ss) / size, (y + (sy + 0.5) / ss) / size, px);
          r += cr * ca; g += cg * ca; b += cb * ca; a += ca;
        }
      }
      const i = (y * size + x) * 4;
      if (a > 0) {
        out[i] = Math.round(r / a);
        out[i + 1] = Math.round(g / a);
        out[i + 2] = Math.round(b / a);
        out[i + 3] = Math.round((a / (ss * ss)) * 255);
      }
    }
  }
  return encodePng(size, out);
}

for (const size of [16, 32, 48, 128]) {
  writeFileSync(resolve(outDir, `icon${size}.png`), render(size, logoScene));
  writeFileSync(resolve(outDir, `rec${size}.png`), render(size, recScene));
}
console.log('icons written to', outDir);
