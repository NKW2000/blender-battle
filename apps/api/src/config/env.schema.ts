import { z } from 'zod';

/**
 * Boot-time environment contract.
 *
 * Every value the application depends on is declared here and parsed before the
 * Nest container is built. A missing or malformed variable stops the process with
 * a readable report — the container must never come up half-configured and fail
 * later under real traffic.
 */

/**
 * Environment values are always strings, and `z.coerce.boolean()` applies
 * JavaScript truthiness — which makes the string "false" parse as true. Parsing
 * the text explicitly is the only correct reading of a boolean env var.
 */
const booleanString = (fallback: boolean) =>
  z
    .enum(['true', 'false', '1', '0'])
    .default(fallback ? 'true' : 'false')
    .transform((value) => value === 'true' || value === '1');

const durationString = (fallback: string) =>
  z
    .string()
    .regex(/^\d+[smhd]$/, 'must look like 15m, 7d, 3600s')
    .default(fallback);

export const envSchema = z
  .object({
    NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
    PORT: z.coerce.number().int().positive().default(4000),
    /** Comma-separated list of allowed browser origins. */
    CORS_ORIGINS: z.string().min(1),

    DATABASE_HOST: z.string().min(1),
    DATABASE_PORT: z.coerce.number().int().positive().default(5432),
    DATABASE_USER: z.string().min(1),
    DATABASE_PASSWORD: z.string().min(1),
    DATABASE_NAME: z.string().min(1),
    DATABASE_SSL: booleanString(false),

    REDIS_HOST: z.string().min(1),
    REDIS_PORT: z.coerce.number().int().positive().default(6379),
    REDIS_PASSWORD: z.string().optional(),

    /**
     * Separate secrets for access and refresh tokens. Sharing one secret means a
     * leaked access token can be replayed as a refresh token.
     */
    JWT_ACCESS_SECRET: z.string().min(32, 'must be at least 32 characters'),
    JWT_REFRESH_SECRET: z.string().min(32, 'must be at least 32 characters'),
    JWT_ACCESS_TTL: durationString('15m'),
    JWT_REFRESH_TTL: durationString('7d'),

    CLOUDINARY_CLOUD_NAME: z.string().min(1),
    CLOUDINARY_API_KEY: z.string().min(1),
    CLOUDINARY_API_SECRET: z.string().min(1),

    /**
     * OAuth providers are optional. Each is enabled only when both of its
     * credentials are present, so an instance that has not registered a Discord
     * application still boots — it simply does not offer that button. Making
     * these required would mean nobody can run the platform without first
     * creating accounts at two third parties.
     */
    DISCORD_CLIENT_ID: z.string().optional(),
    DISCORD_CLIENT_SECRET: z.string().optional(),
    GOOGLE_CLIENT_ID: z.string().optional(),
    GOOGLE_CLIENT_SECRET: z.string().optional(),
    /** Where providers send the browser back. Must match the app's own origin. */
    OAUTH_CALLBACK_BASE: z.string().url().default('http://localhost:4000'),
    /** Where the API sends the browser after a successful sign-in. */
    FRONTEND_URL: z.string().url().default('http://localhost:3000'),

    LOG_LEVEL: z.enum(['error', 'warn', 'info', 'debug', 'verbose']).default('info'),
    THROTTLE_TTL_SECONDS: z.coerce.number().int().positive().default(60),
    THROTTLE_LIMIT: z.coerce.number().int().positive().default(100),
  })
  .superRefine((env, ctx) => {
    if (env.JWT_ACCESS_SECRET === env.JWT_REFRESH_SECRET) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['JWT_REFRESH_SECRET'],
        message: 'must differ from JWT_ACCESS_SECRET',
      });
    }
  });

export type Env = z.infer<typeof envSchema>;

/**
 * Parses `process.env` and throws a single aggregated, readable error.
 * Wired into ConfigModule.forRoot({ validate }) so it runs before anything else.
 */
export function validateEnv(raw: Record<string, unknown>): Env {
  const result = envSchema.safeParse(raw);

  if (!result.success) {
    const lines = result.error.issues.map(
      (issue) => `  - ${issue.path.join('.') || '(root)'}: ${issue.message}`,
    );
    throw new Error(`Invalid environment configuration:\n${lines.join('\n')}`);
  }

  return result.data;
}
