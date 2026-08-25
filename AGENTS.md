# Blender Battle — working notes for agents

A timed Blender modelling contest platform. You get a brief, you get a deadline,
you model, you submit two images, everyone votes.

Read this before changing anything. Most of what looks odd in this codebase is
load-bearing, and the reasons are written down in the files themselves.

---

## Layout

pnpm monorepo, Node 22.

| Path | What |
|---|---|
| `apps/api` | NestJS 11, TypeORM 0.3, PostgreSQL 16, Redis 7 |
| `apps/web` | Next.js 15 App Router, React 19, Tailwind 4, TanStack Query 5 |
| `packages/shared` | Enums, constants, contracts. Zero runtime dependencies. |

`packages/shared` is imported by both sides and must be built (`pnpm --filter
@bb/shared build`) before either app will typecheck — they resolve it through
its `dist` entry. The test suites resolve it to source instead, so tests run on
a fresh checkout without a build.

---

## The two contests

There are exactly two, and they are genuinely different mechanics. Do not
"unify" them without reading why they differ.

**Public challenges** (`modules/challenges`) — a manager schedules a published
brief with a submission window and a voting window. Anyone who entered gets one
final vote. The phase is *derived from the dates* by `phaseOf()`, never stored.

**Private rooms** (`modules/rooms`) — 2–16 artists, join by 6-character code or
from the public list. The **server draws the brief at kickoff** from the host's
filters, so nobody including the host sees it early. One shared deadline, then a
blind ballot with unlimited likes, then a single runoff on a tie.

An entry in either is **two images, both exactly 1024×1024**: the final render,
and a screenshot of the Blender workspace. The workspace shot is the anti-cheat.

### Say "anonymous" and "blind ballot" precisely

They are not synonyms, and using one word for both made two different promises
sound identical:

- **Anonymous** — the author is hidden. True of *both* contests, and enforced
  server-side by `challenge-entries.mapper.ts` and `toBlindEntry`.
- **Blind ballot** — the rooms mechanic *only*. Anonymous, **plus** an order
  shuffled per voter and a fixed ten seconds per entry, so nobody can linger,
  compare freely, or gain from appearing first.

A public challenge is an anonymous vote, not a blind ballot: you browse the
wheel at your own pace and cast one final vote.

---

## Rules that are not negotiable

These are the guarantees the product is built on. Breaking one is invisible in
the UI, which is exactly why they are listed here.

1. **The server owns every deadline.** Deadlines are stored as absolute UTC
   instants. The client is told *when*, never *how long*. Never compute a phase
   change from a duration on the client.
2. **The draw takes filters, never an id.** `ChallengesService.draw` must never
   accept a challenge id, "just for re-rolls" or otherwise. A host who can name
   the brief can prepare for it.
3. **Blind means absent, not hidden.** `challenge-entries.mapper.ts` builds the
   blind payload from an allowlist of fields. Never switch it to copying the
   entry and deleting keys — a new column would ship into the ballot silently.
   There is a test that fails when a new column is unclassified. It is not
   noise; classify the column.
4. **Phase transitions are conditional updates.** Every one is
   `UPDATE ... WHERE status = :from`, and callers must honour `affected === 0`
   by bailing out. This is what makes concurrent advancement safe.
5. **Rooms advance on read.** `RoomsService.reconcile` brings a room up to the
   phase its timestamps imply, and is called from the read paths. The scheduler
   is a fallback for rooms nobody is looking at, not the primary mechanism —
   the API is hosted somewhere that sleeps.
6. **Only entrants vote**, in both contest kinds. Registration is free and
   unverified, so an account is worth nothing; an entry costs real work.
7. **The refresh token never enters JavaScript.** It is an httpOnly cookie
   scoped to `/api/v1/auth`, set in exactly one place (`AuthController.issue`).
   The public `AuthTokens` type has no field for it, which is deliberate — do
   not add one. Endpoints that read it are behind `SameSiteGuard`, because the
   cookie is `SameSite=None` in production.

---

## Conventions

- **Comments explain why, not what.** The existing density is deliberate. Match
  it. A comment restating the code is worse than none.
- **Mappers are explicit.** Entities are never returned directly from a
  controller. Adding a field to the API is a deliberate edit to a mapper.
- **Shared constants must be used.** CI fails if `packages/shared` exports
  something no app imports — see `scripts/check-shared-exports.mjs`. This exists
  because `ROOM_RANKED_MIN_SUBMISSIONS` sat there for months documenting an
  anti-collusion policy that no code applied.
- **Migrations are append-only.** Never edit one that has run. Write a new one.
- **Tests construct services with `new` and hand-written fakes.** No Nest DI in
  the suite; esbuild does not emit decorator metadata and adding an SWC
  transform to get it back is not worth it.

## Commands

```bash
pnpm dev          # api + web together
pnpm test         # vitest, all workspaces
pnpm typecheck
pnpm lint
pnpm infra:up     # postgres + redis in docker
pnpm db:migrate
```

---

## Deployment shape

Both apps on **Vercel**, Postgres on **Neon**, Redis on **Upstash**.

Two traps worth stating twice.

`NEXT_PUBLIC_*` is **inlined at build time**. Setting the API URL in a hosting
dashboard binds it at *runtime*, which is too late — doing that once shipped
`localhost:4000` to production. It belongs in `apps/web/.env.production`, which
is tracked for exactly that reason.

Serverless means **no process between requests**, so `@Interval` and `@Cron`
never fire in production. The application survives that because phases are
derived rather than stored — a room advances when it is read. Anything added
that assumes a live process (a socket gateway, an in-memory cache shared across
requests, a queue consumer) needs somewhere else to live, and the work that is
already not read-driven is triggered through `MaintenanceController` by cron.

---

## Response style

The maintainer prefers terse, caveman-compressed prose in chat: drop articles,
filler and pleasantries; fragments are fine; keep every technical term, code
block, command and error string exact.

This applies to **conversation only**. Code, comments, commit messages, PR
descriptions and documentation are written normally — including this file.

Drop the style for security warnings, irreversible actions, and any multi-step
sequence where omitting connectives would make the order ambiguous. Resume
after. "stop caveman" or "normal mode" turns it off.
