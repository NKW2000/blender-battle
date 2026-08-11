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

  /**
   * Connection details in one shape, whichever form the environment supplied.
   *
   * A URL wins when present, so a managed provider's single string can be pasted
   * in without also unpacking it into five variables. `sslmode=require` in the
   * query string counts as asking for TLS — Supabase's pooler string carries it,
   * and honouring it there avoids a working URL that silently connects in the
   * clear because DATABASE_SSL was left at its default.
   *
   * The schema guarantees one complete form exists, so the non-null assertions
   * below cannot fire on a booted process.
   */
  get database() {
    const url = this.get('DATABASE_URL');

    if (url) {
      const parsed = new URL(url);
      return {
        host: parsed.hostname,
        port: parsed.port ? Number(parsed.port) : 5432,
        username: decodeURIComponent(parsed.username),
        password: decodeURIComponent(parsed.password),
        // Leading slash off the pathname.
        database: parsed.pathname.slice(1),
        ssl: this.get('DATABASE_SSL') || /sslmode=(require|verify)/.test(parsed.search),
      };
    }

    return {
      host: this.get('DATABASE_HOST')!,
      port: this.get('DATABASE_PORT'),
      username: this.get('DATABASE_USER')!,
      password: this.get('DATABASE_PASSWORD')!,
      database: this.get('DATABASE_NAME')!,
      ssl: this.get('DATABASE_SSL'),
    };
  }

  /**
   * Either a ready-made URL for ioredis, or the discrete parts. Returned as a
   * discriminated shape so the caller cannot accidentally pass both.
   */
  get redis(): { url: string } | { host: string; port: number; password?: string } {
    const url = this.get('REDIS_URL');
    if (url) return { url };

    return {
      host: this.get('REDIS_HOST')!,
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
      /*
        The refresh lifetime in seconds.

        Parsed here as well as in TokenService so the cookie's `maxAge` and the
        token's own expiry come from one string. A cookie that outlives its
        token produces 401s on a credential the browser still believes in;
        one that dies first signs people out early for no reason.
      */
      refreshTtlSeconds: parseDuration(this.get('JWT_REFRESH_TTL')),
    };
  }

  get cloudinary() {
    return {
      cloudName: this.get('CLOUDINARY_CLOUD_NAME'),
      apiKey: this.get('CLOUDINARY_API_KEY'),
      apiSecret: this.get('CLOUDINARY_API_SECRET'),
    };
  }

  /** Whether to apply pending migrations at boot. See the env schema. */
  get runMigrationsOnBoot(): boolean {
    return this.get('RUN_MIGRATIONS_ON_BOOT');
  }

  get mail() {
    return {
      driver: this.get('MAIL_DRIVER'),
      apiKey: this.get('RESEND_API_KEY'),
      from: this.get('MAIL_FROM'),
      /** Reset and verification links point back at the web app, not the API. */
      frontendUrl: this.get('FRONTEND_URL'),
      smtp: {
        host: this.get('SMTP_HOST'),
        port: this.get('SMTP_PORT'),
        user: this.get('SMTP_USER'),
        /*
          Whitespace stripped.

          Google displays an App Password as four groups of four — "abcd efgh
          ijkl mnop" — and it is copied that way far more often than not. The
          spaces are presentation, not part of the secret, and leaving them in
          produces an authentication failure whose message says nothing about
          spaces.
        */
        password: this.get('SMTP_PASSWORD')?.replace(/\s+/g, ''),
      },
    };
  }

  get oauth() {
    return {
      callbackBase: this.get('OAUTH_CALLBACK_BASE'),
      frontendUrl: this.get('FRONTEND_URL'),
      /*
        Apple has no client secret to paste.

        It wants a short-lived ES256 JWT, signed with a private key downloaded
        once from the developer portal, naming the team that owns the key and
        the key itself. So four values rather than two, and the "secret" is
        computed per request rather than configured.
      */
      apple: {
        /** The Services ID, not the app's bundle id. */
        clientId: this.get('APPLE_CLIENT_ID'),
        teamId: this.get('APPLE_TEAM_ID'),
        keyId: this.get('APPLE_KEY_ID'),
        /*
          The .p8 file's contents.

          Real newlines rarely survive a dashboard environment field, so a
          two-character backslash-n is accepted and turned back into one. PEM is
          line-sensitive: without this the key parses as malformed and Apple
          reports only `invalid_client`, which says nothing about why.
        */
        privateKey: this.get('APPLE_PRIVATE_KEY')?.replace(/\\n/g, '\n'),
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

/**
 * `15m`, `7d` and friends into seconds.
 *
 * Duplicated deliberately rather than imported from TokenService: config must
 * not depend on a module that depends on config.
 */
function parseDuration(value: string): number {
  const match = /^(\d+)([smhd])$/.exec(value);
  if (!match) throw new Error(`Unparseable duration: ${value}`);

  const multipliers: Record<string, number> = { s: 1, m: 60, h: 3600, d: 86400 };
  return Number(match[1]) * (multipliers[match[2] as string] ?? 1);
}
