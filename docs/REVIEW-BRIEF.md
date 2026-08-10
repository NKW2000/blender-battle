# Blender Battle — review brief

## What I want from you

Below is a full description of a real, deployed side project. Read it, then **criticise it**.

I want you to tell me:

- What is **wrong** with it — design, architecture, security, product.
- What is **good** about it — the decisions worth keeping.
- The **trade-offs** I have made without realising I was making them.
- **Prioritised advice**: what to do first, and what to leave alone.

Two things to know before you start:

1. Everything in sections 2–8 is what the software **actually does today**. It is written
   from a code audit, not from marketing copy. If it says a rule is enforced, it is
   enforced server-side and I can point at the line.
2. Section 9 is a list of everything that is **half-built, dead, or absent**. It is
   deliberate and already known. Do not just read it back to me — tell me what to *do*
   about each cluster: delete, finish, or leave.

Be blunt. I would rather hear that the core idea is confused than get a list of style nits.

---

## 1. What the product is

A **timed Blender modelling contest platform**. You get a brief, you get a deadline, you
model, you submit two images, everyone votes. That is the whole loop.

It exists because the alternative — running contests in a Discord server — has no way to
stop people seeing the brief early, no way to stop them seeing each other's work before
voting, and no way to enforce a deadline that everyone shares.

There are exactly **two contest shapes**, and one supporting surface.

### Public challenges (open, scheduled)

- A **manager** authors a challenge (title, description, objectives, tags, category,
  reference assets, estimated minutes, XP reward) and publishes it.
- The manager then **schedules** it as an event: a submission window and a voting window,
  both absolute timestamps.
- Any signed-in user enters. An entry is **two images, both exactly 1024×1024**: the final
  render, and a screenshot of their Blender workspace (the workspace shot is the
  anti-cheat — it is hard to fake a viewport for work you did not do).
- While submissions are open, **entries are hidden**. Not hidden in CSS — the API's
  `toBlindEntry` mapper strips the author and the images out of the payload before it
  leaves the server.
- When voting opens, entries are revealed and every signed-in user gets **one vote**,
  enforced by a `uq_challenge_vote` unique constraint.
- At the voting deadline a scheduler closes the event and freezes the winner.

Phases are **derived from the clock**, not stored as a state a client can push.

### Private rooms (invite-only, live)

- Anyone creates a room and gets a **6-character join code** (alphabet excludes O/0 and
  I/1). 2 to 16 artists.
- The creator picks **filters** for the brief — category, tags, difficulty — **never a
  specific challenge id**. This is the point: the host cannot pre-read the brief, because
  the host does not choose it.
- The host starts the room. The **server draws** the challenge, reveals it to everyone
  simultaneously over a 7-second reel, then fixes one shared absolute deadline.
- Everyone models against that deadline and submits the same two 1024×1024 images.
- At the deadline, non-submitters are eliminated. Everyone who submitted votes on a
  **blind ballot**: entries shuffled with a per-voter deterministic order, 10 seconds
  per entry (+3s grace) enforced server-side, **unlimited likes**. "Blind" is
  reserved for this mechanic; a public challenge is an *anonymous* vote — author
  hidden, but browsed at your own pace.
- If the top is tied, a **runoff**: only the tied entries, one single pick.
- Results roll up into each participant's record.

Room lifecycle: `lobby → drawing → active → voting → runoff? → completed`, plus
`cancelled` for too-few-submissions or an abandoned room. Each transition is a
**conditional `UPDATE ... WHERE status = <expected>`**, so two schedulers racing cannot
double-advance a room.

### The profile

Every finished entry lands on the artist's profile. They can **pin up to 10** to a
showcase, write a bio, and attach an arbitrary set of named social links.

---

## 2. Stack

pnpm monorepo, Node 22.

| Part | What |
|---|---|
| `apps/web` | Next.js 15 App Router, React 19, Tailwind 4, TanStack Query 5. Mostly client components; the two publicly shareable pages are server-rendered. |
| `apps/api` | NestJS 11, TypeORM 0.3, PostgreSQL 16, Redis 7. |
| `packages/shared` | Enums, constants, contracts. Zero runtime dependencies. Imported by both sides so a limit cannot drift. |
| Media | Cloudinary. All uploads server-signed; the client never holds a credential. |

