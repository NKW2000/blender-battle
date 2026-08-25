import { readdirSync } from 'node:fs';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

import { migrations } from './migrations';

/**
 * The migration list.
 *
 * It replaced a glob, because a glob cannot be followed by a bundler — and the
 * failure that produced was the quiet kind: TypeORM reports zero pending
 * migrations and starts happily against a database with no tables, so the first
 * query is what finally fails, a long way from the cause.
 *
 * An explicit list trades that for a different risk: someone adds a migration
 * file and forgets the list, and it never runs. That is what this checks — the
 * list against the directory, so the two cannot drift.
 */
const DIR = join(__dirname, 'migrations');

const files = readdirSync(DIR)
  .filter((name) => name.endsWith('.ts') && name !== 'index.ts' && !name.endsWith('.spec.ts'))
  .sort();

describe('the migration list', () => {
  it('holds every file in the directory', () => {
    // The exact failure this list exists to make impossible: a migration that
    // is written, reviewed, committed, and never runs anywhere.
    expect(migrations).toHaveLength(files.length);
  });

  it('runs them in timestamp order', () => {
    /*
      TypeORM orders by the numeric suffix on the class name, not by position in
      this array — so a file added out of order still runs correctly, but the
      list would read as if it did not. Keeping the two in step means the list
      can be trusted as documentation of the real order.
    */
    const timestamps = migrations.map((migration) => {
      const match = /(\d{13})$/.exec(migration.name);
      expect(match, `${migration.name} has no timestamp suffix`).not.toBeNull();
      return Number(match![1]);
    });

    expect(timestamps).toEqual([...timestamps].sort((a, b) => a - b));
  });

  it('names each class after its file', () => {
    // A copied file whose class was never renamed collides with the original in
    // TypeORM's bookkeeping, and the second one is recorded as already applied.
    for (const [index, migration] of migrations.entries()) {
      const timestamp = /(\d{13})$/.exec(migration.name)![1];
      expect(files[index]).toContain(timestamp);
    }
  });

  it('has no duplicate class names', () => {
    const names = migrations.map((migration) => migration.name);
    expect(new Set(names).size).toBe(names.length);
  });
});
