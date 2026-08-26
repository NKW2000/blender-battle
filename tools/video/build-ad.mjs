/**
 * Bakes the ad template into a standalone page.
 *
 * The fonts are inlined rather than linked. A render that fetches Google Fonts
 * depends on the network being up and on the same file arriving every time,
 * which is exactly the kind of variation this pipeline exists to remove — and a
 * font that lands late shows up as the first second of the video set in a
 * fallback face.
 */

import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = join(dirname(fileURLToPath(import.meta.url)), 'scenes');

const URL_ON_SCREEN = process.env.AD_URL ?? 'blender-battle-web-jmmk.vercel.app';

const html = readFileSync(join(HERE, 'ad.template.html'), 'utf8')
  .replace('__FREDOKA__', readFileSync(join(HERE, 'fredoka.b64'), 'utf8').trim())
  .replace('__NUNITO__', readFileSync(join(HERE, 'nunito.b64'), 'utf8').trim())
  .replace('__URL__', URL_ON_SCREEN);

writeFileSync(join(HERE, 'ad.html'), html);
console.log(`ad.html  ${(html.length / 1024).toFixed(0)}kB  url: ${URL_ON_SCREEN}`);
