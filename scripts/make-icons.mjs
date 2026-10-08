// Generates the extension icons (a red "record" dot on a dark rounded square) as PNGs
// without any image dependencies. Output: public/icons/icon{16,32,48,128}.png
import { deflateSync } from 'node:zlib';
import { mkdirSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';

const outDir = resolve(import.meta.dirname, '../public/icons');
mkdirSync(outDir, { recursive: true });

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
  const typeAndData = Buffer.concat([Buffer.from(type, 'ascii'), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(typeAndData));
  return Buffer.concat([len, typeAndData, crc]);
};

function render(size) {
  const px = Buffer.alloc(size * size * 4);
  const bg = [0x1f, 0x23, 0x2b];
  const dot = [0xef, 0x44, 0x44];
  const radius = size * 0.22;
  const cx = (size - 1) / 2;
  const dotR = size * 0.28;
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const i = (y * size + x) * 4;
      // rounded-square coverage
      const dx = Math.max(Math.abs(x - cx) - (cx - radius), 0);
      const dy = Math.max(Math.abs(y - cx) - (cx - radius), 0);
      const d = Math.hypot(dx, dy) - radius;
      const cover = Math.min(1, Math.max(0, 0.5 - d));
      if (cover <= 0) continue;
      const dd = Math.hypot(x - cx, y - cx) - dotR;
      const t = Math.min(1, Math.max(0, 0.5 - dd));
      for (let c = 0; c < 3; c++) px[i + c] = Math.round(bg[c] * (1 - t) + dot[c] * t);
      px[i + 3] = Math.round(255 * cover);
    }
  }
  const rows = [];
  for (let y = 0; y < size; y++) rows.push(Buffer.from([0]), px.subarray(y * size * 4, (y + 1) * size * 4));
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0);
  ihdr.writeUInt32BE(size, 4);
  ihdr[8] = 8; ihdr[9] = 6; ihdr[10] = 0; ihdr[11] = 0; ihdr[12] = 0;
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(Buffer.concat(rows))),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

for (const size of [16, 32, 48, 128]) writeFileSync(resolve(outDir, `icon${size}.png`), render(size));
console.log('icons written to', outDir);