**Deployment:** web on **Cloudflare Workers** via OpenNext; API on **Render free tier**;
Postgres on **Neon**; Redis on Render Key Value. Everything on free plans.

---

## 3. API surface

`/api/v1` prefix. Bearer access token, rotating refresh token.

**Auth** — `register`, `login`, `refresh`, `logout`, `me`, `password/forgot`,
`password/reset`, `email/verify`, `email/verify/resend`, OAuth (`providers`, `linked`,
`:provider`, `:provider/callback`, `exchange`, unlink).

**Challenges** — list, categories, tags, `draw` (filters only), `:slug`, create, patch,
`publish`, `archive`, delete, asset upload/delete.

**Challenge events** — list, `:id`, `:id/entries` (submit), `:id/vote`, `:id/schedule`,
`:id/unschedule`, `:id/close`.

**Rooms** — browse (public lobbies), `active`, `:id`, create, `join`, `:id/leave`,
`:id/start`, `:id/submit`, `:id/ballot`, `:id/ballot/:submissionId/like` (POST/DELETE).

**Users** — `me` (get/patch), `me/avatar`, `by-username/:username` (+ `/portfolio`,
`/showcase`), admin list, `:id/role`, `:id/status`.

**Notifications** — list, `unread-count`, `:id/read`, `read-all`.

**Analytics** — `leaderboard` (public), `admin/metrics`, `manager/metrics`,
`admin/activity`.

**Health** — `health`, `health/ready` (version-neutral).

### Web routes

`/` (landing) · `/login` `/register` `/auth/callback` `/forgot-password`
`/reset-password` `/verify-email` · `/events` `/rooms` `/rooms/[id]` `/leaderboard`
`/challenges` · `/manage/challenges` `/manage/challenges/new`
`/manage/challenges/[slug]` · `/admin` `/admin/users` · `/settings/profile` ·
`/u/[username]`

Two routes sit in a separate `(public)` group that renders without a session, because
they are the only things anyone links to from outside: **`/challenges/[slug]`** and
**`/events/[id]`**. Both are server components with `generateMetadata`, so the brief text
and Open Graph tags are in the initial HTML.

Three roles: **player**, **manager**, **admin**, checked by a rank-based guard (admin
satisfies manager). Nav renders per role.

---

## 4. Data model

Entities: `User`, `RefreshToken`, `RefreshTokenFamily`, `AccountToken`, `OAuthIdentity`, `Challenge`,
`ChallengeAsset`, `ChallengeEntry`, `ChallengeVote`, `Category`, `Tag`, `Room`,
`RoomParticipant`, `Submission`, `SubmissionLike`, `Notification`, `ActivityLog`.

Constraints worth judging:

- `password_hash` is `select: false` and **nullable** — OAuth-only accounts have no password.
- Partial unique index on `rooms.join_code`, scoped to live rooms, so codes recycle.
- `uq_challenge_vote` — one vote per user per event, enforced by the database.
- `submission_likes` are **toggled inactive, never deleted**, so a vote history survives.
- `chk_users_battles_consistent` — `total_battles = wins + losses + draws`, checked **per
  statement**, which is why the results rollup is one `UPDATE` per participant rather than
  a single batched write.
- `account_tokens` — one table for password reset and email verification, holding a
  SHA-256 hash of a single-use token, never the token.
- Soft deletes (`deleted_at`) throughout.

---

## 5. Limits (`packages/shared/src/constants.ts`)

