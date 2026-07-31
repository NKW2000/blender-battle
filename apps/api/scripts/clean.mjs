import { rmSync } from 'node:fs';
import { setTimeout as sleep } from 'node:timers/promises';

/**
 * Removes dist/ before a build.
 *
 * Windows will intermittently refuse the removal with ENOTEMPTY or EBUSY while a
 * virus scanner or file indexer still holds a handle on a freshly written file.
 * The retry loop rides that out; Nest's built-in deleteOutDir does not, and fails
 * the whole build instead.
 */
const target = new URL('../dist', import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1');

for (let attempt = 1; attempt <= 5; attempt += 1) {
  try {
    rmSync(target, { recursive: true, force: true });
    process.exit(0);
  } catch (error) {
    if (attempt === 5) {
      console.error(`Could not remove ${target}: ${error.message}`);
      process.exit(1);
    }
    await sleep(200 * attempt);
  }
}
