# Blender Battle — review

Written after reading the brief and then checking it against the code. Where I say
"confirmed", I ran the grep. Where the brief and the code disagree, I say so.

---

## 0. The premise, first, because you asked

**The premise is sound. The product built on top of it is missing its reason to exist.**

You identified three real failures of running contests in Discord — the brief leaks, the
work is visible before voting, the deadline is a suggestion — and you solved all three
*structurally* rather than by policy. Server-drawn briefs from filters. Author stripped
server-side. Absolute UTC instants the client is merely told about. That is genuinely good
instinct, and it is the part of this project worth being proud of.

Here is the problem. Every one of those defences protects the **integrity of a result**.
So I went looking for what a result is worth, and:

- `rank` is hardcoded `null` in `users.mapper.ts:27`. Confirmed.
- `users.draws` is never incremented. Confirmed — no write path anywhere.
- `challenges.times_played` is read by metrics, never written. Confirmed.
- `Room.visibility` is never assigned, so `isRanked` reduces to `submitted >= 2`.
  Confirmed at `rooms.service.ts:443`.
- XP is awarded, and XP buys nothing.

You have built an elaborate, careful, genuinely well-engineered anti-cheat apparatus around
**a prize that does not exist**. Nobody would cheat to win this, because winning it returns
a number that is not displayed and a rank that is literally `null`.

That is the single most serious thing in this codebase, and it is not in your section 9,
because section 9 lists *missing features* and this is a *missing reason*. You did not
notice it because each individual gap is small. Together they mean the scoreboard is
decorative.

And there is a sharper version of it. Your threat model assumes **adversarial strangers**:
people who would pre-read a brief, peek at rivals, patch a timer, farm sockpuppets. Your
distribution model admits **only friends**: there is no room discovery, a room is reachable
only by someone handing you a six-character code. You built airport security for a
dinner party.

That contradiction is the root cause of most of what follows. Resolve it in one direction
or the other. Either the stakes become real and public — in which case finish ranking and
build discovery, and all the anti-cheat suddenly earns its keep — or it stays a thing you
play with people you know, in which case you are over-engineered by roughly half and should
stop paying for defences against threats you do not have.

I would pick the first. Rooms is the good idea, and it deserves stakes.

---

## 1. The three most serious problems

**1. The competitive layer is decorative, so nothing else has a purpose.**
See above. Ranking null, draws never written, `isRanked` tautological, XP inert. Fix this
and the project has a spine. Leave it and you are maintaining anti-cheat for a sandbox.

**2. Correctness depends on a process that is designed to sleep.**
Rooms advance only through the 1-second sweep (`room-scheduler.service.ts:34`, confirmed).
The API is on Render `free` (confirmed in `render.yaml:35`), which idles after 15 minutes,
and Neon suspends too. A room is a *minutes-long* object with hard deadlines. If the
process is asleep when a deadline passes, submissions never close, the ballot never opens,
the room never completes — and the users are sitting there watching a timer at 0:00.

This is not an ops annoyance. It is a **primary failure mode of the flagship feature**, and
a pinger papers over it badly: Render cold starts take tens of seconds, which is a large
fraction of a ballot step. Section 6 below has a fix that costs almost nothing, and you
have already written the pattern elsewhere in this repo.

**3. Zero tests on a system whose guarantees are invisible when broken.**
Confirmed: not one test file in the repository, and `apps/api`'s `test:e2e` points at a
`vitest.e2e.config.ts` that does not exist, so the script fails on invocation.

Untested code is normal. What makes this acute is *which* code. If blind voting regresses,
the app looks exactly the same. If phase derivation drifts by an hour, the app looks
exactly the same. If a room state transition races, the app looks exactly the same until
someone is stuck. **You cannot detect a failure of your core value proposition by using
your own product.** That is the specific condition under which tests stop being hygiene and
start being the only instrument you have.

---

## 2. A correction to the brief itself

You staked the brief's credibility on section 1: "if it says a rule is enforced, it is
enforced server-side and I can point at the line." So it matters that one of your two
flagship examples is described wrong.

The brief says: *"While submissions are open, entries are hidden... the API's `toBlindEntry`
mapper strips the author and the images out of the payload."*

The code (`challenge-events.controller.ts:97-102`) actually does something different, and
better:

- During `upcoming` and `open`, entries are `[]`. Not stripped — **absent**. Stronger than
  claimed.