| Thing | Value |
|---|---|
| Username | 3–24, `^[a-zA-Z0-9](?:[a-zA-Z0-9_-]{1,22}[a-zA-Z0-9])?$` |
| Password | 12–128 |
| Bio | 500 |
| Showcase pins | 10 |
| Avatar | 5 MB, jpeg/png/webp |
| Challenge title / description | 120 / 4000 |
| Objectives / tags / assets | 10 / 8 / 12 |
| Challenge duration | 5–480 minutes |
| XP reward | 10–1000 |
| Room players | 2–16 |
| Join code | 6 chars, `ABCDEFGHJKLMNPQRSTUVWXYZ23456789` |
| Brief reveal | 7 seconds |
| Entry images | **exactly 1024×1024**, 10 MB, jpeg/png/webp |
| Ballot | 10 s per entry, +3 s grace, 5 min window |
| Page size | 20 default, 100 max |

---

## 6. Security posture

**Deliberate decisions:**

- **Refresh-token rotation with reuse detection.** Every refresh issues a new token and
  revokes the old one, inside a `SERIALIZABLE` transaction. If a revoked token is
  presented again, the whole family is killed — a stolen token is usable at most once, and
  using it logs the real user out, which is the signal.
- **Blind means blind.** Author and image URLs are removed from the response object
  server-side. There is no "hidden" field a devtools user can read.
- **The draw takes filters, never an id.** Structural, not a check.
- **All deadlines are absolute UTC instants** computed and enforced by the server. The
  client is told *when*, never *how long*. A paused tab, a wrong clock, or a patched timer
  changes nothing.
- **Schedulers behind Redis locks** with token-matched release, so a lock cannot be
  released by whoever took it next.
- **Single-flight token refresh** — concurrent 401s queue behind one refresh call.
- **Upload dimensions verified on the uploaded file**, and rejected uploads are destroyed
  in Cloudinary rather than orphaned.

- **The refresh token never enters JavaScript.** It is an httpOnly cookie scoped to
  `/api/v1/auth`, `SameSite=None; Secure` in production. The public `AuthTokens` type has
  no field for it, so an endpoint cannot return it in a body by accident.
- **CSRF guard on the cookie-authenticated endpoints.** `SameSite=None` is what makes a
  forged cross-site POST possible, so refresh and logout require a custom header — which a
  form post cannot set and a cross-origin fetch cannot send without a preflight the
  allowlist refuses.
- **Only entrants vote**, in both contest kinds. An account costs an email address; an
  entry costs a 1024×1024 render and a matching workspace screenshot.
- **Password reset revokes every session**, and a completed reset counts as proof of the
  address.

**Known exposure:**

- The `(app)` layout auth guard is a **UX redirect, not a boundary**. Every endpoint
  re-checks. (This is correct, but it means the client guard proves nothing.)
- **Email verification is recorded but not enforced.** `email_verified_at` is set, and
  nothing yet refuses an unverified account.
- **`MAIL_DRIVER` defaults to `log`**, which writes reset links to the application log and
  sends nothing. Correct for development, useless in production until a provider is
  configured — and account recovery silently does nothing if it is left that way.

---

## 7. Scheduling

Room phases are **advanced on read**: `RoomsService.reconcile` brings a room up to the
phase its stored timestamps imply, and is called from the endpoints clients poll. A
deadline is an absolute instant and does not care how late it is read, so an API that was
asleep when it passed catches up on the first request.

The schedulers are therefore a fallback for rooms nobody is looking at, not the mechanism:

- **10 seconds** — room sweep, and challenge-event resolve / voting announcements.
- **5 minutes** — metrics rollup.
- **Daily** — prune expired, never-rotated refresh tokens.

Each is behind a Redis lock with a token-matched release.

---

## 8. Design system

A deliberate "arcade" language, applied consistently: 2–4px ink borders, **hard offset
shadows with no blur**, a per-size `--press-depth` so buttons physically depress, a double
focus ring (cream inside, ink outside) that survives any background, Fredoka display +
Nunito body.

The outcome palette (win / loss / draw) was checked against protanopia and deuteranopia
simulation and separated to ΔE 17.4, so results are distinguishable without colour.

`Select` and the date/time field are **hand-built**, because native controls could not be
styled to match and the native `datetime-local` picker follows the OS locale rather than
the app.

---

## 9. What is half-built, dead, or absent

