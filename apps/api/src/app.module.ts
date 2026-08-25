import { Module } from '@nestjs/common';
import { APP_FILTER, APP_GUARD, APP_INTERCEPTOR } from '@nestjs/core';
import { ScheduleModule } from '@nestjs/schedule';
import { ThrottlerGuard, ThrottlerModule } from '@nestjs/throttler';
import { TypeOrmModule } from '@nestjs/typeorm';
import Redis from 'ioredis';
import { WinstonModule } from 'nest-winston';
import { ThrottlerStorageRedisService } from 'nestjs-throttler-storage-redis';

import { AllExceptionsFilter } from '@/common/filters/all-exceptions.filter';
import { JwtAuthGuard } from '@/common/guards/jwt-auth.guard';
import { RolesGuard } from '@/common/guards/roles.guard';
import { LastSeenInterceptor } from '@/common/interceptors/last-seen.interceptor';
import { ResponseInterceptor } from '@/common/interceptors/response.interceptor';
import { buildWinstonOptions } from '@/common/logger/winston.config';
import { ResilientThrottlerStorage } from '@/common/throttler/resilient-throttler-storage';
import { AppConfig } from '@/config/app.config';
import { ConfigModule } from '@/config/config.module';
import { DatabaseModule } from '@/database/database.module';
import { User } from '@/modules/users/entities/user.entity';
import { MaintenanceModule } from '@/modules/maintenance/maintenance.module';
import { ActivityLogModule } from '@/modules/activity-log/activity-log.module';
import { AnalyticsModule } from '@/modules/analytics/analytics.module';
import { AuthModule } from '@/modules/auth/auth.module';
import { RoomsModule } from '@/modules/rooms/rooms.module';
import { ChallengesModule } from '@/modules/challenges/challenges.module';
import { NotificationsModule } from '@/modules/notifications/notifications.module';
import { HealthModule } from '@/modules/health/health.module';
import { MailModule } from '@/modules/mail/mail.module';
import { RedisModule } from '@/modules/redis/redis.module';
import { UploadsModule } from '@/modules/uploads/uploads.module';
import { UsersModule } from '@/modules/users/users.module';

@Module({
  imports: [
    ConfigModule,
    RedisModule,
    MailModule,
    DatabaseModule,
    // The global LastSeenInterceptor writes to users directly.
    TypeOrmModule.forFeature([User]),
    // Drives the battle sweeper that owns every timed phase transition.
    ScheduleModule.forRoot(),
    WinstonModule.forRootAsync({
      inject: [AppConfig],
      useFactory: (config: AppConfig) =>
        buildWinstonOptions(config.logLevel, config.isProduction),
    }),
    // Redis-backed storage, not in-memory: with more than one API instance an
    // in-memory counter multiplies the effective limit by the instance count,
    // which is the same as having no limit at all.
    ThrottlerModule.forRootAsync({
      inject: [AppConfig],
      useFactory: (config: AppConfig) => {
        // Bound to a local so the `in` check narrows: TypeScript cannot narrow a
        // getter across two separate property reads.
        const redis = config.redis;

        return {
          throttlers: [
            {
              ttl: config.throttle.ttlSeconds * 1000,
              limit: config.throttle.limit,
            },
  ],
          /*
            Wrapped so an unreachable Redis costs rate limiting, not the site.

            The guard runs first on every request, so an error here is a 500 on
            every route — including `/health`, whose whole purpose is to answer
            without touching a dependency. See ResilientThrottlerStorage for
            what failing open does and does not give up.
          */
          storage: new ResilientThrottlerStorage(
            new ThrottlerStorageRedisService(throttlerRedis(redis)),
          ),
        };
      },
    }),
    ActivityLogModule,
    AuthModule,
    UsersModule,
    ChallengesModule,
    RoomsModule,
    AnalyticsModule,
    NotificationsModule,
    UploadsModule,
    HealthModule,
    // Exposes the scheduled sweeps over HTTP, for hosts with no process to run
    // `@Interval` in. See `MaintenanceController`.
    MaintenanceModule,
  ],
  providers: [
    // Guard order matters: throttle before authentication so an unauthenticated
    // flood is rejected without spending a JWT verification, then authenticate,
    // then authorise.
    { provide: APP_GUARD, useClass: ThrottlerGuard },
    { provide: APP_GUARD, useClass: JwtAuthGuard },
    { provide: APP_GUARD, useClass: RolesGuard },
    // Before the envelope interceptor: it only reads req.user and returns the
    // stream untouched, so ordering is about intent, not correctness.
    { provide: APP_INTERCEPTOR, useClass: LastSeenInterceptor },
    { provide: APP_INTERCEPTOR, useClass: ResponseInterceptor },
    { provide: APP_FILTER, useClass: AllExceptionsFilter },
  ],
})
export class AppModule {}

/**
 * The Redis client the rate limiter counts in.
 *
 * Built here rather than letting the storage service construct its own, for one
 * setting: `maxRetriesPerRequest`. The default is 20, so when Redis is
 * unreachable every single request spends about three seconds retrying before
 * the wrapper can fail it open — a broken `REDIS_URL` becomes a three-second tax
 * on the whole site rather than a missing rate limit. One attempt is enough to
 * distinguish "up" from "down".
 *
 * An `error` listener is attached because ioredis treats an unhandled one as an
 * unhandled exception. The wrapper already logs the reason when a lookup fails,
 * so this only needs to keep the event from killing the process.
 */
function throttlerRedis(redis: { url: string } | { host: string; port: number; password?: string }) {
  const options = { maxRetriesPerRequest: 1, enableOfflineQueue: false };
  const client = 'url' in redis ? new Redis(redis.url, options) : new Redis({ ...redis, ...options });

  client.on('error', () => {
    // Deliberately empty. ResilientThrottlerStorage reports the failure once per
    // thirty seconds; logging every reconnection attempt here would drown it.
  });

  return client;
}
