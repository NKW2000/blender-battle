import type { ThrottlerStorage } from '@nestjs/throttler';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { ResilientThrottlerStorage } from './resilient-throttler-storage';

/**
 * Failing open.
 *
 * The throttler guard runs before every other guard on every route, so an
 * exception from its counter store is a 500 on the whole site — which is what a
 * wrong `REDIS_URL` produced: `/health` itself returning `MaxRetriesPerRequest`.
 *
 * These pin both halves of the trade. While the store works, nothing changes —
 * counts must pass through untouched, or the limiter silently stops limiting.
 * While it does not, requests proceed rather than failing.
 */

function storageThat(behaviour: Partial<ThrottlerStorage>): ThrottlerStorage {
  return { increment: vi.fn(), ...behaviour } as ThrottlerStorage;
}

describe('the throttler storage wrapper', () => {
  beforeEach(() => {
    vi.useRealTimers();
  });

  it('passes the real count through when the store is healthy', async () => {
    /*
      The important half. A wrapper that quietly returned a permissive record on
      the happy path would disable rate limiting everywhere while looking
      entirely fine — no error, no log, no failing test.
    */
    const record = { totalHits: 7, timeToExpire: 42, isBlocked: false, timeToBlockExpire: 0 };
    const inner = storageThat({ increment: vi.fn().mockResolvedValue(record) });

    const storage = new ResilientThrottlerStorage(inner);

    await expect(storage.increment('key', 60_000, 10, 0, 'default')).resolves.toEqual(record);
    expect(inner.increment).toHaveBeenCalledWith('key', 60_000, 10, 0, 'default');
  });

  it('reports a block when the store says the caller is blocked', async () => {
    // Failing open must not become "never blocks".
    const blocked = { totalHits: 99, timeToExpire: 10, isBlocked: true, timeToBlockExpire: 30 };
    const storage = new ResilientThrottlerStorage(
      storageThat({ increment: vi.fn().mockResolvedValue(blocked) }),
    );

    await expect(storage.increment('key', 60_000, 10, 0, 'default')).resolves.toEqual(blocked);
  });

  it('lets the request through when the store cannot be reached', async () => {
    // The whole point: Redis being down costs rate limiting, not the service.
    const storage = new ResilientThrottlerStorage(
      storageThat({ increment: vi.fn().mockRejectedValue(new Error('ECONNREFUSED')) }),
    );

    const result = await storage.increment('key', 60_000, 10, 0, 'default');

    expect(result.isBlocked).toBe(false);
    // Zero rather than one: the count is fiction either way, and the lower value
    // cannot trip a limit by itself.
    expect(result.totalHits).toBe(0);
  });

  it('reports the window in seconds so a Retry-After stays sane', async () => {
    const storage = new ResilientThrottlerStorage(
      storageThat({ increment: vi.fn().mockRejectedValue(new Error('down')) }),
    );

    const result = await storage.increment('key', 60_000, 10, 0, 'default');

    expect(result.timeToExpire).toBe(60);
  });

  it('does not log once per request while the store stays down', async () => {
    /*
      A limiter failing open on a busy service writes a line per request, which
      buries the one line that explains why nothing is being limited. The first
      failure is reported; the flood behind it is not.
    */
    const storage = new ResilientThrottlerStorage(
      storageThat({ increment: vi.fn().mockRejectedValue(new Error('down')) }),
    );

    const logged: string[] = [];
    vi.spyOn(
      (storage as unknown as { logger: { error: (message: string) => void } }).logger,
      'error',
    ).mockImplementation((message: string) => {
      logged.push(message);
    });

    for (let attempt = 0; attempt < 25; attempt += 1) {
      await storage.increment('key', 60_000, 10, 0, 'default');
    }

    expect(logged).toHaveLength(1);
    expect(logged[0]).toContain('Rate limiting is disabled');
  });

  it('names the reason it could not reach the store', async () => {
    // "Rate limiting is disabled" without a cause sends the reader to the wrong
    // place; the underlying message is what identifies a bad URL.
    const storage = new ResilientThrottlerStorage(
      storageThat({ increment: vi.fn().mockRejectedValue(new Error('ENOTFOUND upstash.io')) }),
    );

    const logged: string[] = [];
    vi.spyOn(
      (storage as unknown as { logger: { error: (message: string) => void } }).logger,
      'error',
    ).mockImplementation((message: string) => {
      logged.push(message);
    });

    await storage.increment('key', 60_000, 10, 0, 'default');

    expect(logged[0]).toContain('ENOTFOUND upstash.io');
  });
});
