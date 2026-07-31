import { Injectable, Logger } from '@nestjs/common';
import { Interval } from '@nestjs/schedule';

import { RedisService } from '@/modules/redis/redis.service';

import { ChallengeEventsService } from './challenge-events.service';

/**
 * Closes public challenges whose voting deadline has passed.
 *
 * A vote window ends on a wall-clock date, and that has to be honoured whether
 * or not anyone is looking — so a sweep freezes the winner rather than waiting
 * for a manager to press a button. Ten seconds is fine: `phaseOf` already
 * reports the event finished the instant the deadline passes, so a vote is
 * refused immediately; this sweep only does the bookkeeping of picking the
 * winner a few seconds later.
 *
 * The Redis lock lets several API instances run this without any of them
 * resolving the same event twice.
 */
@Injectable()
export class ChallengeEventSchedulerService {
  private readonly logger = new Logger(ChallengeEventSchedulerService.name);
  private static readonly LOCK_KEY = 'lock:challenge-events:sweep';

  constructor(
    private readonly events: ChallengeEventsService,
    private readonly redis: RedisService,
  ) {}

  @Interval(10_000)
  async sweep(): Promise<void> {
    const token = Math.random().toString(36).slice(2);
    const acquired = await this.redis.client.set(
      ChallengeEventSchedulerService.LOCK_KEY,
      token,
      'PX',
      9000,
      'NX',
    );
    if (!acquired) return;

    try {
      const resolved = await this.events.resolveDueEvents();
      if (resolved > 0) {
        this.logger.log(`Resolved ${resolved} challenge event(s) at the vote deadline`);
      }
    } catch (error) {
      this.logger.error(`Challenge event sweep failed: ${(error as Error).message}`);
    } finally {
      const current = await this.redis.client.get(ChallengeEventSchedulerService.LOCK_KEY);
      if (current === token) await this.redis.client.del(ChallengeEventSchedulerService.LOCK_KEY);
    }
  }
}
