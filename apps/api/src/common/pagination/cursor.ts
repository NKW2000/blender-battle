import { BadRequestException } from '@nestjs/common';

/**
 * Keyset ("cursor") pagination helpers.
 *
 * The cursor encodes the last row's sort key plus its id as a tiebreaker. Compared
 * with OFFSET this is stable under concurrent inserts — no row is skipped or
 * repeated when a page boundary shifts — and stays O(log n) at any depth instead of
 * degrading linearly.
 *
 * The encoding is opaque base64 on purpose: clients round-trip it and must not
 * construct one, which keeps the sort key free to change without breaking them.
 */
export interface DecodedCursor {
  /** Sort column value, ISO timestamp or numeric string. */
  value: string;
  id: string;
}

export function encodeCursor(value: Date | string | number, id: string): string {
  const raw = value instanceof Date ? value.toISOString() : String(value);
  return Buffer.from(`${raw}::${id}`, 'utf8').toString('base64url');
}

export function decodeCursor(cursor: string): DecodedCursor {
  let decoded: string;
  try {
    decoded = Buffer.from(cursor, 'base64url').toString('utf8');
  } catch {
    throw new BadRequestException('Malformed cursor');
  }

  const separator = decoded.lastIndexOf('::');
  if (separator === -1) throw new BadRequestException('Malformed cursor');

  const value = decoded.slice(0, separator);
  const id = decoded.slice(separator + 2);
  if (!value || !id) throw new BadRequestException('Malformed cursor');

  return { value, id };
}

/**
 * Fetches limit+1 rows, then trims. The extra row answers "is there a next page?"
 * without a second COUNT query over the whole table.
 */
export function buildPage<T>(
  rows: T[],
  limit: number,
  toCursor: (row: T) => string,
): { items: T[]; nextCursor: string | null; hasMore: boolean } {
  const hasMore = rows.length > limit;
  const items = hasMore ? rows.slice(0, limit) : rows;
  const last = items.at(-1);

  return {
    items,
    hasMore,
    nextCursor: hasMore && last ? toCursor(last) : null,
  };
}
