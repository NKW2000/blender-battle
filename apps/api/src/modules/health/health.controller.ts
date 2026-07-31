import {
  Controller,
  Get,
  ServiceUnavailableException,
  VERSION_NEUTRAL,
} from '@nestjs/common';
import { HealthCheck, HealthCheckService, TypeOrmHealthIndicator } from '@nestjs/terminus';

import { Public } from '@/common/decorators';
import { RedisService } from '@/modules/redis/redis.service';

/**
 * Two probes with different jobs:
 *
 * `/health`   — liveness. Is the process running? Never touches a dependency: a
 *               database blip must not make the orchestrator kill and restart a
 *               perfectly healthy container.
 * `/health/ready` — readiness. Can this instance actually serve traffic? Checks
 *               Postgres and Redis, so a broken instance is pulled out of the load
 *               balancer instead of returning errors to users.
 */
@Controller({ path: 'health', version: VERSION_NEUTRAL })
export class HealthController {
  constructor(
    private readonly health: HealthCheckService,
    private readonly database: TypeOrmHealthIndicator,
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
      () => this.database.pingCheck('postgres', { timeout: 3000 }),
      async () => {
        const alive = await this.redis.ping();
        if (!alive) throw new ServiceUnavailableException('redis unreachable');
        return { redis: { status: 'up' } };
      },
    ]);
  }
}
