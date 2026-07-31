# Blender Battle

Live 1v1 modelling duels for Blender artists. Draw a random challenge, build against
the clock, get judged by the room.

**Phases 1–4 complete; Phase 5 in progress.** Auth, RBAC, profiles, audit
logging, the dev environment, the challenge catalogue with its server-side random
draw, live 1v1 battles with matchmaking and spectator voting, and the dashboards.

Phase 5 so far: notifications, achievements, and Discord/Google OAuth. Teams and
tournaments are not built yet — see "Phase 5 status" below.

## Stack

| Layer     | Choice |
|-----------|--------|
| Frontend  | Next.js 15 (App Router), React 19, TailwindCSS 4, TanStack Query, Zustand, React Hook Form + Zod |
| Backend   | NestJS 11, TypeORM, class-validator, Passport JWT |
| Data      | PostgreSQL 16, Redis 7 |
| Storage   | Cloudinary |
| Runtime   | Node 22, pnpm workspaces, Docker Compose |

## Getting started

Prerequisites: Node 22+, pnpm 11+ (`corepack enable --install-directory ~/.local/bin pnpm`),
Docker Desktop, and a Cloudinary account.

```bash
cp .env.example .env
```

Fill in `.env` — the two JWT secrets must differ and be 32+ characters each:

```bash
node -e "console.log(require('crypto').randomBytes(48).toString('base64url'))"
```

Then:

```bash
pnpm install
pnpm --filter @bb/shared build
docker compose up -d postgres redis
pnpm db:migrate
pnpm dev
```

Web on `http://localhost:3000`, API on `http://localhost:4000`.

## Layout

```
apps/
  api/          NestJS — modules, controllers, services, entities, DTOs, guards
  web/          Next.js — app routes, features, components, lib
packages/
  shared/       Enums, response envelope, contracts, limits. Imported by both.
```

`packages/shared` holds the vocabulary both sides agree on — roles, error codes,
field limits. Validation itself is *not* shared: the frontend uses Zod for form
feedback, the backend uses class-validator at the API boundary and is the only
authority on what is acceptable.

## API

Everything under `/api/v1`, with one envelope for every response:

```json
{ "success": true, "message": "", "data": {} }
```

Failures add `error: { code, details?, requestId }`. Clients branch on `code`,
never on message text.

| Method | Path | Access |
|--------|------|--------|
| POST | `/auth/register` | public |
| POST | `/auth/login` | public |
| POST | `/auth/refresh` | public |
| POST | `/auth/logout` | authenticated |
| GET | `/auth/me` | authenticated |
| GET | `/users/by-username/:username` | public |
| GET | `/users/me` · PATCH `/users/me` | authenticated |
| POST | `/users/me/avatar` | authenticated |
| GET | `/users` | admin |
| PATCH | `/users/:id/role` · `/users/:id/status` | admin |
| GET | `/challenges` | public, scoped by caller |
| GET | `/challenges/categories` · `/challenges/tags` | public |
| GET | `/challenges/:slug` | public, scoped by caller |
| POST | `/challenges/draw` | authenticated |
| POST | `/challenges` · PATCH `/challenges/:id` | manager |
| POST | `/challenges/:id/publish` · `/archive` | manager |
| DELETE | `/challenges/:id` | manager (soft delete) |
| POST | `/challenges/:id/assets` · DELETE `/:assetId` | manager |
| POST | `/battles/queue` · DELETE · GET | authenticated |
| GET | `/battles/active` | authenticated |
| GET | `/battles/live` · `/battles/history` | public |
| GET | `/battles/:id` | public, viewer-aware |
| POST | `/battles/:id/forfeit` | competitor only |
| GET | `/leaderboard` | public |
| GET | `/leaderboard/me` | authenticated |
| GET | `/admin/metrics` · `/admin/activity` | admin |
| GET | `/manager/metrics` | manager |
| GET | `/notifications` · `/notifications/unread-count` | authenticated |
| POST | `/notifications/:id/read` · `/notifications/read-all` | authenticated |
| GET | `/achievements` | authenticated |
| GET | `/achievements/user/:username` | public |
| GET | `/auth/oauth/providers` | public |
| GET | `/auth/oauth/:provider` · `/auth/oauth/:provider/callback` | public |
| POST | `/auth/oauth/exchange` | public |
| GET | `/auth/oauth/linked` | authenticated |
| DELETE | `/auth/oauth/:provider` | authenticated |
| GET | `/health` · `/health/ready` | public, unversioned |

