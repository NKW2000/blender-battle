/**
 * Draws the app icons for the web manifest and the iOS home screen.
 *
 * Written by hand against zlib rather than pulling in an image library. The
 * mark is three flat shapes, so a rasteriser for it is a few dozen lines, and
 * that is a smaller thing to own than an image toolchain that exists to be run
 * once and then never again. Re-run with:
 *
 *   node scripts/generate-icons.mjs
 *
 * Output is committed: the icons change only when the brand does, and a build
 * that has to rasterise its own assets is a build with more ways to fail.
 */
import { deflateSync } from 'node:zlib';
import { writeFileSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const OUT_DIR = join(dirname(fileURLToPath(import.meta.url)), '..', 'public');

/** Arcade palette, matching globals.css. */
const INK = [0x0e, 0x0b, 0x2b];
const SUN = [0xff, 0xd2, 0x3f];

const lerp = (a, b, t) => a + (b - a) * t;

/**
 * Colour at one point of the mark, or null for transparent.
 *
 * This is `ArcadeLogo` drawn in pixels rather than a separate piece of artwork:
 * a rounded square turned 45 degrees, sun yellow, with a small ink square at its
 * centre turned with it. Anything else would put a different logo on the home
 * screen from the one in the header, which is exactly what a home-screen icon
 * must not do.
 *
 * Coordinates are normalised to -1..1 so one function serves every size.
 * `maskable` shrinks the mark inside the safe circle Android may crop to — a
 * round launcher clips the corners, and a mark drawn to the edges loses them.
 */
function sample(nx, ny, { maskable }) {
  const scale = maskable ? 0.58 : 0.78;

  // Rotate the sample point by -45°, which draws the shape rotated by +45°.
  const SQRT1_2 = Math.SQRT1_2;
  const u = (nx * SQRT1_2 + ny * SQRT1_2) / scale;
  const v = (-nx * SQRT1_2 + ny * SQRT1_2) / scale;

  // The inner square: 32% of the body, as in the component.
  if (Math.max(Math.abs(u), Math.abs(v)) <= 0.32) return INK;

  // The body: a superellipse gives the `rounded-xl` corners the component has,
  // rather than the hard points of a plain square.
  const k = 4.5;
  if (Math.pow(Math.abs(u), k) + Math.pow(Math.abs(v), k) <= Math.pow(0.92, k)) {
    return SUN;
  }

  return null;
}

function renderIcon(size, { maskable }) {
  // 3x supersampling, then box-filtered down: cheaper to write than analytic
  // coverage and indistinguishable at icon sizes.
  const SS = 3;
  const pixels = Buffer.alloc(size * size * 4);

  for (let py = 0; py < size; py += 1) {
    for (let px = 0; px < size; px += 1) {
      let r = 0;
      let g = 0;
      let b = 0;
      let hits = 0;

      for (let sy = 0; sy < SS; sy += 1) {
        for (let sx = 0; sx < SS; sx += 1) {
          const nx = ((px + (sx + 0.5) / SS) / size) * 2 - 1;
          const ny = ((py + (sy + 0.5) / SS) / size) * 2 - 1;
          const colour = sample(nx, ny, { maskable });
          if (colour) {
            r += colour[0];
            g += colour[1];
            b += colour[2];
            hits += 1;
          }
        }
      }

      const total = SS * SS;
      const i = (py * size + px) * 4;

      // Composite over ink rather than leaving it transparent. A maskable icon
      // is padded by the launcher with whatever it likes, and a transparent
      // one shows the wallpaper through the gaps.
      const coverage = hits / total;
      const fr = hits ? r / hits : 0;
      const fg = hits ? g / hits : 0;
      const fb = hits ? b / hits : 0;

      pixels[i] = Math.round(lerp(INK[0], fr, coverage));
      pixels[i + 1] = Math.round(lerp(INK[1], fg, coverage));
      pixels[i + 2] = Math.round(lerp(INK[2], fb, coverage));
      pixels[i + 3] = 255;
    }
  }

  return encodePng(size, size, pixels);
}

/** Minimal PNG writer: one IHDR, one IDAT, one IEND, no interlacing. */
function encodePng(width, height, rgba) {
  const raw = Buffer.alloc((width * 4 + 1) * height);
  for (let y = 0; y < height; y += 1) {
    raw[y * (width * 4 + 1)] = 0; // filter: none
    rgba.copy(raw, y * (width * 4 + 1) + 1, y * width * 4, (y + 1) * width * 4);
  }

  const chunk = (type, data) => {
    const length = Buffer.alloc(4);
    length.writeUInt32BE(data.length);
    const body = Buffer.concat([Buffer.from(type, 'ascii'), data]);
    const crc = Buffer.alloc(4);
    crc.writeUInt32BE(crc32(body) >>> 0);
    return Buffer.concat([length, body, crc]);
  };

  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 6; // colour type: RGBA
  ihdr[10] = 0;
  ihdr[11] = 0;
  ihdr[12] = 0;

  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(raw, { level: 9 })),
    chunk('IEND', Buffer.alloc(0)),
  ]);
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

function crc32(buf) {
  let c = 0xffffffff;
  for (let i = 0; i < buf.length; i += 1) c = CRC_TABLE[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  return c ^ 0xffffffff;
}

mkdirSync(OUT_DIR, { recursive: true });

const targets = [
  // Manifest requires both, and 512 is what the install dialog shows.
  ['icon-192.png', 192, { maskable: false }],
  ['icon-512.png', 512, { maskable: false }],
  // Padded so a round or squircle launcher mask cannot clip the mark.
  ['icon-192-maskable.png', 192, { maskable: true }],
  ['icon-512-maskable.png', 512, { maskable: true }],
  // iOS ignores the manifest's icons and reads this one instead.
  ['apple-touch-icon.png', 180, { maskable: true }],
];

for (const [name, size, options] of targets) {
  writeFileSync(join(OUT_DIR, name), renderIcon(size, options));
  console.log(`wrote ${name} (${size}x${size})`);
}
