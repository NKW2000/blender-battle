'use client';

import { ChallengeAssetType, Difficulty, SUBMISSION_IMAGE_SIZE } from '@bb/shared';
import Link from 'next/link';
import { useEffect, useRef, useState } from 'react';

import { ChunkyButton } from '@/components/arcade/chunky';
import {
  EntryImageFields,
  type EntryImages,
} from '@/components/submissions/entry-image-fields';
import { UI_LOCALE } from '@/lib/utils';
import { FireIcon } from '@/components/ui/icons';
import { EmptyState, Panel, Skeleton } from '@/components/ui/panel';
import { VoteScreen } from '@/components/challenges/vote-screen';
import { useEnterEvent, useEvent, type EventDetail } from '@/features/challenges/use-events';

/*
  The challenge screen, on the arcade language.

  Built from the handoff design rather than approximated from it: the two-column
  action/reference row, the brief and judging row beneath it, the stat tiles, the
  numbered criteria and the reference carousel are the design's own structure.

  Two deliberate departures, both in service of the same thing the design assumes
  and a static canvas cannot express:

  1. Every grid stacks below `lg`. The design is drawn at one desktop width with
     fixed `1fr 1fr` columns, which at 390px would put two panels side by side at
     ~170px each.
  2. Nothing is a fixed count. The design shows three reference images and three
     criteria because that is what its sample challenge has; here both come from
     the record, so the carousel drops its arrows at one image and disappears at
     none, and the brief drops the Blender tile when no version is set.
*/

