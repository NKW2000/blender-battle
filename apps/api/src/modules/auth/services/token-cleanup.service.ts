import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';

import { RedisService } from '@/modules/redis/redis.service';

import { TokenService } from './token.service';

/**
 * Deletes refresh tokens that expired without ever being rotated.
 *
 * `TokenService.pruneExpiredTokens` was written for this and never scheduled,
 * so the table only ever grew: every session that was abandoned rather than
 * logged out left a row behind permanently. Nothing breaks, which is why it
 * went unnoticed — the cost is a table that gets slower and a backup that gets
 * bigger, on a free-tier database with a storage cap.
 *
 * Deliberately only unused, expired tokens. A *used* token is the audit trail
 * that makes reuse detection meaningful: rotation marks the old row used and
 * points it at its replacement, and deleting that history would turn a replayed
 * stolen token from "detected theft" into "unknown token", which is reported as
 * an ordinary expiry. Those rows are cleaned up by the family's own cascade
 * when a session ends.
 */
@Injectable()
export class TokenCleanupService {
  private readonly logger = new Logger(TokenCleanupService.name);
  private static readonly LOCK_KEY = 'lock:auth:token-prune';

  constructor(
    private readonly tokens: TokenService,
    private readonly redis: RedisService,
  ) {}

  /**
   * Daily, off the hour.
   *
   * Nothing depends on this running promptly — a row that lingers an extra day
   * costs nothing — so it is scheduled for the quietest time rather than run
   * frequently. The lock means several API instances do not all issue the same
   * DELETE.
   */
  @Cron(CronExpression.EVERY_DAY_AT_3AM)
  async prune(): Promise<void> {
    // Long TTL relative to the work: a large first sweep on a table that has
    // been accumulating since launch may take a while, and losing the lock
    // mid-delete would let a second instance start the same scan.
    const token = Math.random().toString(36).slice(2);
    const acquired = await this.redis.client.set(
      TokenCleanupService.LOCK_KEY,
      token,
      'EX',
      600,
      'NX',
    );
    if (!acquired) return;

    try {
      const removed = await this.tokens.pruneExpiredTokens();
      if (removed > 0) this.logger.log(`Pruned ${removed} expired refresh token(s)`);
    } catch (error) {
      // Housekeeping. A failure here must not take anything else down with it;
      // the next run picks up whatever this one missed.
      this.logger.error(`Token prune failed: ${(error as Error).message}`);
    } finally {
      const current = await this.redis.client.get(TokenCleanupService.LOCK_KEY);
      if (current === token) await this.redis.client.del(TokenCleanupService.LOCK_KEY);
    }
  }
}
