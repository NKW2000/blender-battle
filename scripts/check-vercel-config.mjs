import { readFileSync } from 'node:fs';

/**
 * Guards the two `vercel.json` files against a class of mistake that only
 * surfaces at deploy time.
 *
 * Vercel validates the file against a strict schema and rejects **any**
 * unrecognised property. A `"//": "…"` key — the usual way to comment JSON, and
 * used elsewhere in this repository's `package.json` files — fails the whole
 * deployment, and it fails it in a way that hides the real problem: the config
 * is discarded wholesale, so every setting in it silently stops applying and
 * the error you see is about whichever default then went wrong.
 *
 * That is exactly what happened. A comment key added beside `outputDirectory`
 * meant `outputDirectory` never took effect, and the deploy failed complaining
 * about a missing output directory — pointing at the one line that was correct.
 *
 * So: no comments in these files. Explanations live in `DEPLOYMENT.md`, which
 * nothing parses.
 */
const FILES = ['apps/api/vercel.json', 'apps/web/vercel.json'];

/*
  The properties actually used here, not the whole Vercel schema.

  A narrow list is the point: an unfamiliar key is far more likely to be a typo
  or a comment than a deliberate use of something this project has never needed,
  and catching it here beats catching it in a failed deployment.
*/
const ALLOWED = new Set([
  '$schema',
  'framework',
  'installCommand',
  'buildCommand',
  'outputDirectory',
  'functions',
  'rewrites',
  'redirects',
  'headers',
  'crons',
  'regions',
]);

let failed = false;

for (const file of FILES) {
  let config;

  try {
    config = JSON.parse(readFileSync(file, 'utf8'));
  } catch (error) {
    console.error(`${file}: not valid JSON — ${error.message}`);
    failed = true;
    continue;
  }

  for (const key of Object.keys(config)) {
    if (key.startsWith('//')) {
      console.error(
        `${file}: "${key}" is a comment. Vercel rejects unknown properties and ` +
          `discards the entire file, so every other setting stops applying too. ` +
          `Move the explanation to DEPLOYMENT.md.`,
      );
      failed = true;
    } else if (!ALLOWED.has(key)) {
      console.error(
        `${file}: "${key}" is not a property this project uses. If it is real, ` +
          `add it to ALLOWED in scripts/check-vercel-config.mjs; if it is a typo, ` +
          `Vercel would have rejected the whole file.`,
      );
      failed = true;
    }
  }
}

if (failed) process.exit(1);
console.log(`vercel.json: ${FILES.length} files, no unknown properties.`);
