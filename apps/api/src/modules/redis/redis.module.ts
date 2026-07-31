import { Global, Module } from '@nestjs/common';

import { RedisService } from './redis.service';

/** Global: auth, throttling, and (from Phase 3) the socket adapter all need it. */
@Global()
@Module({
  providers: [RedisService],
  exports: [RedisService],
})
export class RedisModule {}