Live battle traffic runs over Socket.IO at `/battles`, not REST. Client events:
`client:join_battle`, `client:leave_battle`, `client:cast_vote`,
`client:send_reaction`. Server events: `battle:state`, `battle:phase_changed`,
`battle:tally`, `battle:reaction`, `battle:completed`, `battle:spectators`,
`queue:matched`, `queue:timeout`, `notification:new`.

All list endpoints are cursor-paginated. Cursors are opaque — round-trip them
unmodified.

## Security notes

- **Bearer tokens, not cookies.** CSRF middleware is deliberately absent: a
  cross-site request cannot attach an `Authorization` header. Do not add it.
- **Refresh rotation with reuse detection.** Presenting an already-rotated token
  revokes the entire token family and forces re-authentication.
- **Refresh state lives in Postgres**, not Redis. Redis holds only disposable
  caches (access-token denylist, throttle counters).
- **Roles are assigned server-side.** Registration always creates a player.
- **Migrations only.** `synchronize` is never enabled, in any environment.
- **The random draw takes filters, never an id.** `POST /challenges/draw` resolves
  the challenge server-side; an id field is rejected by the DTO. Accepting one
  would let a client hand its opponent a brief it had already prepared for.
- **Challenge visibility is enforced per caller.** The same URL returns the public
  catalogue to a visitor and additionally the caller's own drafts to a manager.
  A draft requested directly by slug returns 404, not 403 — the existence of an
  unpublished brief is itself information.
- **Sockets authenticate on the handshake.** HTTP guards do not run on a WebSocket
  upgrade; an unauthenticated or expired token is disconnected before it can join
  a room. The token travels in `auth.token`, never the query string, which would
  put a credential in proxy access logs.
- **One vote per person is a database constraint**, `UNIQUE (battle_id, user_id)`,
  not an application check. Application checks lose races against two browser
  tabs and two API instances.
- **Timers are server-authoritative.** Deadlines are absolute timestamps fixed at
  battle creation; clients receive them plus `serverNow` and compute the
  remaining time themselves. A client cannot extend its own battle.
- **Phase transitions run in a locked sweeper**, not per-battle in-process timers,
  which would die with the process and strand battles mid-flight. Every
  transition is also a conditional UPDATE, so a duplicate tick cannot award XP
  twice.
- **The leaderboard is a derived read model**, a Redis sorted set rebuilt from the
  users table, never a second table that could drift from the profile page.
  Banned accounts are removed from it immediately.
- **Admin metrics are served from a snapshot** refreshed every five minutes under
  a lock, never aggregated per dashboard load. The response carries `generatedAt`
  so the reader knows how old the numbers are.

Known tradeoff: the refresh token is persisted in `localStorage` so a page reload
does not sign the user out. See `apps/web/src/lib/api/token-store.ts` for the
alternatives — an httpOnly cookie scoped to the refresh endpoint is the
recommended upgrade and does not reintroduce CSRF exposure elsewhere.

## Commands

```bash
pnpm dev              # api + web in parallel
pnpm build            # shared, then both apps
pnpm typecheck        # all workspaces
pnpm test             # all workspaces
pnpm db:migrate       # run pending migrations
pnpm db:revert        # roll back the last migration
pnpm infra:up         # postgres + redis only
```

## Phase 5 status

Built and verified: **notifications** (persisted, pushed over the existing
socket), **achievements** (14 seeded badges, unlocked on battle completion, XP
paid once — guaranteed by a unique constraint), and **OAuth** for Discord and
Google.

OAuth notes:
- Providers are optional. Each appears only when both of its credentials are
  set, so the platform runs without registering third-party applications.
- Tokens never travel in a redirect URL. The callback issues a single-use code
  that the browser trades over HTTPS, keeping credentials out of browser history
  and the  header.
- An existing account is matched by email only when the provider reports it
  **verified**. An unverified address is an unproven claim, and trusting it would
  allow account takeover.
- Unlinking the last provider on a password-less account is refused.

Not built: **teams** and **tournaments** ( and the battle/side
split are already shaped for them), plus the commercial and media items from the
Future Features list — payments, subscriptions, donations, AI-generated
challenges, video uploads, and streaming integrations. Each needs a provider and
policy decision rather than a default, and the money-handling ones should not be
scaffolded speculatively.
