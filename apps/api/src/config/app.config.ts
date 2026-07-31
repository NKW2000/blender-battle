import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

import type { Env } from './env.schema';

/**
 * Typed accessor over ConfigService. Services inject this instead of reading
 * `process.env` or stringly-typed `config.get('SOME_KEY')` call sites, so a renamed
 * variable is a compile error rather than a runtime `undefined`.
 */
@Injectable()
export class AppConfig {
  constructor(private readonly config: ConfigService<Env, true>) {}

  private get<K extends keyof Env>(key: K): Env[K] {
    return this.config.get(key, { infer: true });
  }

  get nodeEnv(): Env['NODE_ENV'] {
    return this.get('NODE_ENV');
  }

  get isProduction(): boolean {
    return this.nodeEnv === 'production';
  }

  get port(): number {
    return this.get('PORT');
  }

  get corsOrigins(): string[] {
    return this.get('CORS_ORIGINS')
      .split(',')
      .map((origin) => origin.trim())
      .filter(Boolean);
  }

  get logLevel(): Env['LOG_LEVEL'] {
    return this.get('LOG_LEVEL');
  }

  get database() {
    return {
      host: this.get('DATABASE_HOST'),
      port: this.get('DATABASE_PORT'),
      username: this.get('DATABASE_USER'),
      password: this.get('DATABASE_PASSWORD'),
      database: this.get('DATABASE_NAME'),
      ssl: this.get('DATABASE_SSL'),
    };
  }

  get redis() {
    return {
      host: this.get('REDIS_HOST'),
      port: this.get('REDIS_PORT'),
      password: this.get('REDIS_PASSWORD'),
    };
  }

  get jwt() {
    return {
      accessSecret: this.get('JWT_ACCESS_SECRET'),
      refreshSecret: this.get('JWT_REFRESH_SECRET'),
      accessTtl: this.get('JWT_ACCESS_TTL'),
      refreshTtl: this.get('JWT_REFRESH_TTL'),
    };
  }

  get cloudinary() {
    return {
      cloudName: this.get('CLOUDINARY_CLOUD_NAME'),
      apiKey: this.get('CLOUDINARY_API_KEY'),
      apiSecret: this.get('CLOUDINARY_API_SECRET'),
    };
  }

  get oauth() {
    return {
      callbackBase: this.get('OAUTH_CALLBACK_BASE'),
      frontendUrl: this.get('FRONTEND_URL'),
      discord: {
        clientId: this.get('DISCORD_CLIENT_ID'),
        clientSecret: this.get('DISCORD_CLIENT_SECRET'),
      },
      google: {
        clientId: this.get('GOOGLE_CLIENT_ID'),
        clientSecret: this.get('GOOGLE_CLIENT_SECRET'),
      },
    };
  }

  get throttle() {
    return {
      ttlSeconds: this.get('THROTTLE_TTL_SECONDS'),
      limit: this.get('THROTTLE_LIMIT'),
    };
  }
}
