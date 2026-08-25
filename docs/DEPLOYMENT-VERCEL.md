# Deploying to Vercel

Two Vercel projects from one repository: the web app and the API. Both build
from the repo root because `@bb/shared` is a workspace package and has to be
compiled before either of them.

The existing Render and Cloudflare configuration is left in place. Nothing here
removes it — a deployment you can fall back to is worth more than a tidy repo,
and neither costs anything while it is idle.

---

## 1. The web app

**New Project** → import the repository → **Root Directory: `apps/web`**.

Vercel detects Next.js and reads `apps/web/vercel.json` for the rest. The build
command is overridden there because Vercel would otherwise run `next build`
alone, and `@bb/shared` resolves through its compiled `dist` entry — a build
without it fails on the first import.

### Environment variables

| Variable | Value |
| --- | --- |
| `NEXT_PUBLIC_API_URL` | `https://<your-api-project>.vercel.app/api/v1` |

That is the only one. Everything else the browser needs is public by
construction and already compiled into the bundle.

`NEXT_PUBLIC_*` values are inlined by `next build`, so **changing this requires
a redeploy, not just a restart.** Setting it and restarting is the mistake that
looks like the variable being ignored.

---

## 2. The API

**New Project** → same repository → **Root Directory: `apps/api`**.

`apps/api/vercel.json` routes every path to `api/index.ts`, which boots Nest
once per warm instance and hands the request to the same Express application the
long-running server uses. Both entry points share `createApp`, so a setting
configured in one cannot go missing from the other.

### Environment variables

Copy these from Render. They are unchanged.

    DATABASE_URL              REDIS_URL
    JWT_ACCESS_SECRET         JWT_REFRESH_SECRET
    CLOUDINARY_CLOUD_NAME     CLOUDINARY_API_KEY        CLOUDINARY_API_SECRET
    GOOGLE_CLIENT_ID          GOOGLE_CLIENT_SECRET
    MAIL_DRIVER               MAIL_FROM                 (+ the driver's own keys)

Three change, and one is new.

| Variable | Value | Why |
| --- | --- | --- |
| `CORS_ORIGINS` | `https://<your-web-project>.vercel.app` | The web app moved. An origin not on this list cannot authenticate — the allowlist is never a wildcard, because pairing one with credentials would let any site act as your users. |
| `FRONTEND_URL` | `https://<your-web-project>.vercel.app` | Where reset and verification links point. |
| `OAUTH_CALLBACK_BASE` | `https://<your-api-project>.vercel.app` | Must match the redirect URI registered with Google exactly, or the provider refuses before it ever reaches this app. |
| `CRON_SECRET` | a long random string | New. See below. |

Also update the **Google OAuth console**: the authorised redirect URI becomes
`https://<your-api-project>.vercel.app/api/v1/auth/oauth/google/callback`.

### The scheduled jobs

This is the one real difference between the two hosts, and it is worth
understanding rather than working around.

Render runs a process, so `@Interval` and `@Cron` fire. Vercel runs a function
per request — there is nothing alive between them, so those decorators never
fire at all.

Most of the application does not care, because the phases are derived rather
than stored: a room's status advances when it is read, and a challenge's phase
is computed from its two dates. That was true before Vercel was considered and
is what makes this shape viable.

What still needs a trigger is the work that is *not* read-driven: freezing a
challenge's winner when voting closes, and pruning expired refresh tokens.
`apps/api/vercel.json` registers a daily cron against
`/api/v1/maintenance/sweep`, which runs the same scheduler methods over HTTP.
Vercel sends `Authorization: Bearer $CRON_SECRET`; the endpoint refuses
everything else, and refuses everything when no secret is set.

**Daily is the Hobby plan's limit, and it is coarse for this.** A challenge
whose voting closed at noon keeps its winner unfrozen until 3am. Two ways to
close that:

- Pro plan, and change the schedule in `apps/api/vercel.json` to `*/5 * * * *`.
- Any external pinger — cron-job.org, GitHub Actions, an uptime monitor —
  calling the same URL every few minutes with the same header. It is an ordinary
  authenticated request; nothing about it is Vercel-specific.

### Connections

Use Neon's **pooled** connection string, not the direct one. Every cold start
opens its own pool, and serverless multiplies instances under load — the
unpooled endpoint runs out of Postgres connection slots long before the traffic
justifies it. The pooled host has `-pooler` in it.

---

## 3. Verify, in this order

    curl https://<api>.vercel.app/health
    curl https://<api>.vercel.app/api/v1/challenges/categories

The first should return `{"status":"ok"}`, the second a single category. Then
open the web app and sign in — that exercises CORS, the refresh cookie and the
origin allowlist together, which is where a misconfigured move actually shows
up.

To check the cron path without waiting for it:

    curl -H "Authorization: Bearer $CRON_SECRET"       https://<api>.vercel.app/api/v1/maintenance/sweep

It reports each sweep separately, so a partial failure names itself.
