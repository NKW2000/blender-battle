/**
 * Bakes the template into a standalone page.
 *
 * Three things are inlined, and each is inlined for the same reason: a render
 * that fetches anything depends on the network being up and on the same bytes
 * arriving every time, which is exactly the variation this pipeline exists to
 * remove.
 *
 *   The site's compiled stylesheet, so the film is drawn by the real CSS rather
 *   than by a copy of it that will drift the first time a token changes.
 *
 *   Both fonts, because a webfont that lands late leaves the opening second set
 *   in a fallback face.
 *
 * Run `pnpm --filter @bb/web build` first — the stylesheet comes out of that.
 */

import { existsSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const SCENES = join(HERE, 'scenes');
const WEB_CSS_DIR = join(HERE, '..', '..', 'apps', 'web', '.next', 'static', 'css');

const URL_ON_SCREEN = process.env.AD_URL ?? 'blenderbattle.vercel.app';

/**
 * The site's stylesheet, from its last production build.
 *
 * Taken from `.next` rather than from source, because what matters is the CSS
 * the browser actually receives — Tailwind's output, with every token resolved
 * and only the classes the site really uses.
 */
function siteCss() {
  if (!existsSync(WEB_CSS_DIR)) {
    throw new Error(
      'No compiled stylesheet found.\n' +
        'Build the site first:  pnpm --filter @bb/web build',
    );
  }

  const files = readdirSync(WEB_CSS_DIR).filter((name) => name.endsWith('.css'));
  if (files.length === 0) throw new Error(`No .css in ${WEB_CSS_DIR}`);

  // Every one of them, largest first: Next may split the stylesheet, and the
  // tokens live in whichever chunk carries `:root`.
  return files
    .map((name) => readFileSync(join(WEB_CSS_DIR, name), 'utf8'))
    .sort((a, b) => b.length - a.length)
    .join('\n');
}

const css = siteCss();

const html = readFileSync(join(SCENES, 'ad.template.html'), 'utf8')
  .replace('__SITE_CSS__', css)
  .replace('__FREDOKA__', readFileSync(join(SCENES, 'fredoka.b64'), 'utf8').trim())
  .replace('__NUNITO__', readFileSync(join(SCENES, 'nunito.b64'), 'utf8').trim())
  .replace('__URL__', URL_ON_SCREEN);

writeFileSync(join(SCENES, 'ad.html'), html);

console.log(
  `ad.html  ${(html.length / 1024).toFixed(0)}kB` +
    `  (site css ${(css.length / 1024).toFixed(0)}kB)  url: ${URL_ON_SCREEN}`,
);
