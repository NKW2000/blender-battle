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

    /**
     * Managed providers hand out one connection string, not five fields.
     * Supabase, Render and Railway all do it, so a URL is accepted and takes
     * precedence over the discrete variables. The discrete form is kept for
     * docker-compose, where the parts are what the compose file knows.
     *
     * Neither form carries a default. Exactly one must be supplied in full, and
     * `superRefine` below enforces that — a default here would let a production
     * container that is missing its database configuration boot anyway and
     * quietly dial localhost, which is the failure this schema exists to prevent.
     */
    DATABASE_URL: z.string().url().optional(),

    /**
     * Apply pending migrations when the API boots.
     *
     * Off by default, because a migration that fails then takes the process
     * down with it rather than failing in a terminal where someone is watching.
     *
     * It exists because the alternative was worse for this deployment: the
     * machine holding the repository cannot open a Postgres connection at all —
     * TCP connects and the protocol goes silent, a middlebox on the network —
     * so `migration:run` cannot be run from where the migrations live, and the
     * schema was being moved by pasting SQL into a web console. That is a
     * process that works until the day someone pastes half of it.
     *
     * Safe here specifically because the API runs as a single instance. With
     * several, two booting at once would race for the same migration; TypeORM
     * takes a lock, but the loser waits on it rather than skipping, and a slow
     * migration would hold up every replica's startup.
     */
    RUN_MIGRATIONS_ON_BOOT: z
      .enum(['true', 'false'])
      .default('false')
      .transform((value) => value === 'true'),
    DATABASE_HOST: z.string().min(1).optional(),
    DATABASE_PORT: z.coerce.number().int().positive().default(5432),
    DATABASE_USER: z.string().min(1).optional(),
    DATABASE_PASSWORD: z.string().min(1).optional(),
    DATABASE_NAME: z.string().min(1).optional(),
    DATABASE_SSL: booleanString(false),

    /** As DATABASE_URL. `rediss://` selects TLS, which hosted Redis usually needs. */
    REDIS_URL: z.string().url().optional(),
    REDIS_HOST: z.string().min(1).optional(),
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
     * credentials are present, so an instance that has not registered an Apple
     * application still boots — it simply does not offer that button. Making
     * these required would mean nobody can run the platform without first
     * creating accounts at two third parties.
     */
    /**
     * Whether voting requires a confirmed email address.
     *
     * Off by default, which is a deliberate reversal. The gate is a good one —
     * voting is the point at which an anonymous inbox becomes influence over
     * someone else's result — but it is only a gate if the confirmation email
     * can actually arrive. With no working mail driver it stops being an
     * anti-sockpuppet measure and becomes "nobody may vote", which is worse
     * than the abuse it was written to prevent and much harder to diagnose from
     * the outside.
     *
     * Turn it on in the same change that makes mail work, not before.
     */
    REQUIRE_VERIFIED_EMAIL_TO_VOTE: z
      .enum(['true', 'false'])
      .default('false')
      .transform((value) => value === 'true'),

    APPLE_CLIENT_ID: z.string().optional(),
    APPLE_TEAM_ID: z.string().optional(),
    APPLE_KEY_ID: z.string().optional(),
    APPLE_PRIVATE_KEY: z.string().optional(),
    GOOGLE_CLIENT_ID: z.string().optional(),
    GOOGLE_CLIENT_SECRET: z.string().optional(),
    /** Where providers send the browser back. Must match the app's own origin. */
    OAUTH_CALLBACK_BASE: z.string().url().default('http://localhost:4000'),
    /** Where the API sends the browser after a successful sign-in. */
    FRONTEND_URL: z.string().url().default('http://localhost:3000'),

    /**
     * How transactional email leaves the process.
     *
     * `log` writes the whole message to the application log and sends nothing.
     * That is the default deliberately: it makes password reset work end to end
     * on a developer machine with no account anywhere, and it means a
     * misconfigured production deploy fails loudly at boot (see the refinement
     * below) rather than silently dropping recovery emails.
     */
    MAIL_DRIVER: z.enum(['log', 'resend', 'sendgrid', 'brevo', 'smtp']).default('log'),
    /**
     * The provider key, whichever provider is selected.
     *
     * One variable rather than one per provider: exactly one driver is ever
     * active, and a second key sitting unused is a second secret to rotate and
     * a second thing to get wrong. Named for Resend because it came first;
     * renaming it now would break every existing deployment for no gain.
     */
    RESEND_API_KEY: z.string().optional(),
    /** Must be an address on a domain verified with the provider. */
    MAIL_FROM: z.string().default('Blender Battle <onboarding@resend.dev>'),

    /*
      Plain SMTP, for `MAIL_DRIVER=smtp`.

      Exists because every hosted provider gates sending behind a signup that
      can refuse you, and a mail driver you cannot get credentials for is not a
      mail driver. An SMTP account you already have — Gmail, Fastmail, a work
      mailbox — has no such gate.

      For Gmail: host `smtp.gmail.com`, port 465, user is the full address, and
      the password is an App Password (Google account → Security → 2-Step
      Verification → App passwords). Your normal password will not work, and
      should not be put here.
    */
    SMTP_HOST: z.string().optional(),
    SMTP_PORT: z.coerce.number().int().positive().default(465),
    SMTP_USER: z.string().optional(),
    SMTP_PASSWORD: z.string().optional(),

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

    // One complete form of each connection, never a half-populated set.
    if (!env.DATABASE_URL) {
      for (const key of ['DATABASE_HOST', 'DATABASE_USER', 'DATABASE_PASSWORD', 'DATABASE_NAME'] as const) {
        if (!env[key]) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            path: [key],
            message: 'required unless DATABASE_URL is set',
          });
        }
      }
    }

    /*
      A driver that cannot send is worse than no driver: password reset would
      appear to work and quietly deliver nothing. Each driver is checked for
      what it actually needs, so a half-finished configuration fails at boot
      with the name of the missing variable rather than at 3am in a log nobody
      is reading.
    */
    if (env.MAIL_DRIVER === 'smtp') {
      for (const key of ['SMTP_HOST', 'SMTP_USER', 'SMTP_PASSWORD'] as const) {
        if (!env[key]) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            path: [key],
            message: 'required when MAIL_DRIVER is "smtp"',
          });
        }
      }
    } else if (env.MAIL_DRIVER !== 'log' && !env.RESEND_API_KEY) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['RESEND_API_KEY'],
        message: `required when MAIL_DRIVER is "${env.MAIL_DRIVER}"`,
      });
    }

    if (!env.REDIS_URL && !env.REDIS_HOST) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['REDIS_HOST'],
        message: 'required unless REDIS_URL is set',
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
