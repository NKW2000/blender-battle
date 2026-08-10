/**
 * Fails when `packages/shared` exports something nothing imports.
 *
 * The bug this catches is specific and was live in this repository:
 * `ROOM_RANKED_MIN_SUBMISSIONS = 4` sat in the shared constants with a doc
 * comment explaining that it was the floor stopping a private group from
 * minting rank by trading likes between three friends. It was exported
 * correctly, typed correctly, consistent between front and back end — and
 * imported by nobody. The actual threshold in force was `ROOM_MIN_PLAYERS`,
 * which is two.
 *
 * That is worse than a stale value. A stale value is visible in a diff and
 * someone eventually notices the number is wrong. A constant that is documented
 * but unwired reads, to anyone auditing the code, as a policy that is being
 * enforced. The shared package's stated purpose is "so a limit cannot drift" —
 * it guarantees the value matches everywhere, not that anyone obeys it.
 *
 *   node scripts/check-shared-exports.mjs
 */
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { dirname, extname, join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const SHARED_SRC = join(ROOT, 'packages', 'shared', 'src');
const CONSUMERS = [join(ROOT, 'apps', 'api', 'src'), join(ROOT, 'apps', 'web', 'src')];

/**
 * Exports that are genuinely not imported anywhere and are meant to stay.
 *
 * Keep this list short and each entry justified. An entry here is a promise
 * that the export is inert on purpose — not a place to silence the check
 * because wiring something up is inconvenient.
 */
const ALLOWED_UNUSED = new Set([
  // Re-exported for consumers of the package's public surface; the barrel file
  // is the API, not a usage site.
]);

function walk(directory) {
  const found = [];
  for (const entry of readdirSync(directory)) {
    const path = join(directory, entry);
    if (statSync(path).isDirectory()) found.push(...walk(path));
    else if (['.ts', '.tsx'].includes(extname(path)) && !path.endsWith('.spec.ts')) found.push(path);
  }
  return found;
}

/**
 * Named exports declared in the shared sources.
 *
 * A regex rather than the TypeScript compiler API on purpose: the shapes here
 * are `export const`, `export enum`, `export function`, `export type` and
 * `export interface`, all written one per line by convention. Pulling in the
 * compiler to parse five keywords would be a heavier dependency than the check
 * itself, and a miss produces a false pass, not a false failure.
 */
function declaredExports() {
  const pattern =
    /^export\s+(?:declare\s+)?(?:const|let|function|class|enum|type|interface)\s+([A-Za-z0-9_$]+)/gm;
  const exported = new Map();

  for (const file of walk(SHARED_SRC)) {
    if (file.endsWith('index.ts')) continue; // barrel: re-exports only
    const source = readFileSync(file, 'utf8');
    for (const match of source.matchAll(pattern)) {
      exported.set(match[1], relative(ROOT, file).replaceAll('\\', '/'));
    }
  }

  return exported;
}

/** Every identifier that appears anywhere in the consuming apps. */
function identifiersUsedByApps() {
  const used = new Set();

  for (const root of CONSUMERS) {
    for (const file of walk(root)) {
      for (const match of readFileSync(file, 'utf8').matchAll(/[A-Za-z0-9_$]+/g)) {
        used.add(match[0]);
      }
    }
  }

  return used;
}

const exported = declaredExports();
const used = identifiersUsedByApps();

const orphans = [...exported]
  .filter(([name]) => !used.has(name) && !ALLOWED_UNUSED.has(name))
  .sort(([a], [b]) => a.localeCompare(b));

if (orphans.length === 0) {
  console.log(`All ${exported.size} shared exports are imported by at least one app.`);
  process.exit(0);
}

console.error(`\n${orphans.length} shared export(s) are not used by any app:\n`);
for (const [name, file] of orphans) console.error(`  ${name}  (${file})`);
console.error(
  '\nEither wire it up, delete it, or — if it is inert on purpose — add it to\n' +
    'ALLOWED_UNUSED in scripts/check-shared-exports.mjs with a reason.\n',
);
process.exit(1);
