import {
  Controller,
  Get,
  ServiceUnavailableException,
  VERSION_NEUTRAL,
} from '@nestjs/common';
import { HealthCheck, HealthCheckService, type HealthIndicatorResult } from '@nestjs/terminus';
import { SkipThrottle } from '@nestjs/throttler';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';

import { Public } from '@/common/decorators';
import { RedisService } from '@/modules/redis/redis.service';

const POSTGRES_PING_TIMEOUT_MS = 3000;

/**
 * Two probes with different jobs:
 *
 * `/health`   — liveness. Is the process running? Never touches a dependency: a
 *               database blip must not make the orchestrator kill and restart a
 *               perfectly healthy container.
 * `/health/ready` — readiness. Can this instance actually serve traffic? Checks
 *               Postgres and Redis, so a broken instance is pulled out of the load
 *               balancer instead of returning errors to users.
 *
 * Postgres is checked through the injected `DataSource` rather than Terminus's
 * `TypeOrmHealthIndicator`. The indicator resolves `typeorm` by name at runtime,
 * which a bundler cannot follow — and Nest's package loader responds to a miss by
 * calling `process.exit(1)`. On a serverless deployment that killed the function
 * during startup, so every route returned a crash page with no message and even
 * the entry point's own error reporting never ran. A static import of the type we
 * already depend on cannot fail that way.
 */
/*
  Not rate limited.

  The throttler counts in Redis, so leaving these probes inside it makes a
  liveness check depend on the very infrastructure it is meant to report on —
  and an unreachable Redis then answers "unhealthy" for a process that is
  perfectly fine. Both routes are cheap and neither reads a request body.
*/
@SkipThrottle()
@Controller({ path: 'health', version: VERSION_NEUTRAL })
export class HealthController {
  constructor(
    private readonly health: HealthCheckService,
    @InjectDataSource() private readonly dataSource: DataSource,
    private readonly redis: RedisService,
  ) {}

  @Public()
  @Get()
  liveness(): { status: string; uptime: number } {
    return { status: 'ok', uptime: Math.floor(process.uptime()) };
  }

  @Public()
  @Get('ready')
  @HealthCheck()
  async readiness() {
    return this.health.check([
      () => this.pingPostgres(),
      async () => {
        const alive = await this.redis.ping();
        if (!alive) throw new ServiceUnavailableException('redis unreachable');
        return { redis: { status: 'up' } };
      },
    ]);
  }

  /**
   * A real round trip to Postgres, bounded.
   *
   * The timeout matters more than the query: an unreachable database usually
   * fails by hanging rather than by refusing, and a readiness probe that waits
   * forever tells the load balancer nothing while holding the request open.
   */
  private async pingPostgres(): Promise<HealthIndicatorResult> {
    let timer: NodeJS.Timeout | undefined;

    try {
      await Promise.race([
        this.dataSource.query('SELECT 1'),
        new Promise((_, reject) => {
          timer = setTimeout(
            () => reject(new Error('timed out')),
            POSTGRES_PING_TIMEOUT_MS,
          );
        }),
      ]);

      return { postgres: { status: 'up' } };
    } catch {
      // The reason is deliberately not echoed: this endpoint is public, and a
      // connection error carries the host and user of the database.
      throw new ServiceUnavailableException('postgres unreachable');
    } finally {
      clearTimeout(timer);
    }
  }
}
