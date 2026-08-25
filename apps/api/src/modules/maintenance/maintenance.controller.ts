import { Controller, Get, Headers, Post, HttpCode, HttpStatus } from '@nestjs/common';
import { ApiErrorCode } from '@bb/shared';
import { timingSafeEqual } from 'node:crypto';

import { Public } from '@/common/decorators';
import { AppException } from '@/common/exceptions/app.exception';
import { AppConfig } from '@/config/app.config';
import { TokenCleanupService } from '@/modules/auth/services/token-cleanup.service';
import { ChallengeEventSchedulerService } from '@/modules/challenges/challenge-event-scheduler.service';
import { RoomSchedulerService } from '@/modules/rooms/room-scheduler.service';

/**
 * The scheduled work, reachable over HTTP.
 *
 * On a host that runs a process, `@Interval` and `@Cron` fire and this endpoint
 * is never needed. On a serverless host there is nothing alive between requests
 * for those decorators to fire in, so the same methods have to be triggered
 * from outside — Vercel Cron, an uptime pinger, anything that can make a
 * request on a schedule.
 *
 * It calls the schedulers rather than reimplementing them. Two copies of "close
 * the rooms whose deadline has passed" would be two things to keep in step, and
 * the copy that drifts is the one nobody is watching.
 *
 * Everything it triggers already takes a Redis lock and is safe to run twice,
 * because that is what a distributed scheduler needed anyway — so a cron that
 * overlaps a still-running sweep, or a host that runs both the interval and the
 * cron, costs a wasted request rather than a double advance.
 */
@Controller('maintenance')
export class MaintenanceController {
  constructor(
    private readonly rooms: RoomSchedulerService,
    private readonly events: ChallengeEventSchedulerService,
    private readonly tokens: TokenCleanupService,
    private readonly config: AppConfig,
  ) {}

  /**
   * Runs every sweep once.
   *
   * `GET` because that is what Vercel Cron issues, and `POST` for anything else
   * that would rather not use a verb with side effects. The work is idempotent
   * either way — the locks and the conditional updates behind it are what make
   * that true, not the verb.
   */
  @Public()
  @Get('sweep')
  @Post('sweep')
  @HttpCode(HttpStatus.OK)
  async sweep(@Headers('authorization') authorization?: string) {
    this.assertAuthorised(authorization);

    /*
      Settled, not raced.

      One sweep failing must not stop the others from running: a Redis blip in
      the token prune should not leave rooms sitting past their deadline. Each
      result is reported so a cron log shows which half worked.
    */
    const [rooms, events, tokens] = await Promise.allSettled([
      this.rooms.sweep(),
      this.events.sweep(),
      this.tokens.prune(),
    ]);

    const outcome = (result: PromiseSettledResult<unknown>) =>
      result.status === 'fulfilled' ? 'ok' : (result.reason as Error).message;

    return {
      rooms: outcome(rooms),
      challengeEvents: outcome(events),
      tokens: outcome(tokens),
    };
  }

  /**
   * A shared secret, compared in constant time.
   *
   * This endpoint advances contests and deletes rows, so it cannot be open.
   * Vercel Cron sends `Authorization: Bearer $CRON_SECRET`, which is the
   * convention followed here.
   *
   * With no secret configured the endpoint refuses rather than allowing: an
   * unset variable is far more likely to be an oversight than a decision to run
   * maintenance unauthenticated, and failing closed makes that oversight
   * visible instead of silently exposing it.
   */
  private assertAuthorised(authorization?: string): void {
    const expected = this.config.cronSecret;

    if (!expected) {
      throw new AppException(
        ApiErrorCode.FORBIDDEN,
        'CRON_SECRET is not configured, so scheduled maintenance cannot be triggered over HTTP.',
        HttpStatus.FORBIDDEN,
      );
    }

    const supplied = authorization?.replace(/^Bearer\s+/i, '') ?? '';
    const a = Buffer.from(supplied);
    const b = Buffer.from(expected);

    // Length-checked first: `timingSafeEqual` throws on a mismatch rather than
    // returning false, which would leak the secret's length through the shape
    // of the failure.
    if (a.length !== b.length || !timingSafeEqual(a, b)) {
      throw new AppException(ApiErrorCode.FORBIDDEN, 'Not authorised.', HttpStatus.FORBIDDEN);
    }
  }
}