This section used to be long. An earlier version of this brief was handed to a reviewer,
and its findings were worked through; what follows is what is *still* true, with the
resolved items noted briefly so the history is not lost.

### Still open

**Email verification is recorded but not enforced.** `email_verified_at` is written and
read by nothing. Deciding what an unverified account may not do — vote, most likely — is a
product question that has not been answered.

**`MAIL_DRIVER` defaults to `log`.** Account recovery works end to end, but a deployment
that never sets a provider will log reset links and send nothing. The environment schema
refuses to boot with `resend` and no key, so the failure mode is "nobody set it up", not
"it is misconfigured".

**`users.draws` is never incremented, on purpose.** Every tie escalates to a runoff, and a
runoff falls back to the earliest submission — a rule chosen precisely so a result always
separates. `BattleResult.DRAW` remains a legal value that nothing produces, and the column
stays because `chk_users_battles_consistent` references it.

**`submission_likes` are toggled inactive rather than deleted, and nothing reads the
history.** It costs a predicate on every tally and rows forever. Worth keeping only if
collusion detection is actually going to be built on it; otherwise it is rent on an unused
asset.

**Test coverage is real but narrow.** 105 tests across nine files, aimed at the guarantees
whose failure is invisible: the blind contract, phase derivation, transition races, the
results rollup, refresh reuse, password reset, and the two hand-built controls. There are
no end-to-end tests and no coverage of the upload pipeline.

**Operational.** The API still runs on a tier that sleeps; that is now a cold-start
latency problem rather than a correctness one, and an uptime pinger removes it.

### Resolved since the last review

Ranking rebuilt on room results (`rank` was hardcoded `null`); the anti-collusion floor
`ROOM_RANKED_MIN_SUBMISSIONS` wired up (the real threshold had been two);
`Room.visibility` actually assigned; metrics moved off `battles`/`votes`/`reactions`,
which received no writes and reported structural zeros as data; `challenges.times_played`
incremented for the first time; notifications given producers; the entire dead
matchmaking, socket and achievements vertical deleted in schema and code; room discovery,
password reset, email verification, an httpOnly refresh cookie and server-rendered public
pages added; `pruneExpiredTokens` scheduled; a CI check that fails when a shared export
has no importer — which is how `SUBMISSION_NOTES_MAX_LENGTH` was found to be a documented
limit that no code applied.

Two accessibility defects were found and fixed in the hand-built controls:
`aria-activedescendant` on an element that never receives focus (so nothing was ever
announced), and `gridcell` elements with no `row` ancestor.

---

## 10. Now criticise it

The previous round of questions has been answered and acted on, so these are the ones
that are still live:

1. **The three most serious problems.** Not the longest list — the three that matter.
2. **Is the two-contest design coherent?** Public challenges and private rooms use
   genuinely different mechanics — one final anonymous vote, versus a timed, shuffled
   blind ballot with unlimited likes and a runoff. The vocabulary has been separated so
   the two no longer sound identical. Should the split stay, or collapse to one mode?
3. **Does the competitive layer now mean anything?** Score moves only on rooms with four
   or more real submissions; XP rises and never falls; there is a public leaderboard.
   Is that enough of a stake to justify the anti-cheat around it, or is it still
   decorative?
4. **Where should the next tests go?** The existing 105 cover the guarantees that fail
   silently. What is the most expensive thing still untested?
5. **Sockpuppets, second pass.** Voting now requires an entry in both contest kinds, so a
   fake vote costs a plausible render plus a workspace screenshot. Is that sufficient, or
   is the next step email verification enforcement?
6. **Discovery.** Rooms can now be listed publicly and the two shareable pages are
   server-rendered and indexable. Is that the right growth surface, or is the product
   still structurally hard to find?
7. **What should be deleted next?** The unread `submission_likes` history and the
   never-produced `DRAW` result are the two obvious candidates.
8. **A prioritised list**, split into: *fix before anyone real uses this* / *fix when it
   grows* / *leave alone*.

If you think the core premise is flawed, say so first, before anything else.