- `toBlindEntry` runs during **voting**, and keeps `imageUrl` (it must — that is the thing
  being judged) while nulling `username`, `workspacePhotoUrl`, `notes`, blanking `userId`,
  and zeroing `voteCount`.

So the mapper does not strip "the images", and it does not run during the submission
window. The mechanism is fine. The description is not. If you are handing this brief to
reviewers as an audit, that error costs you more than the thing it misdescribes.

Two things the brief **undersells**, which materially change the analysis:

- **Self-voting is refused server-side on both surfaces** — `challenge-events.service.ts:176`
  and `ballot.service.ts:157`. Not mentioned anywhere in section 6, and it is one of your
  better controls.
- **Room ballots are restricted to participants with status `SUBMITTED`**
  (`ballot.service.ts:141-148`). This is the single most important fact in the sockpuppet
  question and the brief does not mention it at all.

---

## 3. Is the two-contest design coherent? (Q2)

**Yes, the split is right. No, you cannot afford it. And you should stop calling both of
them "blind voting."**

The mechanics actually fit their contexts, which is more than the brief gives itself credit
for:

- Public challenges are asynchronous, days long, potentially many entries. **One vote per
  person** is correct there — plurality is fine at scale and cheap to reason about.
- Rooms are synchronous, minutes long, 2–16 entries. **Approval voting (unlimited likes)
  with a runoff** is correct there — with tiny n, forcing a single pick throws away most of
  the signal, and ties are frequent enough to need the runoff you built.

So this is not incoherence. Someone reasoned about each case separately and got each one
right. The inconsistency is in the **vocabulary**, not the design. "Blind" means two
different things: in challenges it means *anonymised*; in rooms it means *anonymised,
shuffled per-voter, and time-boxed at 10s+3s*. Name them differently and the confusion
disappears.

The real problem is not coherence, it is **cost**. You are one person maintaining two
contest engines, two voting systems, two schedulers and two state machines, with no tests
and no users. That is the thing to fix — not by merging them, but by deciding which one is
the product and letting the other be secondary.

**Rooms is the product.** A synchronous timed contest where the *server* draws a brief
nobody has seen is genuinely hard to replicate in Discord — that is your moat. Public
challenges are a subreddit contest with a countdown; a Discord bot and an honour system get
you 80% of it. If you had to cut one, cut the one that is easy to copy.

Which is awkward, because rooms is also the one most damaged by the hosting problem and the
one with no discovery. That is not a coincidence — it is the same contradiction from
section 0.

---

## 4. The dead vertical: delete or finish? (Q3)

**Delete it — with one organ harvested.**

Confirmed: no battles module, controller or endpoint; no `@WebSocketGateway` anywhere;
`socket.io-client` imported by nothing; `NotificationsService.create` called by nothing
outside its own module.

Your framing is that this is inert. It is not, and this is the part I want you to actually
change your mind about:

**`metrics.service.ts` queries `battles`, `reactions`, and `times_played`** — lines 115,
120, 132-138, 152-159, 124-127. Those tables receive no writes. So your admin and manager
dashboards do not show "no data yet". They show **structurally, permanently zero**, with no
indication that the number is meaningless. Battles-per-day is a flat line at zero forever.
Most-played is empty forever. Reaction count is zero forever.

Dead schema that nothing reads is free. Dead schema that your **analytics layer reads and
reports on** is a lie you will eventually believe. That upgrades this from tidiness to a
correctness bug.

What to do, in order:

1. Rewrite `metrics.service.ts` against `rooms`, `submissions`, `challenge_entries` and
   `submission_likes` — the tables that actually receive writes. Do this **first**; it is
   the only part with user-visible consequences.
2. Drop `battles`, `battle_participants`, `votes`, `reactions` and the achievements tables
   in a new migration. Do not edit the old migrations.
3. Delete from `packages/shared`: `BattleStatus`, `BattleSide`, `QueueTicket`,
   `SOCKET_EVENTS`, `ReactionType`, and the five battle timing constants.
4. Delete the Socket.IO Redis adapter from `main.ts` and `socket.io-client` from the web
   app. You are not doing realtime; rooms poll and that is fine at your scale.
5. Delete achievements references, including the notification bell's empty state text about
   "unlocks", which currently promises a feature that has no module.

