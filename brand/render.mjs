/**
 * Renders the mark to PNG, without a browser or an image library.
 *
 * The mark is two rounded squares turned 45 degrees, which is little enough
 * geometry to rasterise directly — and doing so keeps the brand files
 * reproducible from this repository rather than from whatever was installed on
 * one machine. Everything here is Node's own standard library.
 *
 * Run: node brand/render.mjs
 */

import { deflateSync } from 'node:zlib';
import { writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = fileURLToPath(new URL('.', import.meta.url));

/** The app's own tokens: --color-ink and --color-sun. */
const INK = [0x0e, 0x0b, 0x2b];
const SUN = [0xff, 0xd2, 0x3f];

/*
  Proportions taken from `brand/mark.svg`, expressed against a 512 canvas so any
  output size is the same drawing rather than a resized one.
*/
const OUTER_SIDE = 330 / 512;
const OUTER_RADIUS = 80 / 512;
const INNER_SIDE = 106 / 512;
const INNER_RADIUS = 12 / 512;

/*
  Sixteen samples per pixel.

  The mark is one large diagonal edge, which is the worst case for aliasing —
  a stair-stepped diamond is the single most obvious way a logo looks
  home-made. Supersampling is slower than a real rasteriser and, at these
  sizes, still instant.
*/
const SAMPLES = 4;

/** Signed distance to a rounded rectangle centred on the origin. */
function roundedRectDistance(x, y, half, radius) {
  const qx = Math.abs(x) - (half - radius);
  const qy = Math.abs(y) - (half - radius);
  const outside = Math.hypot(Math.max(qx, 0), Math.max(qy, 0));
  const inside = Math.min(Math.max(qx, qy), 0);
  return outside + inside - radius;
}

const COS45 = Math.SQRT1_2;

/** How much of one pixel the mark covers: 0 outside, 1 inside, fractional on an edge. */
function coverage(px, py, size, sideRatio, radiusRatio) {
  const centre = size / 2;
  const half = (size * sideRatio) / 2;
  const radius = size * radiusRatio;

  let hits = 0;
  for (let sy = 0; sy < SAMPLES; sy += 1) {
    for (let sx = 0; sx < SAMPLES; sx += 1) {
      const x = px + (sx + 0.5) / SAMPLES - centre;
      const y = py + (sy + 0.5) / SAMPLES - centre;

      // Turn the sample back through -45°, so the shape can be tested as an
      // ordinary axis-aligned rounded square.
      const rx = x * COS45 + y * COS45;
      const ry = -x * COS45 + y * COS45;

      if (roundedRectDistance(rx, ry, half, radius) <= 0) hits += 1;
    }
  }

  return hits / (SAMPLES * SAMPLES);
}

function mix(from, to, amount) {
  return from.map((channel, i) => Math.round(channel + (to[i] - channel) * amount));
}

function render(size, { transparent }) {
  // One byte of filter type per row, then RGBA left to right.
  const stride = size * 4 + 1;
  const raw = Buffer.alloc(stride * size);

  for (let y = 0; y < size; y += 1) {
    const row = y * stride;
    raw[row] = 0; // filter: none

    for (let x = 0; x < size; x += 1) {
      const outer = coverage(x, y, size, OUTER_SIDE, OUTER_RADIUS);
      const inner = coverage(x, y, size, INNER_SIDE, INNER_RADIUS);

      /*
        The hole is punched, not painted over.

        On the plate version it can simply be filled with ink, but on the
        transparent one the middle has to become genuinely transparent or the
        mark carries a dark diamond onto whatever it is placed over.
      */
      const markAlpha = Math.max(0, outer - inner);

      let colour;
      let alpha;

      if (transparent) {
        colour = SUN;
        alpha = markAlpha;
      } else {
        colour = mix(INK, SUN, markAlpha);
        alpha = 1;
      }

      const at = row + 1 + x * 4;
      raw[at] = colour[0];
      raw[at + 1] = colour[1];
      raw[at + 2] = colour[2];
      raw[at + 3] = Math.round(alpha * 255);
    }
  }

  return encodePng(size, size, raw);
}

function chunk(type, data) {
  const length = Buffer.alloc(4);
  length.writeUInt32BE(data.length);

  const body = Buffer.concat([Buffer.from(type, 'ascii'), data]);

  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body) >>> 0);

  return Buffer.concat([length, body, crc]);
}

const CRC_TABLE = (() => {
  const table = new Int32Array(256);
  for (let n = 0; n < 256; n += 1) {
    let c = n;
    for (let k = 0; k < 8; k += 1) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    table[n] = c;
  }
  return table;
})();

function crc32(buffer) {
  let c = -1;
  for (const byte of buffer) c = CRC_TABLE[(c ^ byte) & 0xff] ^ (c >>> 8);
  return c ^ -1;
}

function encodePng(width, height, raw) {
  const header = Buffer.alloc(13);
  header.writeUInt32BE(width, 0);
  header.writeUInt32BE(height, 4);
  header[8] = 8; // bit depth
  header[9] = 6; // colour type: RGBA
  header[10] = 0; // deflate
  header[11] = 0; // adaptive filtering
  header[12] = 0; // no interlace

  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', header),
    chunk('IDAT', deflateSync(raw, { level: 9 })),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

const outputs = [
  ['blender-battle-mark-1024.png', 1024, { transparent: false }],
  ['blender-battle-mark-512.png', 512, { transparent: false }],
  ['blender-battle-mark-1024-transparent.png', 1024, { transparent: true }],
];

for (const [name, size, options] of outputs) {
  const png = render(size, options);
  writeFileSync(join(HERE, name), png);
  console.log(`${name}  ${size}x${size}  ${(png.length / 1024).toFixed(1)}kB`);
}
