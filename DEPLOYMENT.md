# Deploying

Follow this top to bottom. Every step says what to click, what to paste, and how
to know it worked before moving on.

You need a GitHub account with this repository pushed, and free accounts on
[Neon](https://neon.tech), [Upstash](https://upstash.com) and
[Vercel](https://vercel.com).

Two Vercel projects come out of it — one for the API, one for the web app.

---

## Step 1 — Postgres, on Neon

1. Neon → **New Project**. Name it `blender-battle`. Any region; pick the nearest.
2. When it finishes, find the connection string. **Choose the pooled one** — the
   toggle is labelled *Connection pooling*, and the host will contain `-pooler`.
3. Keep it somewhere. It looks like:

       postgresql://user:pass@ep-something-pooler.region.aws.neon.tech/neondb?sslmode=require

**Why pooled matters here:** every serverless instance opens its own
connections, and Vercel starts instances freely under load. The direct endpoint
runs out of Postgres slots long before your traffic would justify it.

✅ **Check:** the string contains `-pooler` and ends with `?sslmode=require`.

---

## Step 2 — Redis, on Upstash

1. Upstash → **Create Database**. Name it `blender-battle`, region near Neon's.
2. Copy the **`rediss://`** URL — two S's, the TLS one.

Nothing in Redis is precious: rate-limit counters, scheduler locks, one-time
sign-in codes. All short-lived, all re-derivable.

✅ **Check:** your URL starts with `rediss://`, not `redis://`.

---

## Step 3 — Generate three secrets

Run this three times and keep each output:

    node -e "console.log(require('crypto').randomBytes(32).toString('base64url'))"

They become `JWT_ACCESS_SECRET`, `JWT_REFRESH_SECRET` and `CRON_SECRET`. **The
first two must be different from each other.**

---

## Step 4 — Deploy the API

1. Vercel → **Add New** → **Project** → import this repository.
2. **Root Directory**: click *Edit* and choose **`apps/api`**. Everything else
   depends on this — Vercel will not find the right config without it.
3. Leave Framework Preset as **Other**. `apps/api/vercel.json` supplies the build.
4. Open **Environment Variables** and add:

   | Name | Value |
   | --- | --- |
   | `DATABASE_URL` | the pooled Neon string from step 1 |
   | `REDIS_URL` | the `rediss://` URL from step 2 |
   | `JWT_ACCESS_SECRET` | first secret from step 3 |
   | `JWT_REFRESH_SECRET` | second secret from step 3 |
   | `CRON_SECRET` | third secret from step 3 |
   | `CLOUDINARY_CLOUD_NAME` | from your Cloudinary dashboard |
   | `CLOUDINARY_API_KEY` | from Cloudinary |
   | `CLOUDINARY_API_SECRET` | from Cloudinary |
   | `RUN_MIGRATIONS_ON_BOOT` | `true` |
   | `NODE_ENV` | `production` |

   Leave `CORS_ORIGINS`, `FRONTEND_URL` and `OAUTH_CALLBACK_BASE` out for now —
   you do not know those URLs yet. Step 6 comes back for them.

5. **Deploy.** A couple of minutes.
6. Copy the URL it gives you, e.g. `https://blender-battle-api.vercel.app`.
   Call it **`<API-URL>`** from here on.

✅ **Check:**

    curl <API-URL>/health

Expect `{"success":true,...,"data":{"status":"ok","uptime":...}}`.

If it fails, open the deployment → **Logs**. A missing environment variable is
named explicitly there — the app refuses to start rather than running
half-configured.

---

## Step 5 — Deploy the web app

1. Vercel → **Add New** → **Project** → import **the same repository again**.
   Yes, again: two projects, one repo.
2. **Root Directory**: `apps/web`.
3. Framework Preset should detect **Next.js**. Leave it.
4. **Environment Variables** — one entry:

   | Name | Value |
   | --- | --- |
   | `NEXT_PUBLIC_API_URL` | `<API-URL>/api/v1` |

   Mind the `/api/v1` on the end.

5. **Deploy.**
6. Copy the URL, e.g. `https://blender-battle.vercel.app`. Call it **`<WEB-URL>`**.

**If the build fails with `NEXT_PUBLIC_API_URL is not set`** — that is a guard
doing its job. Add the variable and redeploy. It is compiled into the JavaScript
your visitors download, so it has to be there *at build time*; setting it
afterwards and restarting does nothing.

✅ **Check:** open `<WEB-URL>`. The landing page renders. Signing in will not
work yet — that is the next step.

---

## Step 6 — Introduce them to each other

Back in the **API** project → **Settings** → **Environment Variables**:

| Name | Value |
| --- | --- |
| `CORS_ORIGINS` | `<WEB-URL>` |
| `FRONTEND_URL` | `<WEB-URL>` |
| `OAUTH_CALLBACK_BASE` | `<API-URL>` |

No trailing slashes. Then **Deployments** → the newest → **⋯** → **Redeploy**.
Environment changes do not apply until you do.

**Why this is separate:** the browser will not send the login cookie to an origin
the API has not named, and the API could not name an origin that did not exist
when you configured it. `CORS_ORIGINS` is an explicit list and never `*` — a
wildcard paired with credentials would let any site on the internet act as your
users.

✅ **Check:** register an account on `<WEB-URL>`. Success means Postgres, Redis,
CORS and the cookie are all working at once.

---

## Step 7 — Google sign-in *(optional)*

1. [Google Cloud console](https://console.cloud.google.com) → **APIs & Services**
   → **Credentials** → **Create OAuth client ID** → *Web application*.
2. **Authorised redirect URI**, exactly:

       <API-URL>/api/v1/auth/oauth/google/callback

3. Add `GOOGLE_CLIENT_ID` and `GOOGLE_CLIENT_SECRET` to the **API** project and
   redeploy.

It must match `OAUTH_CALLBACK_BASE` character for character. Google refuses a
mismatch before the request reaches this application, so nothing here can give
you a useful error about it.

✅ **Check:** a **Google** button appears on the sign-in page. It only renders
when the server confirms the credentials exist.

---

## Step 8 — Email *(optional — reset and verification need it)*

Simplest working option is a Gmail account with an **App Password**, not your
normal password; Google rejects those for SMTP.

On the **API** project:

    MAIL_DRIVER=smtp
    SMTP_HOST=smtp.gmail.com
    SMTP_PORT=465
    SMTP_USER=you@gmail.com
    SMTP_PASSWORD=your-16-character-app-password
    MAIL_FROM=Blender Battle <you@gmail.com>

Redeploy.

✅ **Check:** sign in as an admin and open `/admin`. It states plainly whether
mail is configured. Without it, password resets and verification fail
**silently** — by design, since a reset has to answer identically for a
registered and an unknown address.

---

## Step 9 — Make yourself an admin

The first account is an ordinary player. In Neon's **SQL Editor**:

```sql
UPDATE users SET role = 'admin' WHERE username = 'your-username';
```

Sign out and back in.

✅ **Check:** **Manage** and **Admin** appear in the navigation.

---

## Step 10 — The scheduled job

Already configured in `apps/api/vercel.json`. Confirm it under the API project →
**Settings** → **Cron Jobs**.

Test it now rather than waiting:

    curl -H "Authorization: Bearer YOUR_CRON_SECRET" <API-URL>/api/v1/maintenance/sweep

Expect `{"rooms":"ok","challengeEvents":"ok","tokens":"ok"}`.

**What it is for.** Vercel runs a function per request, so the app's timers never
fire. Most of it does not care — a room's phase advances when someone reads it,
and a challenge's is worked out from its dates. This covers the rest: freezing a
winner when voting closes, and clearing expired tokens.

**Daily is the free plan's limit,** which is coarse: a challenge whose voting
closed at noon keeps its winner unfrozen until the job runs. Either go Pro and
change the schedule in `apps/api/vercel.json` to `*/5 * * * *`, or point a free
pinger (cron-job.org, a GitHub Action) at that same URL with the same header
every few minutes.

---

## Done

`git push` redeploys both projects. Environment variable changes need a
**redeploy**, not a restart.

---

## When something is wrong

| Symptom | Cause |
| --- | --- |
| Deploy fails: `should NOT have additional property` | Something in `vercel.json` is not a real Vercel property — most often a `"//"` comment key. Vercel discards the entire file, so every other setting stops applying too. `node scripts/check-vercel-config.mjs` catches it before a push. |
| Build fails: `No Output Directory named "public" found` | The **API** project's Root Directory is not `apps/api`. Vercel is building from somewhere else and cannot see `apps/api/vercel.json`. Settings → General → Root Directory. |
| Build fails: `NEXT_PUBLIC_API_URL is not set` | Add it to the **web** project, redeploy. |
| Site loads, every request fails | `NEXT_PUBLIC_API_URL` missing its `/api/v1`, or `CORS_ORIGINS` does not exactly match `<WEB-URL>`. |
| Sign-in works, then drops you on refresh | `CORS_ORIGINS` wrong. The refresh cookie is only sent to a named origin. |
| Google sign-in fails | Redirect URI does not match `OAUTH_CALLBACK_BASE` exactly. |
| `too many connections` | You used Neon's direct string. Switch to the pooled one and redeploy. |
| `FUNCTION_INVOCATION_FAILED` / "This Serverless Function has crashed" | The API could not start. Load `<API-URL>/health` again — it now answers with the real reason under `error.detail`, most often a missing variable or a database URL it cannot reach. Passwords are stripped from that message before it is sent. |
| API 500s right after deploying | Check **Logs**. A missing variable is named there. |

---

## Known limits of this setup

**Uploads cap at 4.5MB per request.** An entry is two 2MB images, so about 4MB —
inside the limit, but not by much. Raising `SUBMISSION_IMAGE_MAX_BYTES` above 2MB
would break uploads here before it broke anything else.

**Cold starts.** The first request after an idle spell pays for booting the API.
Nothing in the product minds — deadlines are stored instants and do not care how
late they are read — but you will notice it.

**No process between requests.** Anything added later that assumes one — a
WebSocket gateway, an in-memory cache shared across requests, a queue consumer —
needs somewhere else to live.

---

## Local development is unaffected

    pnpm infra:up      # postgres + redis in Docker
    pnpm dev           # both apps, watching

Locally the API is a long-running process, so its timers *do* fire and the cron
endpoint is unnecessary.