**What you lose:** ranking, and the notion that a result is worth something. Which is
exactly the gap in section 0. So do not delete ranking — **rebuild it on rooms results**,
where the data actually exists. `LEADERBOARD_KEY`, `SCORE_WIN/LOSS/DRAW` can survive; a
`LeaderboardService` over completed ranked rooms is maybe a day's work and it is the single
change that makes the rest of the system mean something.

**Notifications:** do not delete. The endpoints, bell, unread count and toasts all work —
you are two or three `create()` calls from a working feature ("your room starts now", "the
ballot is open", "you won"). Highest ratio of value to remaining work in the entire
repository. Wire it up rather than removing it.

---

## 5. What do I test first? (Q4)

Before any test: **make the harness run.** `apps/api`'s `test:e2e` references a config file
that does not exist. Fix that and add a real `test` step to CI, or the tests you write will
rot within a month.

Then, ranked by *expected cost of a silent failure*, not by ease:

**1. The blind-entry contract.** `toBlindEntry` plus the phase gate in
`challenge-events.controller.ts`, and `visibleEntriesFor` in `ballot.service.ts`.
Assert on the **serialized response**, not the mapper's return value — for each phase,
assert the JSON contains no username, no `workspacePhotoUrl`, no non-empty `userId`, and no
non-zero `voteCount`. Write it as a snapshot so that *adding a field to the entity* fails
the test. That is the actual failure mode: someone adds `entry.artistCountry` in six months
and it silently ships into the blind payload.

**2. `phaseOf` — the clock-to-phase derivation.** A pure function, so this is the cheapest
test you will ever write, and everything else depends on it. Table-driven: one second
before open, exactly at open, one second before close, exactly at close, DST boundary,
non-UTC server TZ. An off-by-one here opens submissions during voting and nothing in the UI
would look wrong.

**3. Room state transitions under contention.** Two concurrent `closeSubmissions` /
`finalise` calls on the same room must produce exactly one advance. You have belt and
braces here already — the Redis lock *and* the conditional `UPDATE ... WHERE status = :from`
(`room-scheduler.service.ts`, confirmed) — which is good design and completely unverified.
This matters more once you make advancement read-driven (section 6), because then
concurrency is the normal case rather than a scheduler edge case.

**4. Refresh rotation and reuse detection.** `token.service.ts:144`, the SERIALIZABLE
transaction. Test the *reuse* path specifically: present a revoked token, assert the whole
family dies. A bug that fails to revoke is silent and is your entire auth model. (A bug in
the other direction logs everyone out loudly, which is self-reporting and therefore less
dangerous.)

**5. The results rollup and `chk_users_battles_consistent`.** You noted the constraint is
checked per statement, which is why the rollup is one UPDATE per participant. That means a
failure partway through leaves **some** participants credited and some not, permanently,
with no compensating write. Test that a mid-rollup failure does not half-apply — and
consider making the rollup one transaction with the constraint deferred.

Five tests. That is a day, maybe two. It covers every guarantee you advertise.

---

## 6. Sockpuppets: how exposed, and the cheapest fix (Q5)

Your two surfaces have **completely different** exposure, and the brief treats them as one
problem. Separating them makes the fix obvious.

### Rooms: much safer than you think, for a reason you did not list

To rig a room I must: create N accounts, obtain the join code, join, **and submit a valid
1024×1024 render plus a workspace screenshot from each account** — because
`ballot.service.ts:141-148` refuses a vote from anyone whose participant status is not
`SUBMITTED`. And I cannot like my own work (`:157`).

The cost of faking the *work* dominates everything else. That, not
`ROOM_RANKED_MIN_SUBMISSIONS`, is what defends rooms. Your unwired constant is a nice-to-have;
the submission requirement is the real control, and you already shipped it.

The genuine problem in rooms is not sockpuppets, it is **`isRanked` being tautological**.
`room.visibility === PUBLIC` is always true because nothing ever assigns `visibility`, so
`isRanked` collapses to `submitted >= ROOM_MIN_PLAYERS` — i.e. two people. Two friends can
mint ranked results all afternoon. Fix by wiring `ROOM_RANKED_MIN_SUBMISSIONS` (4) and
either assigning `visibility` properly or deleting the column and the clause. Ten minutes.
Do it when you rebuild ranking, since before then "ranked" means nothing anyway.

### Public challenges: this is where it is actually bad

One vote per account, registration free, email never verified (confirmed — no mailer
dependency, no verification path in `auth.service.ts:38`), and **non-entrants can vote**.
Cost of a fake vote: one email address. The global `ThrottlerGuard` (`app.module.ts:83`)
slows bulk registration a little; it does not change the economics.

**The cheapest effective fix is one you have already written, in the other module: require
that a voter has entered.** Mirror `ballot.service.ts:141-148` into
`challenge-events.service.ts:vote()`.

That single change:

- raises the cost of a fake vote from *an email address* to *a plausible 1024×1024 render
  plus a workspace screenshot* — a three-order-of-magnitude increase for a few lines;
- makes the two contest surfaces **consistent**, which is most of the answer to Q2's
  vocabulary complaint;
- needs no email infrastructure, no captcha, no reputation system, no new dependency.

The cost: spectators can no longer vote. You have no spectators — there is no room
discovery, no public traffic, and every page is a client component so the challenge pages
are not being found by search either. You are giving up something you do not have.

Email verification is the right *second* step, but do it when you build password reset,
because that is when you will have a mailer anyway. Doing it first means standing up email
infrastructure to solve a problem that four lines of authorisation solves better.

---

## 7. Is the hosting viable? (Q6)

**The pinger is not good enough, but the architecture is wrong in a way you can fix in an
afternoon — and the fix is a pattern already in this repo.**

The problem is not the 1-second interval. A 1s interval is free. The problem is that
**room correctness is coupled to a process being alive at a specific wall-clock instant.**
That coupling is what makes free-tier hosting fatal, and it would still be a bad design on
paid hosting — it just would not bite as often.

Notice the inconsistency in your own codebase. The brief boasts, correctly, that public
challenge phases are *"derived from the clock, not stored as a state a client can push"* —
and `phaseOf()` does exactly that, computed on read. But **rooms store `status` and depend
on a sweeper to move it.** Same system, same author, two opposite approaches to the same
problem, and only one of them survives the host going to sleep.

**Make room advancement read-driven.** When anyone loads a room, compute the phase it
*should* be in from the timestamps, and if it differs, advance it right there. Your
conditional `UPDATE ... WHERE status = :from` already makes this safe against concurrent
readers doing it simultaneously — that is precisely the guard it provides.

The consequences are very good:

- During an active room, clients are polling constantly. The people who care about the
  transition **are the ones who trigger it**. A sleeping API wakes on their first request
  and immediately advances the room correctly, because the deadline is a stored timestamp
  and does not care how late it is read.
- The sweeper stops being load-bearing and becomes an optimisation for the "nobody is
  looking" case — cleaning up abandoned rooms, closing events nobody is watching. At which
  point 10 seconds is plenty and the 1s interval can go.
- Cold start becomes a latency problem instead of a correctness problem. That is the whole
  ballgame on free hosting.

One caveat: `finalise()` has side effects — writes records, awards XP, notifies. Read-driven
advancement means those fire inside a GET. Guard with the conditional UPDATE (which you
have) so exactly one caller wins, and keep the writes in that transaction.

Do this and Render free becomes genuinely viable for the actual traffic you have. Keep a
pinger if you like, but as a latency optimisation, not a correctness crutch.

Neon's suspension is fine either way — it wakes on connection, and the deadline is in a
column, not in memory.

---

## 8. The `localStorage` refresh token (Q7)

**Acceptable now. Sequence it with the auth work, not before it.**

The honest calculation: what does an account takeover currently get an attacker? No money,
no payment details, no private messages, an unverified email address, and a rank that is
`null`. The realistic damage is "someone posts a render as you." Meanwhile the fix is not
one line — your web app is on Cloudflare Workers and your API is on Render, so httpOnly
cookies mean cross-site: `SameSite=None; Secure`, CORS with credentials, and CSRF protection
you do not currently need. That is a real chunk of work and a whole new class of bug, on a
codebase with zero tests.

You also have a mitigation most apps in this position do not: **reuse detection**. A stolen
refresh token is usable at most once, and using it kills the family and logs the real user
out — so theft is both limited and *loud*. That is a materially better position than the
usual "localStorage token, no rotation" story.

But be clear about **when it stops being acceptable**, because both triggers are on my
recommended list:

- **When ranking becomes real.** Accounts acquire value; takeover becomes worth doing.
- **When you add password reset.** Today a takeover is annoying. With account recovery, an
  attacker who takes an account can change the email and make the loss *permanent*.

So: build password reset and httpOnly cookies **in the same piece of work**. Doing reset
first strictly increases your exposure.

---

## 9. Trade-offs you made without noticing

**You bought integrity and did not buy distribution.** The deepest one, covered in
section 0. Every architectural decision assumes adversarial strangers; the product only
admits invited friends.

**You derived phase from the clock in one module and stored it in the other.** You got the
hard call right for challenges and then did not carry it to rooms. The entire hosting
problem is downstream of that single inconsistency — and you have been treating it as an
infrastructure constraint rather than a design choice.

**Every web page is a client component.** You are running Next.js App Router on Cloudflare
Workers and using essentially none of it. You paid for that with first paint, bundle size,
and — critically — **search indexability of your public challenge pages**. For a product
whose main problem is that nobody can find it, shipping the public, shareable surface as
client-rendered is working directly against the thing you most need. Making
`/challenges/[slug]` and `/events/[id]` server components is the cheapest growth work
available, and it is the only place where App Router earns its complexity.

**`packages/shared` guarantees the value matches, not that anyone uses it.** The stated
purpose is "so a limit cannot drift". `ROOM_RANKED_MIN_SUBMISSIONS` is the counterexample:
perfectly shared, perfectly consistent, referenced by nothing, with a doc comment
explaining an anti-collusion policy that is not in force. You solved value drift and got
**dead policy** instead — which is worse, because a stale value is visible in a diff and a
policy that is documented-but-unwired reads as implemented. Worth an occasional
"is every exported constant imported somewhere" check; it is a one-line grep in CI.

**`submission_likes` are toggled, never deleted, "so a vote history survives."** Nothing
reads that history. You pay for it on every tally (`active = true` in the join) and in row
count, permanently, for an audit trail no code consults. Keep it if you intend to build
collusion detection on it — that would be a genuinely good use. Otherwise you are paying
rent on an asset you do not own.

**Hand-built `Select` and datetime field.** Correct call for visual coherence, and your
reasoning about `datetime-local` following OS locale is right. But you now own the
accessibility surface of two of the hardest widgets in the business — keyboard, focus
management, `aria-activedescendant`, screen reader announcements — with zero tests. The
fact that you measured ΔE 17.4 against protanopia and deuteranopia says you care about this
properly, which is exactly why the gap is worth naming: a custom combobox is where careful
accessibility usually dies quietly.

**`AGENTS.md`.** You filed this under "docs contradicting the code." It is worse than that.
You have duplicated a "respond like a caveman" style rule into five agent-config
directories, so **every AI tool that opens this repository receives a joke instruction
instead of an architecture overview** — and `git status` shows all five are currently
modified, so it is live. You are a solo developer on a monorepo with zero tests; AI tooling
is your largest force multiplier and you have deliberately lobotomised it in five places.
Replacing those files with a real project overview is probably the highest hourly-return
change in this entire review.

---

## 10. What is good, and worth keeping

Do not let the length of the criticism obscure this. Several of these are better than what
I see in funded production systems.

- **Refresh rotation with family-wide reuse detection inside a SERIALIZABLE transaction.**
  Correct, and the reasoning — theft is limited *and* self-reporting — is exactly right.
- **The draw takes filters, never an id.** Structural rather than a check. This is the
  single best decision in the codebase. A check can be bypassed; a host who cannot express
  a choice cannot make one.
- **Absolute UTC instants; the client is told *when*, never *how long*.** Kills an entire
  class of clock and paused-tab bugs by construction.
- **Self-vote refused server-side on both surfaces**, with the comment explicitly noting
  that hiding it client-side is a courtesy and refusing the write is the rule. That
  sentence is the correct mental model and it shows up throughout.
- **Conditional `UPDATE ... WHERE status = :from` plus Redis locks with token-matched
  release.** Two independent mechanisms against double-advance, and the token-matched
  release specifically prevents the classic bug of releasing someone else's lock.
- **Uploads server-signed, dimensions verified on the received file, rejected uploads
  destroyed rather than orphaned.** The cleanup detail is the one everybody skips.
- **The workspace screenshot as anti-cheat.** Cheap, social, hard to fake, needs no
  detection model, and self-enforcing because voters see it. Genuinely clever product
  thinking, and worth more than most of the technical controls.
- **The outcome palette checked against protanopia and deuteranopia to a measured ΔE.**
  Almost nobody does this. Keep it and keep saying so.
- **Partial unique index on `join_code` scoped to live rooms**, so codes recycle without a
  global collision space. Small, correct, and the kind of thing that is painful to retrofit.
- **The blind-entry mapper returning `[]` during the submission window.** Stronger than
  your own brief claims. Nothing to leak beats nothing leaked.

---

## 11. Prioritised

### Fix before anyone real uses this

1. **Make room phase advancement read-driven.** Removes the dependency on a process being
   awake at an instant. Single highest-leverage change here. (§7)
2. **Restrict public-challenge voting to entrants.** Four lines, mirrors code you already
   wrote, three orders of magnitude on attack cost. (§6)
3. **Password reset + email verification, together, with httpOnly cookies.** Right now a
   forgotten password is a destroyed account, and that is the kind of thing that makes a
   real user never come back. (§8)
4. **Make the test harness run, then write the five tests in §5.** A day or two. Do it
   before, not after, the refactors above — the room-transition test is the one that tells
   you the read-driven change is safe.
5. **Fix `metrics.service.ts` to query tables that receive writes.** Your dashboards
   currently report structural zeros as if they were data. (§4)
6. **Delete `AGENTS.md`'s caveman rule from all five directories and replace with a real
   overview.** One hour, and it improves every hour after it. (§9)
7. **Fix the actively dangerous docs.** The `wrangler.jsonc` vars instruction already
   shipped `localhost:4000` to production once; a doc that recreates a known outage is a
   loaded gun. The Vercel/Cloudflare and Vitest-coverage claims in `README.md` can wait but
   should not survive the week.

### Fix when it grows

- **Rebuild ranking on rooms results**, wire `ROOM_RANKED_MIN_SUBMISSIONS`, and either
  assign `Room.visibility` or delete it and its tautological clause. This is what gives the
  anti-cheat a reason to exist — schedule it deliberately, not "eventually". (§0, §4, §6)
- **Wire notifications.** Two or three `create()` calls light up a fully built feature. (§4)
- **Delete the battles / sockets / achievements schema and shared exports**, after the
  metrics fix. (§4)
- **Room discovery.** A public room list, or at minimum shareable invite links with
  previews. Without it the product cannot grow past your friend group. (§0)
- **Server-render `/challenges/[slug]` and `/events/[id]`.** Cheapest growth work
  available. (§9)
- **Schedule `TokenService.pruneExpiredTokens`.** It exists and never runs; the table grows
  forever.
- **Accessibility audit of the hand-built `Select` and datetime field.** (§9)
- **CI check that every exported constant in `packages/shared` is imported somewhere.**
  Would have caught `ROOM_RANKED_MIN_SUBMISSIONS`. (§9)
- **`/admin/users` client-side role guard**, for consistency with its siblings. The server
  already enforces it, so this is UX, not security.
- **`manifest.start_url`** → a public route. Installing the PWA signed out currently lands
  in a redirect.

### Leave alone

- **The arcade design system.** It is consistent, it is opinionated, it has a real point of
  view, and it is the reason this looks like a product rather than a project. Do not
  refactor it.
- **The two-contest split.** Do not collapse it. Rename the voting modes so "blind" means
  one thing, and let the mechanics stay different because the contexts are different. (§3)
- **The `localStorage` refresh token — for now, and only until ranking or password reset
  lands.** (§8)
- **Approval voting plus runoff in rooms.** Correct for small n. Leave it.
- **Soft deletes throughout.** Cheap, and you will want them.
- **The 1-second interval itself.** It is not the problem; the coupling is. Once
  advancement is read-driven you can relax it to 10s, but it costs nothing as it stands.
- **Hand-built controls.** Keep them — just audit them.
- **`model_url` / `model_filename`, `org_id`, `favorite_category_id`.** Genuinely inert
  columns. Drop them opportunistically in a migration you are writing anyway; do not make
  a trip for them.
- **The inert `/challenges?tag=…` links.** Either read the query param (small) or drop the
  link. Trivial either way — do not let it near the top of a list.

---

## One-line version

The engineering is better than the product: you built rigorous integrity guarantees for a
contest with nothing at stake, on hosting that sleeps through your deadlines, with no way
for anyone to find a room and no test that would tell you if any of it broke. Give the
results meaning, make phases derive on read, require entry to vote, and write five tests —
and this becomes a genuinely good piece of software.