/** The icon tile the design puts at the head of every panel. */
function PanelIcon({
  tone,
  children,
}: {
  tone: 'sun' | 'aqua' | 'mint' | 'punch' | 'ember';
  children: React.ReactNode;
}) {
  const fill = {
    sun: 'bg-sun',
    aqua: 'bg-aqua',
    mint: 'bg-mint',
    punch: 'bg-punch',
    ember: 'bg-ember',
  }[tone];

  return (
    <span
      className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border-[2.5px] border-ink text-ink ${fill}`}
      style={{ boxShadow: '0 3px 0 var(--color-ink)' }}
      aria-hidden="true"
    >
      {children}
    </span>
  );
}

const ICON = {
  upload: (
    <svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round">
      <path d="M12 16V4M8 8l4-4 4 4" />
      <path d="M4 14v4a2 2 0 002 2h12a2 2 0 002-2v-4" />
    </svg>
  ),
  image: (
    <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
      <rect x="3" y="4" width="18" height="16" rx="2.5" />
      <circle cx="8.5" cy="9" r="1.6" />
      <path d="M21 16l-5-5-6 6" />
    </svg>
  ),
  lines: (
    <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round">
      <path d="M4 5h16M4 12h16M4 19h10" />
    </svg>
  ),
  check: (
    <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round">
      <path d="M20 7L9 18l-5-5" />
    </svg>
  ),
  clock: (
    <svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round">
      <circle cx="12" cy="13" r="8" />
      <path d="M12 9v4l2.5 2M12 2h4M12 2H8" />
    </svg>
  ),
  file: (
    <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round">
      <path d="M14 3H7a2 2 0 00-2 2v14a2 2 0 002 2h10a2 2 0 002-2V8z" />
      <path d="M14 3v5h5" />
    </svg>
  ),
} as const;

/** The design's outer panel: ink outline, hard shadow, header rule. */
function Card({ className = '', children }: { className?: string; children: React.ReactNode }) {
  return (
    <div
      className={`flex flex-col overflow-hidden rounded-[22px] border-[3px] border-ink bg-white/4 ${className}`}
      style={{ boxShadow: '0 8px 0 var(--color-ink)' }}
    >
      {children}
    </div>
  );
}

function CardHead({ tone, icon, children }: { tone: 'sun' | 'aqua' | 'mint' | 'punch' | 'ember'; icon: React.ReactNode; children: React.ReactNode }) {
  return (
    <div className="flex items-center gap-3 border-b-[3px] border-ink bg-white/3 px-5 py-4 sm:px-6.5 sm:py-5">
      <PanelIcon tone={tone}>{icon}</PanelIcon>
      <span className="font-display text-xl font-bold text-cream">{children}</span>
    </div>
  );
}

/** Counts down to an absolute server deadline, corrected for clock skew. */
function useDeadline(deadline: string | null, serverNow: string | undefined) {
  const [remaining, setRemaining] = useState<number | null>(null);
  const offsetRef = useRef(0);

  useEffect(() => {
    if (serverNow) offsetRef.current = Date.parse(serverNow) - Date.now();
  }, [serverNow]);

  useEffect(() => {
    if (!deadline) {
      setRemaining(null);
      return;
    }
    const tick = () => {
      const now = Date.now() + offsetRef.current;
      setRemaining(Math.max(0, (Date.parse(deadline) - now) / 1000));
    };
    tick();
    const timer = setInterval(tick, 1000);
    return () => clearInterval(timer);
  }, [deadline]);

  return remaining;
}

function formatRemaining(seconds: number | null): string {
  if (seconds === null) return '';
  const total = Math.ceil(seconds);
  const days = Math.floor(total / 86_400);
  const hours = Math.floor((total % 86_400) / 3_600);
  const minutes = Math.floor((total % 3_600) / 60);
  const secs = total % 60;
  if (days > 0) return `${days}d ${hours}h`;
  if (hours > 0) return `${hours}h ${minutes}m`;
  return `${String(minutes).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
}

/**
 * The interactive half of an event.
 *
 * Split out of `page.tsx`, which is now a server component. `initialEvent` is
 * the copy the server already fetched — signed out, so `myEntryId` and
 * `myVoteEntryId` are null in it. The query refetches on mount with the
 * visitor's own credentials, which fills those in for a signed-in reader
 * without making a signed-out one wait for anything.
 */
export function EventDetailView({
  id,
  initialEvent,
}: {
  id: string;
  initialEvent: EventDetail | null;
}) {
  const { data: event, isLoading, error } = useEvent(id, initialEvent ?? undefined);

  if (isLoading) return <Skeleton className="h-64 w-full" />;

  if (!event) {
    return (
      <Panel>
        <EmptyState
          title="Challenge not found"
          description={error?.message ?? 'This competition may have been removed.'}
          action={
            <Link href="/events" className="mt-2 text-sm font-extrabold text-aqua">
              Back to challenges
            </Link>
          }
        />
      </Panel>
    );
  }

  const references = event.assets.filter(
    (asset) => asset.type === ChallengeAssetType.REFERENCE_IMAGE,
  );

  return (
    <div className="flex flex-col gap-[clamp(20px,2.6vw,30px)]">
      <EventHeader event={event} />

      {/*
        Voting takes the whole width — the vote screen carries its own reference
        panel and ballot, and pairing it with a second reference carousel would
        put the same images on the page twice.
      */}
      {event.phase === 'voting' ? (
        <VoteScreen event={event} />
      ) : (
        <div className="grid items-stretch gap-[clamp(14px,1.8vw,24px)] lg:grid-cols-2">
          {event.phase === 'upcoming' ? <UpcomingPanel event={event} /> : null}
          {event.phase === 'open' ? <EnterPanel event={event} /> : null}
          {event.phase === 'finished' ? <WinnerPanel event={event} /> : null}
          <ReferencePanel references={references} />
        </div>
      )}

      <div className="grid items-stretch gap-[clamp(14px,1.8vw,24px)] lg:grid-cols-[1.15fr_.85fr]">
        <BriefPanel event={event} />
        {event.objectives.length > 0 ? <JudgedOnPanel objectives={event.objectives} /> : null}
      </div>

      <Extras event={event} />

      {event.phase === 'finished' ? <OtherEntries event={event} /> : null}
    </div>
  );
}

/**
 * Difficulty as the design's pill.
 *
 * A tinted fill with a matching 2px border and no ink outline — the one badge in
 * this language that is not a sticker, because it labels the title rather than
 * acting.
 */
const DIFFICULTY = {
  [Difficulty.EASY]: 'text-mint border-mint bg-mint/14',
  [Difficulty.MEDIUM]: 'text-aqua border-aqua bg-aqua/14',
  [Difficulty.HARD]: 'text-punch-soft border-punch-soft bg-punch/14',
} as const;

function EventHeader({ event }: { event: EventDetail }) {
  const target =
    event.phase === 'upcoming'
      ? event.startDate
      : event.phase === 'voting'
        ? event.votingEndsAt
        : event.endDate;
  // Count down in every timed phase — including voting now that it has its own
  // deadline. Voting with no set deadline (manager closes by hand) shows no clock.
  const remaining = useDeadline(
    event.phase === 'upcoming' || event.phase === 'open' || event.phase === 'voting'
      ? target
      : null,
    event.serverNow,
  );

  const label =
    event.phase === 'upcoming'
      ? 'Opens in'
      : event.phase === 'open'
        ? 'Closes in'
        : event.phase === 'voting'
          ? 'Voting closes in'
          : 'Finished';

  return (
    <header className="flex flex-wrap items-end justify-between gap-5">
      <div className="min-w-0">
        <div className="flex flex-wrap items-center gap-2.5">
          <Link
            href="/events"
            className="text-[13px] font-black uppercase tracking-[1.4px] text-haze-5 transition-colors hover:text-cream"
          >
            ← Challenges
          </Link>
          <span className="font-black text-haze-6">/</span>
          <span className="text-[13px] font-black uppercase tracking-[1.4px] text-aqua">
            {event.category?.name ?? 'Any discipline'}
          </span>
          <span
            className={`rounded-full border-2 px-3 py-1 font-display text-xs font-bold uppercase tracking-[.5px] ${DIFFICULTY[event.difficulty]}`}
          >
            {event.difficulty}
          </span>
        </div>
        <h1
          /* The design's own clamp. `break-words` is the one addition: at the
             38px floor a single long title word would otherwise run off a 375px
             screen, and the canvas only ever had to render "The couch". */
          className="mt-2.5 break-words font-display text-[clamp(38px,5.4vw,68px)] font-bold uppercase leading-[1.05] tracking-[-.5px] text-cream"
          style={{ textShadow: '0 5px 0 rgba(14,11,43,.4)' }}
        >
          {event.title}
        </h1>
      </div>

      <div
        className="flex shrink-0 items-center gap-3.5 rounded-[18px] border-[3px] border-punch bg-punch/12 px-5 py-3"
        style={{ boxShadow: '0 6px 0 var(--color-ink)' }}
      >
        <PanelIcon tone="punch">{ICON.clock}</PanelIcon>
        <div>
          <div className="text-[11px] font-black uppercase tracking-[1.6px] text-punch-soft">
            {label}
          </div>
          <div className="mt-0.5 font-display text-2xl font-bold leading-none text-cream">
            {remaining !== null ? formatRemaining(remaining) : event.phase}
          </div>
        </div>
      </div>
    </header>
  );
}

/** Open window: the design's yellow-outlined entry card. */
function EnterPanel({ event }: { event: EventDetail }) {
  const enter = useEnterEvent(event.id);
  const [files, setFiles] = useState<EntryImages>({ image: null, workspace: null });
  const alreadyEntered = Boolean(event.myEntryId);
  const canSubmit = Boolean(files.image && files.workspace) && !enter.isPending;

  return (
    <div
      className="flex flex-col overflow-hidden rounded-[24px] border-4 border-sun bg-linear-160 from-sun/10 to-white/2"
      style={{ boxShadow: '0 10px 0 var(--color-ink)' }}
    >
      <div className="flex items-center gap-3 border-b-[3px] border-ink bg-linear-to-b from-sun/16 to-transparent px-5 py-5 sm:px-7">
        <PanelIcon tone="sun">{ICON.upload}</PanelIcon>
        <span className="font-display text-[23px] font-bold text-cream">
          {alreadyEntered ? 'Entry received' : 'Enter the challenge'}
        </span>
      </div>

      <div className="flex flex-1 flex-col px-5 pb-7 pt-6 sm:px-7">
        <p className="mb-6 max-w-[820px] text-[15px] font-extrabold leading-[1.55] text-haze">
          {alreadyEntered ? (
            <>You are in. You can replace your entry until the deadline.</>
          ) : (
            <>
              Upload both images before the deadline — each must be exactly{' '}
              <span className="text-sun">
                {SUBMISSION_IMAGE_SIZE}×{SUBMISSION_IMAGE_SIZE}px
              </span>
              . Everyone&apos;s work stays hidden until entries close.
            </>
          )}
        </p>

        <div className="grid flex-1 gap-4">
          <EntryImageFields value={files} onChange={setFiles} disabled={enter.isPending} />
        </div>

        {enter.isError ? (
          <p role="alert" className="mt-4 text-sm font-extrabold text-punch-soft">
            {enter.error.message}
          </p>
        ) : null}

        <ChunkyButton
          size="lg"
          sheen
          className="mt-5.5 w-full rounded-2xl border-[3px] bg-linear-to-b from-sun to-ember py-4 text-xl [--press-depth:7px]"
          style={{ boxShadow: '0 7px 0 var(--color-ink)' }}
          onClick={() =>
            files.image && files.workspace &&
            enter.mutate({ image: files.image, workspace: files.workspace })
          }
          disabled={!canSubmit}
        >
          {enter.isPending ? 'Uploading…' : alreadyEntered ? 'Replace entry' : 'Submit entry'}
        </ChunkyButton>
      </div>
    </div>
  );
}

function UpcomingPanel({ event }: { event: EventDetail }) {
  return (
    <Card>
      <CardHead tone="aqua" icon={ICON.clock}>
        Not open yet
      </CardHead>
      <div className="flex flex-1 items-center px-5 py-6 sm:px-6.5">
        <p className="text-[15px] font-extrabold leading-[1.55] text-haze">
          Entries open{' '}
          <span className="text-aqua">
            {event.startDate ? new Date(event.startDate).toLocaleString(UI_LOCALE) : 'soon'}
          </span>
          . Come back then to upload your work.
        </p>
      </div>
    </Card>
  );
}

function WinnerPanel({ event }: { event: EventDetail }) {
  const winner = event.entries.find((entry) => entry.id === event.winnerEntryId);

  return (
    <div
      className="flex flex-col overflow-hidden rounded-[24px] border-4 border-sun bg-linear-160 from-sun/10 to-white/2"
      style={{ boxShadow: '0 10px 0 var(--color-ink)' }}
    >
      <div className="flex items-center gap-3 border-b-[3px] border-ink bg-linear-to-b from-sun/16 to-transparent px-5 py-5 sm:px-7">
        <PanelIcon tone="sun">
          <FireIcon size={22} />
        </PanelIcon>
        <span className="font-display text-[23px] font-bold text-cream">Winner</span>
      </div>

      {winner ? (
        <div className="flex flex-1 flex-col gap-3 p-5 sm:p-7">
          {/* eslint-disable-next-line @next/next/no-img-element -- Cloudinary asset */}
          <img
            src={winner.imageUrl}
            alt={`Winning entry by ${winner.username}`}
            className="w-full rounded-[16px] border-[3px] border-ink object-cover"
            style={{ boxShadow: '0 5px 0 var(--color-ink)' }}
          />
          <div className="flex items-center justify-between gap-3">
            <span className="truncate font-display text-lg font-bold text-cream">
              {winner.username}
            </span>
            <span className="flex shrink-0 items-center gap-2 font-display text-base font-bold text-sun">
              <FireIcon size={22} /> {winner.voteCount} votes
            </span>
          </div>
        </div>
      ) : (
        <EmptyState title="No winner" description="This challenge closed without a result." />
      )}
    </div>
  );
}

/**
 * The reference carousel.
 *
 * The design draws three slides with hard-coded captions; the count here is
 * whatever the challenge has. Below two images the arrows and dots are pointless
 * furniture, so they are not rendered — and with none, neither is the panel.
 */
function ReferencePanel({ references }: { references: EventDetail['assets'] }) {
  const [index, setIndex] = useState(0);
  const count = references.length;

  // Clamped rather than trusted: a manager can remove a reference while the page
  // is open, and the 15-second poll would otherwise leave the track scrolled to
  // a slide that no longer exists.
  const current = count > 0 ? Math.min(index, count - 1) : 0;

  if (count === 0) {
    return (
      <Card>
        <CardHead tone="punch" icon={ICON.image}>
          Reference
        </CardHead>
        <div className="flex flex-1 items-center justify-center px-6 py-10">
          <p className="text-center text-sm font-extrabold text-haze-5">
            No reference images for this challenge.
          </p>
        </div>
      </Card>
    );
  }

  const go = (next: number) => setIndex(((next % count) + count) % count);

  return (
    <Card>
      <CardHead tone="punch" icon={ICON.image}>
        Reference
      </CardHead>

      <div className="flex flex-1 flex-col px-5 py-5 sm:px-6.5 sm:py-6">
        <div
          className="relative min-h-[240px] flex-1 overflow-hidden rounded-2xl border-[3px] border-ink bg-arcade-deep"
          style={{ boxShadow: '0 5px 0 var(--color-ink)' }}
        >
          <div
            className="flex h-full transition-transform duration-[450ms] ease-[cubic-bezier(.22,1,.36,1)] motion-reduce:transition-none"
            style={{ transform: `translateX(-${current * 100}%)` }}
          >
            {references.map((asset, i) => (
              <div key={asset.id} className="h-full w-full flex-none">
                {/* eslint-disable-next-line @next/next/no-img-element -- Cloudinary-sized asset */}
                <img
                  src={asset.url}
                  alt={`Reference ${i + 1}`}
                  className="h-full w-full object-cover"
                />
              </div>
            ))}
          </div>

          <div className="pointer-events-none absolute left-3 top-3 flex items-center gap-1.5 rounded-full border-2 border-white/20 bg-ink/78 px-3 py-1.5">
            <span className="h-2.5 w-2.5 rounded-[3px] border-[1.5px] border-ink bg-mint" />
            <span className="text-[11px] font-black tracking-[.6px] text-cream">Reference</span>
          </div>

          {count > 1 ? (
            <>
              <span
                className="pointer-events-none absolute right-3 top-3 rounded-full border-2 border-ink bg-sun px-2.5 py-1 font-display text-xs font-bold text-ink"
                style={{ boxShadow: '0 2px 0 var(--color-ink)' }}
              >
                {current + 1} / {count}
              </span>

              <CarouselArrow side="left" onClick={() => go(current - 1)} />
              <CarouselArrow side="right" onClick={() => go(current + 1)} />
            </>
          ) : null}
        </div>

        {count > 1 ? (
          <div className="mt-4 flex items-center justify-center gap-2.5">
            {references.map((asset, i) => (
              <button
                key={asset.id}
                type="button"
                aria-label={`Reference ${i + 1}`}
                aria-current={i === current}
                onClick={() => go(i)}
                className={`h-[11px] cursor-pointer rounded-full border-2 border-ink transition-all duration-300 ${
                  i === current ? 'w-[26px] bg-sun' : 'w-[11px] bg-white/25'
                }`}
              />
            ))}
          </div>
        ) : null}
      </div>
    </Card>
  );
}

function CarouselArrow({ side, onClick }: { side: 'left' | 'right'; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={side === 'left' ? 'Previous reference' : 'Next reference'}
      className={`arcade-focus absolute top-1/2 flex h-11 w-11 -translate-y-1/2 cursor-pointer items-center justify-center rounded-[13px] border-[2.5px] border-ink bg-cream text-xl font-black text-ink transition-transform hover:translate-y-[calc(-50%+2px)] active:translate-y-[calc(-50%+4px)] ${
        side === 'left' ? 'left-3' : 'right-3'
      }`}
      style={{ boxShadow: '0 4px 0 var(--color-ink)' }}
    >
      {side === 'left' ? '‹' : '›'}
    </button>
  );
}

/** A stat tile from the design's brief header. */
function Stat({ label, value, accent }: { label: string; value: string; accent?: boolean }) {
  return (
    <div
      className={`min-w-[110px] flex-1 rounded-[14px] border-[2.5px] border-ink px-4 py-3.5 ${
        accent ? 'bg-sun/10' : 'bg-white/5'
      }`}
      style={{ boxShadow: '0 4px 0 var(--color-ink)' }}
    >
      <div className="text-[11px] font-black uppercase tracking-[1.2px] text-haze-5">{label}</div>
      <div
        className={`mt-1 font-display text-[22px] font-bold ${accent ? 'text-sun' : 'text-cream'}`}
      >
        {value}
      </div>
    </div>
  );
}

function BriefPanel({ event }: { event: EventDetail }) {
  return (
    <Card>
      <CardHead tone="ember" icon={ICON.lines}>
        The brief
      </CardHead>
      <div className="flex flex-col gap-5.5 px-5 py-6 sm:px-6.5">
        <div className="flex flex-wrap gap-3">
          <Stat label="Time" value={`${event.estimatedMinutes} min`} />
          <Stat label="Reward" value={`${event.rewardXp} XP`} accent />
          {/* Dropped rather than shown empty when the manager left it unset —
              the design has no state for a tile with no value. */}
          {event.blenderVersion ? <Stat label="Blender" value={event.blenderVersion} /> : null}
        </div>

        {/* `whitespace-pre-line`: managers write these with paragraph breaks,
            and collapsing them turns a brief into a wall. */}
        <p className="whitespace-pre-line text-base font-extrabold leading-[1.55] text-haze">
          {event.description}
        </p>
      </div>
    </Card>
  );
}

/** The numbered criteria. Colours cycle so a long list stays readable. */
const CRITERION_TONE = ['bg-ember', 'bg-aqua', 'bg-sun', 'bg-mint', 'bg-punch'] as const;

function JudgedOnPanel({ objectives }: { objectives: string[] }) {
  return (
    <Card>
      <CardHead tone="mint" icon={ICON.check}>
        Judged on
      </CardHead>
      <ol className="flex flex-1 flex-col justify-center gap-3.5 px-5 py-5 sm:px-6.5">
        {objectives.map((objective, i) => (
          <li key={objective} className="flex items-center gap-3.5">
            <span
              className={`flex h-6.5 w-6.5 shrink-0 items-center justify-center rounded-lg border-[2.5px] border-ink font-display text-[13px] font-bold text-ink ${
                CRITERION_TONE[i % CRITERION_TONE.length]
              }`}
              style={{ boxShadow: '0 3px 0 var(--color-ink)' }}
            >
              {i + 1}
            </span>
            <span className="font-display text-[17px] font-bold text-cream">{objective}</span>
          </li>
        ))}
      </ol>
    </Card>
  );
}

/**
 * Rules, downloadable files and tags.
 *
 * Not in the design, because the challenge it was drawn against has none of the
 * three. They are part of a brief and a manager can fill them in, so they render
 * in the same language when present and take no space when absent — which is
 * what makes the design's own sample render exactly as drawn.
 */
function Extras({ event }: { event: EventDetail }) {
  const files = event.assets.filter((asset) => asset.type === ChallengeAssetType.REFERENCE_FILE);
  const hasRules = Boolean(event.rules || event.allowedAssets || event.forbiddenAssets);

  if (!hasRules && files.length === 0 && event.tags.length === 0) return null;

  return (
    <div className="flex flex-col gap-[clamp(14px,1.8vw,24px)]">
      <div className="grid items-stretch gap-[clamp(14px,1.8vw,24px)] lg:grid-cols-[1.15fr_.85fr]">
        {hasRules ? (
          <Card>
            <CardHead tone="punch" icon={ICON.lines}>
              Rules
            </CardHead>
            <div className="flex flex-col gap-4 px-5 py-6 text-[15px] font-extrabold leading-[1.55] sm:px-6.5">
              {event.rules ? <p className="whitespace-pre-line text-haze">{event.rules}</p> : null}
              {event.allowedAssets ? (
                <div>
                  <p className="text-[11px] font-black uppercase tracking-[1.2px] text-mint">
                    Allowed
                  </p>
                  <p className="mt-1 text-haze">{event.allowedAssets}</p>
                </div>
              ) : null}
              {event.forbiddenAssets ? (
                <div>
                  <p className="text-[11px] font-black uppercase tracking-[1.2px] text-punch-soft">
                    Not allowed
                  </p>
                  <p className="mt-1 text-haze">{event.forbiddenAssets}</p>
                </div>
              ) : null}
            </div>
          </Card>
        ) : null}

        {files.length > 0 ? (
          <Card>
            <CardHead tone="aqua" icon={ICON.file}>
              Files
            </CardHead>
            <div className="flex flex-col gap-2.5 px-5 py-6 sm:px-6.5">
              {files.map((asset) => (
                <a
                  key={asset.id}
                  href={asset.url}
                  download
                  rel="noopener noreferrer nofollow"
                  className="flex items-center justify-between gap-3 rounded-[14px] border-[2.5px] border-ink bg-white/5 px-4 py-3 text-[13px] font-extrabold text-haze transition-colors hover:bg-white/10 hover:text-cream"
                  style={{ boxShadow: '0 4px 0 var(--color-ink)' }}
                >
                  <span className="truncate">{asset.filename}</span>
                  <span className="shrink-0 text-haze-5">{Math.round(asset.bytes / 1024)} KB</span>
                </a>
              ))}
            </div>
          </Card>
        ) : null}
      </div>

      {event.tags.length > 0 ? (
        <div className="flex flex-wrap gap-2.5">
          {event.tags.map((tag) => (
            <Link
              key={tag.id}
              href={`/challenges?tag=${tag.slug}`}
              className="rounded-[14px] border-[3px] border-white/16 bg-white/6 px-4 py-2 text-[13px] font-extrabold text-haze transition-colors hover:border-ink hover:bg-sun hover:text-ink"
            >
              {tag.name}
            </Link>
          ))}
        </div>
      ) : null}
    </div>
  );
}

function OtherEntries({ event }: { event: EventDetail }) {
  // Entries arrive in submission order; rank the also-rans by votes here, on the
  // finished screen, where a live-updating order can no longer bias anyone.
  const others = event.entries
    .filter((entry) => entry.id !== event.winnerEntryId)
    .sort((a, b) => b.voteCount - a.voteCount);

  if (others.length === 0) return null;

  return (
    <section className="flex flex-col gap-4">
      <h2 className="font-display text-xl font-bold text-cream">Other entries</h2>
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {others.map((entry) => (
          <div
            key={entry.id}
            className="flex flex-col gap-2 rounded-[16px] border-[3px] border-ink bg-white/4 p-2"
            style={{ boxShadow: '0 5px 0 var(--color-ink)' }}
          >
            {/* eslint-disable-next-line @next/next/no-img-element -- Cloudinary asset */}
            <img
              src={entry.imageUrl}
              alt={`Entry by ${entry.username}`}
              className="w-full rounded-[12px] border-2 border-ink object-cover"
            />
            <div className="flex items-center justify-between gap-2 px-1 text-sm font-extrabold">
              <span className="truncate text-cream">{entry.username}</span>
              <span className="shrink-0 text-haze-5">{entry.voteCount}</span>
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}
