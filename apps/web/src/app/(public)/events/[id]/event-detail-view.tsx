'use client';

import { ChallengeAssetType, Role, SUBMISSION_IMAGE_SIZE } from '@bb/shared';
import Link from 'next/link';
import { useEffect, useRef, useState } from 'react';

import { ChunkyButton } from '@/components/arcade/chunky';
import {
  BRIEF_ROW,
  BriefCrumbs,
  BriefPanel,
  BriefTitle,
  DifficultyPill,
  Extras,
  JudgedOnPanel,
  ReferencePanel,
} from '@/components/challenges/brief-parts';
import {
  EntryImageFields,
  type EntryImages,
} from '@/components/submissions/entry-image-fields';
import { UI_LOCALE } from '@/lib/utils';
import { FireIcon } from '@/components/ui/icons';
import {
  EmptyState,
  PANEL_ICON,
  Panel,
  PanelHeader,
  PanelIcon,
  PanelTitle,
  Skeleton,
} from '@/components/ui/panel';
import { Button } from '@/components/ui/button';
import { VoteScreen } from '@/components/challenges/vote-screen';
import { useEnterEvent, useEvent, type EventDetail } from '@/features/challenges/use-events';
import { useSession } from '@/features/auth/use-session';
import { instagramPostHref } from '@/lib/instagram-post';

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
        <div className={BRIEF_ROW}>
          {event.phase === 'upcoming' ? <UpcomingPanel event={event} /> : null}
          {event.phase === 'open' ? <EnterPanel event={event} /> : null}
          {event.phase === 'finished' ? <WinnerPanel event={event} /> : null}
          <ReferencePanel references={references} />
        </div>
      )}

      <div className={BRIEF_ROW}>
        <BriefPanel brief={event} />
        {event.objectives.length > 0 ? <JudgedOnPanel objectives={event.objectives} /> : null}
      </div>

      <Extras brief={event} />

      {event.phase === 'finished' ? <OtherEntries event={event} /> : null}
    </div>
  );
}


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
          : 'Result';

  /*
    The clock, or a word — never the phase name twice.

    This printed `event.phase` whenever there was no countdown to show, under a
    label derived from that same phase: a finished event read "FINISHED" above
    "finished", and during the server render — where `remaining` is always null,
    because the ticker has not started — every event read its own phase back
    under its own label.

    `remaining` is null in two quite different situations and only one of them
    is a missing value: a finished event has nothing left to count, and a first
    paint has not measured yet. The first deserves a word, the second deserves
    the em dash rather than a flash of the wrong thing.
  */
  const clock =
    remaining !== null
      ? formatRemaining(remaining)
      : event.phase === 'finished'
        ? 'Closed'
        : event.phase === 'voting'
          ? 'Open'
          : '—';

  return (
    <header className="flex flex-wrap items-end justify-between gap-5">
      <div className="min-w-0">
        <BriefCrumbs
          backHref="/events"
          backLabel="Challenges"
          category={event.category?.name ?? 'Any discipline'}
        >
          <DifficultyPill difficulty={event.difficulty} />
        </BriefCrumbs>

        <BriefTitle>{event.title}</BriefTitle>
      </div>

      <div
        className="flex shrink-0 items-center gap-3.5 rounded-[18px] border-[3px] border-punch bg-punch/12 px-5 py-3"
        style={{ boxShadow: '0 6px 0 var(--color-ink)' }}
      >
        <PanelIcon tone="punch">{PANEL_ICON.clock}</PanelIcon>
        <div>
          <div className="text-[11px] font-black uppercase tracking-[1.6px] text-punch-soft">
            {label}
          </div>
          <div className="mt-0.5 font-display text-2xl font-bold leading-none text-cream">
            {clock}
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
        <PanelIcon tone="sun">{PANEL_ICON.upload}</PanelIcon>
        <span className="font-display text-[23px] font-bold text-cream">
          {alreadyEntered ? 'Entry received' : 'Enter the challenge'}
        </span>
      </div>

      <div className="flex flex-1 flex-col px-5 pb-7 pt-6 sm:px-7">
        {/*
          Your entry, shown back to you.

          Submitting used to change nothing visible: no confirmation, and a
          reload rendered the same empty upload panel, so a successful entry and
          a broken button looked identical. This is the evidence that it worked.
        */}
        {event.myEntry ? (
          <div className="mb-5 flex flex-col gap-2.5">
            <p className="text-[15px] font-extrabold text-mint">
              You are in. Replace it any time before the deadline.
            </p>
            <div className="grid grid-cols-2 gap-3">
              <SubmittedImage label="Your render" url={event.myEntry.imageUrl} tone="sun" />
              {event.myEntry.workspacePhotoUrl ? (
                <SubmittedImage
                  label="Your workspace"
                  url={event.myEntry.workspacePhotoUrl}
                  tone="aqua"
                />
              ) : null}
            </div>
          </div>
        ) : null}

        <p className="mb-6 max-w-[820px] text-[15px] font-extrabold leading-[1.55] text-haze">
          {alreadyEntered ? (
            <>Upload a new pair to replace what is on the ballot.</>
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

        {/* The pair lays itself out now — two squares side by side. */}
        <EntryImageFields value={files} onChange={setFiles} disabled={enter.isPending} />

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
    <Panel>
      <PanelHeader tone="aqua" icon={PANEL_ICON.clock}>
        <PanelTitle>Not open yet</PanelTitle>
      </PanelHeader>
      <div className="flex flex-1 items-center px-5 py-6 sm:px-6.5">
        <p className="text-[15px] font-extrabold leading-[1.55] text-haze">
          Entries open{' '}
          <span className="text-aqua">
            {event.startDate ? new Date(event.startDate).toLocaleString(UI_LOCALE) : 'soon'}
          </span>
          . Come back then to upload your work.
        </p>
      </div>
    </Panel>
  );
}

function WinnerPanel({ event }: { event: EventDetail }) {
  const winner = event.entries.find((entry) => entry.id === event.winnerEntryId);
  const { user } = useSession();

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
            className="aspect-square w-full rounded-[16px] border-[3px] border-ink object-cover"
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

          {/*
            Announcing the result, from where the result is.

            Everything the post needs is already on this page — the winning
            render, who made it and by how many votes — so the composer opens
            with all of it filled in rather than having it retyped and the
            credit risked. The winner's avatar and Instagram handle are looked
            up there, not here, so a public page makes no request for the sake
            of a tool only administrators can open.
          */}
          {user?.role === Role.ADMIN ? (
            <Button asChild variant="outline" size="sm" className="self-start">
              <Link
                href={instagramPostHref({
                  kind: 'winner',
                  title: event.title,
                  difficulty: event.difficulty,
                  username: winner.username,
                  votes: winner.voteCount,
                  imageUrl: winner.imageUrl,
                  // The brief's own picture, for the slide that names the
                  // challenge before the render is revealed.
                  referenceUrl: event.referenceImageUrl ?? event.coverImageUrl,
                })}
              >
                Make the Instagram post
              </Link>
            </Button>
          ) : null}
        </div>
      ) : (
        <EmptyState title="No winner" description="This challenge closed without a result." />
      )}
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
      {/*
        Swiped on a phone, laid out as a grid from `sm` up.

        Every entry is a 1:1 image, so stacking them one per row put a single
        full-width square on screen at a time and made a ten-entry contest an
        enormous scroll — the results read as a list to work through rather than
        a gallery to look at.

        Scroll snapping rather than the translateX carousel used for references:
        this is a phone, and a track driven by arrow buttons cannot be swiped.
        Native overflow scrolling gets the gesture, the momentum and the
        keyboard for free, and degrades to an ordinary scroller if snapping is
        unsupported.

        The cards stop short of full width on purpose. The next one peeking past
        the edge is what says there is more to the right; a card that filled the
        viewport would look like the only one.
      */}
      <div
        className="flex snap-x snap-mandatory gap-4 overflow-x-auto pb-2 sm:grid sm:grid-cols-2 sm:overflow-x-visible sm:pb-0 lg:grid-cols-3"
        // A scroller is only reachable by keyboard if something can hold focus,
        // and the cards themselves are not interactive.
        tabIndex={0}
        role="group"
        aria-label={`${others.length} other entries`}
      >
        {others.map((entry) => (
          <div
            key={entry.id}
            // The mobile width has to be undone explicitly at `sm`, or the card
            // stays at 78% of its grid column instead of filling it.
            className="flex w-[78%] shrink-0 snap-center flex-col gap-2 rounded-[16px] border-[3px] border-ink bg-white/4 p-2 sm:w-full sm:shrink"
            style={{ boxShadow: '0 5px 0 var(--color-ink)' }}
          >
            {/* eslint-disable-next-line @next/next/no-img-element -- Cloudinary asset */}
            <img
              src={entry.imageUrl}
              alt={`Entry by ${entry.username}`}
              className="aspect-square w-full rounded-[12px] border-2 border-ink object-cover"
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

/** One image from the entry already on the ballot. */
function SubmittedImage({
  label,
  url,
  tone,
}: {
  label: string;
  url: string;
  tone: 'sun' | 'aqua';
}) {
  return (
    <figure className="flex min-w-0 flex-col gap-1.5">
      <figcaption
        className={`text-[11px] font-black uppercase tracking-[1.2px] ${
          tone === 'sun' ? 'text-sun' : 'text-aqua'
        }`}
      >
        {label}
      </figcaption>
      {/* eslint-disable-next-line @next/next/no-img-element -- Cloudinary asset */}
      <img
        src={url}
        alt={label}
        className="aspect-square w-full rounded-[14px] border-[2.5px] border-ink object-cover"
        style={{ boxShadow: '0 4px 0 var(--color-ink)' }}
      />
    </figure>
  );
}
