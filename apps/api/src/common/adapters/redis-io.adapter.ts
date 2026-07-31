import { IoAdapter } from '@nestjs/platform-socket.io';
import { createAdapter } from '@socket.io/redis-adapter';
import type { INestApplicationContext } from '@nestjs/common';
import { Logger } from '@nestjs/common';
import type { ServerOptions } from 'socket.io';

import { RedisService } from '@/modules/redis/redis.service';

/**
 * Socket.IO backed by Redis pub/sub.
 *
 * Without this, `server.to(room).emit(...)` only reaches sockets attached to the
 * instance that called it. Two spectators watching the same battle through
 * different instances would see different vote tallies, and a phase change swept
 * by instance A would never reach anyone on instance B — the battle would appear
 * frozen for half the audience.
 *
 * Pub/sub needs its own connections: the subscriber connection is in subscriber
 * mode and cannot serve ordinary commands, so neither may be the shared client.
 */
export class RedisIoAdapter extends IoAdapter {
  private readonly logger = new Logger(RedisIoAdapter.name);
  private adapterConstructor?: ReturnType<typeof createAdapter>;

  constructor(private readonly app: INestApplicationContext) {
    super(app);
  }

  async connectToRedis(): Promise<void> {
    const redis = this.app.get(RedisService);

    const pubClient = redis.duplicate();
    const subClient = redis.duplicate();

    // The adapter subscribes the moment it is constructed. Both connections must
    // therefore be established first, or that subscribe is issued against a
    // socket that is not writeable yet.
    await Promise.all([
      RedisService.waitUntilReady(pubClient),
      RedisService.waitUntilReady(subClient),
    ]);

    this.adapterConstructor = createAdapter(pubClient, subClient);
    this.logger.log('Socket.IO Redis adapter connected');
  }

  override createIOServer(port: number, options?: ServerOptions): unknown {
    const server = super.createIOServer(port, options);

    if (this.adapterConstructor) {
      (server as { adapter: (a: unknown) => void }).adapter(this.adapterConstructor);
    }

    return server;
  }
}
