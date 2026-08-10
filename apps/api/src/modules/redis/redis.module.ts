import { Global, Module } from '@nestjs/common';

import { RedisService } from './redis.service';

/** Global: auth token cleanup, throttling, and every scheduler lock need it. */
@Global()
@Module({
  providers: [RedisService],
  exports: [RedisService],
})
export class RedisModule {}
