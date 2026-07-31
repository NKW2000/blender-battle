import { CallHandler, ExecutionContext, Injectable, NestInterceptor } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import type { Request } from 'express';
import type { Observable } from 'rxjs';
import { Repository } from 'typeorm';

import { RedisService } from '@/modules/redis/redis.service';
import { User } from '@/modules/users/entities/user.entity';

import type { AuthenticatedUser } from '../types/authenticated-user';

/**
 * Keeps `users.last_seen_at` current for authenticated traffic.
 *
 * Without this the column is only written at login, which makes every metric
 * derived from it wrong in the same direction: a player who signed in on Monday
 * and has been battling all week still reports a Monday timestamp, so "online
 * now" counts people who happened to re-authenticate in the last five minutes
 * and DAU/WAU/MAU measure logins rather than activity. With 7-day refresh
 * tokens, that is almost nobody.
 *
 * The write is throttled through Redis to one UPDATE per user per window, so a
 * player clicking around does not generate an UPDATE per request. It is also
 * fire-and-forget: presence tracking must never add latency to, or fail, the
 * request the user actually made.
 */
@Injectable()
export class LastSeenInterceptor implements NestInterceptor {
  /** One write per user per two minutes — well inside the 5-minute online window. */
  private static readonly WINDOW_SECONDS = 120;

  constructor(
    @InjectRepository(User) private readonly users: Repository<User>,
    private readonly redis: RedisService,
  ) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    const request = context.switchToHttp().getRequest<Request & { user?: AuthenticatedUser }>();
    const user = request.user;

    if (user?.id) {
      void this.touch(user.id);
    }

    return next.handle();
  }

  private async touch(userId: string): Promise<void> {
    try {
      const key = `presence:seen:${userId}`;
      const claimed = await this.redis.client.set(
        key,
        '1',
        'EX',
        LastSeenInterceptor.WINDOW_SECONDS,
        'NX',
      );

      if (!claimed) return;

      await this.users.update({ id: userId }, { lastSeenAt: () => 'now()' });
    } catch {
      // Presence is a nicety. A Redis blip or a lost UPDATE must not surface to
      // the caller, whose request has nothing to do with this.
    }
  }
}
