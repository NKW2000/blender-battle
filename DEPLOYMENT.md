# Deployment

Everything runs on **Vercel**: two projects from this one repository, plus two
managed data services.

| Piece | Host |
| --- | --- |
| `apps/web` (Next.js) | Vercel |
| `apps/api` (NestJS) | Vercel |
| Postgres | Neon |
| Redis | Upstash (or any Redis reachable over TLS) |

Both projects build from the repository root, because `@bb/shared` is a
workspace package that has to be compiled before either app can import it.

---

## The one thing to understand first

Vercel runs a function per request. Nothing is alive between requests, so
`@Interval` and `@Cron` never fire.

Most of this application does not care, and that is by design rather than by
luck: a room's phase advances when it is *read*, and a challenge's phase is
derived from its two stored dates. Neither needs a process watching a clock.

What is left is the work that is not read-driven — freezing a challenge's winner
once voting closes, and pruning expired refresh tokens. Those are triggered over
HTTP instead, by cron, at `/api/v1/maintenance/sweep`.

---

## 1. Postgres — Neon

Create a project and take the **pooled** connection string; the host has
`-pooler` in it.

This matters more here than on a long-running host. Every cold start opens its
own connection pool and serverless multiplies instances under load, so the
direct endpoint runs out of Postgres connection slots long before the traffic
would justify it.

## 2. Redis — Upstash

Any Redis reachable over TLS works. It carries rate-limit counters, the
scheduler locks, and the one-time OAuth exchange codes.

Take the `rediss://` URL. Nothing here needs Redis to be durable — every value
in it is short-lived and re-derivable.

## 3. API — Vercel project

**New Project** → this repository → **Root Directory: `apps/api`**.

`apps/api/vercel.json` does the rest: it routes every path to `api/index.ts`,
which boots Nest once per warm instance and hands the request to the same
Express application the local server uses.

### Environment variables

    DATABASE_URL              the pooled Neon string
    REDIS_URL                 rediss://…
    JWT_ACCESS_SECRET         32+ random characters
    JWT_REFRESH_SECRET        32+ random characters, different from the above
    CLOUDINARY_CLOUD_NAME     CLOUDINARY_API_KEY      CLOUDINARY_API_SECRET
    CORS_ORIGINS              https://<web-project>.vercel.app
    FRONTEND_URL              https://<web-project>.vercel.app
    OAUTH_CALLBACK_BASE       https://<api-project>.vercel.app
    CRON_SECRET               a long random string
    GOOGLE_CLIENT_ID          GOOGLE_CLIENT_SECRET
    MAIL_DRIVER               MAIL_FROM               (+ that driver's own keys)

`CORS_ORIGINS` is an explicit list and never a wildcard. The refresh token is an
httpOnly cookie and the two apps are on different subdomains, so the API sends
`Access-Control-Allow-Credentials: true` — which the CORS specification forbids
pairing with `*`, because it would let any site on the internet make
authenticated requests as your users.

### Migrations

Set `RUN_MIGRATIONS_ON_BOOT=true` and the API applies pending migrations when it
starts. On a serverless host "starts" means the first cold start after a deploy,
which is the behaviour you want.

The alternative is running `pnpm --filter @bb/api migration:run` against
`DATABASE_URL` from a machine that can reach Postgres on 5432 — which not every
network allows.

## 4. Web — Vercel project

**New Project** → the same repository → **Root Directory: `apps/web`**.

### Environment variables

| Variable | Value |
| --- | --- |
| `NEXT_PUBLIC_API_URL` | `https://<api-project>.vercel.app/api/v1` |

That is the only one. `NEXT_PUBLIC_*` values are compiled into the browser
bundle by `next build`, so **changing this needs a redeploy, not a restart** —
setting it and restarting is the mistake that looks like the variable being
ignored.

## 5. Google sign-in

In the Google Cloud console, the authorised redirect URI is:

    https://<api-project>.vercel.app/api/v1/auth/oauth/google/callback

It must match `OAUTH_CALLBACK_BASE` exactly. A mismatch is refused by Google
before the request ever reaches this application, so nothing here can report it
usefully.

## 6. The cron

`apps/api/vercel.json` registers a daily job against `/api/v1/maintenance/sweep`,
authenticated with `CRON_SECRET`.

**Daily is the Hobby plan's limit, and it is coarse for this.** A challenge whose
voting closed at noon keeps its winner unfrozen until the job runs. Two ways to
close that gap:

- Pro plan: change the schedule in `apps/api/vercel.json` to `*/5 * * * *`.
- Any external pinger — cron-job.org, a GitHub Action, an uptime monitor —
  calling the same URL with the same `Authorization: Bearer` header. It is an
  ordinary authenticated request; nothing about it is Vercel-specific.

---

## Verify, in this order

    curl https://<api>.vercel.app/health
    curl https://<api>.vercel.app/api/v1/challenges/categories

The first returns `{"status":"ok"}`; the second the discipline list. Then open
the web app and sign in — that exercises CORS, the refresh cookie and the origin
allowlist together, which is where a misconfigured deployment actually shows up
rather than in either curl.

The cron path, without waiting for it:

    curl -H "Authorization: Bearer $CRON_SECRET"       https://<api>.vercel.app/api/v1/maintenance/sweep

It reports each sweep separately, so a partial failure names itself.

---

## Known limits of this shape

**Request bodies cap at 4.5MB.** An entry is two images at 2MB each, so a
submission is about 4MB plus multipart overhead — inside the limit, but not by
much. Raising `SUBMISSION_IMAGE_MAX_BYTES` past 2MB would break uploads on
Vercel before it broke anything else.

**Cold starts.** The first request after an idle period pays for booting Nest,
opening a database pool and connecting to Redis. Nothing in the product is
sensitive to that — the deadlines are stored instants and do not care how late
they are read — but it is visible.

**No process between requests.** Covered above, and worth remembering before
adding anything that assumes one: a WebSocket gateway, an in-memory cache shared
across requests, or a queue consumer would each need somewhere else to live.

---

## Local development

Unchanged, and unrelated to any of the above.

    pnpm infra:up      # postgres + redis in Docker
    pnpm dev           # both apps, watching

Locally the API runs as a long-running process, so the schedulers *do* fire and
the maintenance endpoint is not needed.
