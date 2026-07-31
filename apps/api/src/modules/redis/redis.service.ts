import { Injectable, Logger, type OnModuleDestroy } from '@nestjs/common';
import Redis from 'ioredis';

import { AppConfig } from '@/config/app.config';

/**
 * Thin wrapper over a single ioredis connection.
 *
 * Phase 1 uses Redis for the refresh-token revocation denylist, throttler
 * counters, and presence. Phase 3 adds the Socket.io adapter, which needs its own
 * duplicated connections — `duplicate()` is exposed for that.
 *
 * Everything cached here is reconstructible from Postgres by design: Redis is a
 * performance layer, never the system of record.
 */
@Injectable()
export class RedisService implements OnModuleDestroy {
  private readonly logger = new Logger(RedisService.name);
  readonly client: Redis;

  constructor(private readonly config: AppConfig) {
    const { host, port, password } = config.redis;

    this.client = new Redis({
      host,
      port,
      password,
      // Fail fast rather than queueing commands against a dead server; the health
      // probe then reports unready and the orchestrator stops routing traffic.
      maxRetriesPerRequest: 3,
      enableOfflineQueue: false,
      retryStrategy: (attempt) => Math.min(attempt * 200, 5_000),
    });

    this.client.on('error', (error: Error) => {
      this.logger.error(`Redis connection error: ${error.message}`);
    });
  }

  /**
   * A second connection, required by pub/sub clients that block the main one.
   *
   * `enableOfflineQueue` is re-enabled for duplicates. The main client keeps it
   * off so a request fails fast rather than hanging on a dead Redis, but a
   * pub/sub client subscribes the instant it is constructed — before the socket
   * has finished connecting — and with the queue disabled that first command
   * throws and takes the process down at boot.
   */
  duplicate(overrides: Record<string, unknown> = {}): Redis {
    return this.client.duplicate({ enableOfflineQueue: true, ...overrides });
  }

  /** Resolves once the connection is usable, or rejects if it fails to come up. */
  static async waitUntilReady(client: Redis): Promise<void> {
    if (client.status === 'ready') return;

    await new Promise<void>((resolve, reject) => {
      const onReady = () => {
        client.off('error', onError);
        resolve();
      };
      const onError = (error: Error) => {
        client.off('ready', onReady);
        reject(error);
      };

      client.once('ready', onReady);
      client.once('error', onError);
    });
  }

  async ping(): Promise<boolean> {
    try {
      return (await this.client.ping()) === 'PONG';
    } catch {
      return false;
    }
  }

  async setWithTtl(key: string, value: string, ttlSeconds: number): Promise<void> {
    await this.client.set(key, value, 'EX', ttlSeconds);
  }

  async exists(key: string): Promise<boolean> {
    return (await this.client.exists(key)) === 1;
  }

  async onModuleDestroy(): Promise<void> {
    await this.client.quit();
  }
}
