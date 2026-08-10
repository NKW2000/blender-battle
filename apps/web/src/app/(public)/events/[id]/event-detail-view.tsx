'use client';

import { ChallengeAssetType, SUBMISSION_IMAGE_SIZE } from '@bb/shared';
import Link from 'next/link';
import { useEffect, useRef, useState } from 'react';

import { ChunkyButton } from '@/components/arcade/chunky';
import {
  BriefCrumbs,
  BriefPanel,
  BriefTitle,
  Card,
  CardHead,
  DifficultyPill,
  Extras,
  ICON,
  JudgedOnPanel,
  PanelIcon,
  ReferencePanel,
} from '@/components/challenges/brief-parts';
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
          : 'Finished';

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
