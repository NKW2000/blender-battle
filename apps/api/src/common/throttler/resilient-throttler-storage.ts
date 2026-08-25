import { Logger } from '@nestjs/common';
import type { ThrottlerStorage } from '@nestjs/throttler';
import type { ThrottlerStorageRecord } from '@nestjs/throttler/dist/throttler-storage-record.interface';

/**
 * Rate-limit counters, with the store allowed to be missing.
 *
 * The throttler guard runs before everything else on every request, and its
 * counters live in Redis. So when Redis is unreachable the guard does not
 * degrade — it throws, the exception filter turns that into a 500, and *every*
 * route on the site fails identically. That is what happened here: a wrong
 * `REDIS_URL` produced `MaxRetriesPerRequestError` on `/health`, a route whose
 * whole job is to answer without touching a dependency.
 *
 * Trading a rate limiter for an outage is the wrong way round. A limiter exists
 * to keep the service available under abuse; taking the service down when the
 * limiter's store hiccups defeats the thing it was protecting. So this fails
 * open: if the store cannot answer, the request proceeds unthrottled.
 *
 * That is a real, deliberate weakening, and worth being explicit about. While
 * Redis is down there is no rate limiting — an attacker who could also take
 * Redis down could then brute-force freely. The alternative is a self-inflicted
 * outage on every Redis blip, which is both more likely and worse. Login
 * throttling is not the only defence on that path: credentials are bcrypt at
 * cost 12, and failures are logged.
 *
 * Errors are logged rather than swallowed, at most once every thirty seconds —
 * a limiter failing open on a busy service would otherwise write a line per
 * request and bury the one that matters.
 */
export class ResilientThrottlerStorage implements ThrottlerStorage {
  private readonly logger = new Logger(ResilientThrottlerStorage.name);

  /** Wall-clock of the last complaint, so the log is not flooded. */
  private lastReported = 0;

  private static readonly REPORT_EVERY_MS = 30_000;

  constructor(private readonly storage: ThrottlerStorage) {}

  async increment(
    key: string,
    ttl: number,
    limit: number,
    blockDuration: number,
    throttlerName: string,
  ): Promise<ThrottlerStorageRecord> {
    try {
      return await this.storage.increment(key, ttl, limit, blockDuration, throttlerName);
    } catch (error) {
      this.report(error);

      /*
        A record that reads as "first request in this window, not blocked".

        `totalHits: 0` rather than 1: the count is fiction either way, and the
        lower value cannot trip a limit on its own. `timeToExpire` is the full
        window so anything reading it for a Retry-After gets a sane number.
      */
      return {
        totalHits: 0,
        timeToExpire: Math.ceil(ttl / 1000),
        isBlocked: false,
        timeToBlockExpire: 0,
      };
    }
  }

  private report(error: unknown): void {
    const now = Date.now();
    if (now - this.lastReported < ResilientThrottlerStorage.REPORT_EVERY_MS) return;

    this.lastReported = now;
    const reason = error instanceof Error ? error.message : String(error);
    this.logger.error(
      `Rate limiting is disabled: the counter store is unreachable (${reason})`,
    );
  }
}
