/**
 * Stamps the deployed commit into a file the API serves statically.
 *
 * Several deploy cycles were spent unable to answer a basic question: is the
 * fix I just pushed the thing that is actually running? A crashing function
 * looks identical whichever commit produced it, so "still broken" and "the new
 * build never went out" are indistinguishable from the outside — and they need
 * opposite responses.
 *
 * `/build-id.txt` answers it in one request, and keeps answering it when the
 * function itself is too broken to reply, because Vercel serves the output
 * directory from the filesystem before any rewrite reaches the function.
 *
 * That same precedence is why this is the only file allowed in `public/`
 * besides `.gitkeep`: anything placed there shadows the API route of the same
 * path. `build-id.txt` collides with nothing.
 */

import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const api = fileURLToPath(new URL('..', import.meta.url));
const dir = join(api, 'public');

// Vercel exposes the commit it is building; outside it, say so plainly rather
// than writing something that looks like a real sha.
const commit = process.env.VERCEL_GIT_COMMIT_SHA ?? 'local-build';
const builtAt = new Date().toISOString();

mkdirSync(dir, { recursive: true });
writeFileSync(join(dir, 'build-id.txt'), `${commit}\n${builtAt}\n`, 'utf8');

console.log(`build-id.txt: ${commit} (${builtAt})`);
