'use client';

import { SUBMISSION_IMAGE_SIZE } from '@bb/shared';
import Link from 'next/link';
import { useEffect, useRef, useState } from 'react';

import { ChunkyButton } from '@/components/arcade/chunky';
import {
  EntryImageFields,
  type EntryImages,
} from '@/components/submissions/entry-image-fields';
import { UI_LOCALE } from '@/lib/utils';
import { FireIcon } from '@/components/ui/icons';
import { EmptyState, Panel, PanelBody, PanelHeader, PanelTitle, Skeleton } from '@/components/ui/panel';
import { VoteScreen } from '@/components/challenges/vote-screen';
import { useEnterEvent, useEvent, type EventDetail } from '@/features/challenges/use-events';

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

  return (
    <div className="flex flex-col gap-6">
      <EventHeader event={event} />

      {event.phase === 'upcoming' ? <Upcoming event={event} /> : null}
      {event.phase === 'open' ? <OpenPhase event={event} /> : null}
      {event.phase === 'voting' ? <VotingPhase event={event} /> : null}
      {event.phase === 'finished' ? <FinishedPhase event={event} /> : null}
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
    <header className="flex flex-wrap items-start justify-between gap-4">
      <div>
        <div className="flex flex-wrap items-center gap-3">
          <Link href="/events" className="eyebrow hover:text-select">
            ← Challenges
          </Link>
          <span className="eyebrow">{event.category?.name ?? 'Any discipline'}</span>
        </div>
        <h1 className="mt-2 font-display text-2xl font-bold uppercase tracking-tight text-bone">
          {event.title}
        </h1>
      </div>

      <div className="text-right">
        <p className="eyebrow">{label}</p>
        <p className="font-mono text-2xl font-bold text-sun tabular-nums">
          {remaining !== null ? formatRemaining(remaining) : event.phase}
        </p>
      </div>
    </header>
  );
}

function Brief({ event }: { event: EventDetail }) {
  return (
    <Panel>
      <PanelHeader>
        <PanelTitle>The brief</PanelTitle>
      </PanelHeader>
      <PanelBody className="flex flex-col gap-3">
        <p className="font-display text-lg font-bold text-bone">{event.title}</p>
        <Link
          href={`/challenges/${event.slug}`}
          className="text-sm font-extrabold text-aqua hover:text-mint"
        >
          Read the full brief →
        </Link>
      </PanelBody>
    </Panel>
  );
}

function Upcoming({ event }: { event: EventDetail }) {
  return (
    <div className="grid gap-6 lg:grid-cols-2">
      <Brief event={event} />
      <Panel>
        <PanelHeader>
          <PanelTitle>Not open yet</PanelTitle>
        </PanelHeader>
        <PanelBody>
          <p className="text-sm font-extrabold text-bone-muted">
            Entries open{' '}
            {event.startDate ? new Date(event.startDate).toLocaleString(UI_LOCALE) : 'soon'}. Come back then
            to upload your work.
          </p>
        </PanelBody>
      </Panel>
    </div>
  );
}

/** Open window: the brief plus the upload form. */
function OpenPhase({ event }: { event: EventDetail }) {
  const enter = useEnterEvent(event.id);
  const [files, setFiles] = useState<EntryImages>({ image: null, workspace: null });
  const alreadyEntered = Boolean(event.myEntryId);
  const canSubmit = Boolean(files.image && files.workspace) && !enter.isPending;

  return (
    <div className="grid gap-6 lg:grid-cols-2">
      <Brief event={event} />

      <Panel active={!alreadyEntered}>
        <PanelHeader>
          <PanelTitle>{alreadyEntered ? 'Entry received' : 'Enter the challenge'}</PanelTitle>
        </PanelHeader>
        <PanelBody className="flex flex-col gap-4">
          {alreadyEntered ? (
            <p className="text-sm font-extrabold text-mint">
              You are in. You can replace your entry until the deadline.
            </p>
          ) : (
            <p className="text-sm font-extrabold text-bone-muted">
              Upload both images before the deadline — each must be exactly{' '}
              {SUBMISSION_IMAGE_SIZE}×{SUBMISSION_IMAGE_SIZE}px. Everyone&apos;s work stays hidden
              until entries close.
            </p>
          )}

          <EntryImageFields value={files} onChange={setFiles} disabled={enter.isPending} />

          <ChunkyButton
            size="md"
            onClick={() =>
              files.image && files.workspace &&
              enter.mutate({ image: files.image, workspace: files.workspace })
            }
            disabled={!canSubmit}
          >
            {enter.isPending ? 'Uploading…' : alreadyEntered ? 'Replace entry' : 'Submit entry'}
          </ChunkyButton>
        </PanelBody>
      </Panel>
    </div>
  );
}

/**
 * Voting: the wheel-and-reference vote screen, ported from the design canvas.
 *
 * The upload form is simply not rendered in this phase — once the deadline has
 * passed there is nothing to upload, and the server refuses a late entry anyway.
 */
function VotingPhase({ event }: { event: EventDetail }) {
  return <VoteScreen event={event} />;
}

function FinishedPhase({ event }: { event: EventDetail }) {
  const winner = event.entries.find((entry) => entry.id === event.winnerEntryId);
  // Entries arrive in submission order now; rank the also-rans by votes here, on
  // the finished screen, where a live-updating order can no longer bias anyone.
  const others = event.entries
    .filter((entry) => entry.id !== event.winnerEntryId)
    .sort((a, b) => b.voteCount - a.voteCount);

  return (
    <div className="flex flex-col gap-6">
      {winner ? (
        <Panel active>
          <PanelHeader>
            <PanelTitle>Winner</PanelTitle>
          </PanelHeader>
          <PanelBody className="flex flex-col gap-3">
            {/* eslint-disable-next-line @next/next/no-img-element -- Cloudinary asset */}
            <img
              src={winner.imageUrl}
              alt={`Winning entry by ${winner.username}`}
              className="w-full rounded-[16px] border-4 border-sun object-cover"
            />
            <div className="flex items-center justify-between">
              <span className="font-display text-lg font-bold text-bone">{winner.username}</span>
              <span className="flex items-center gap-2 font-display text-base font-bold text-sun">
                <FireIcon size={22} /> {winner.voteCount} votes
              </span>
            </div>
          </PanelBody>
        </Panel>
      ) : (
        <Panel>
          <EmptyState title="No winner" description="This challenge closed without a result." />
        </Panel>
      )}

      {others.length > 0 ? (
        <section className="flex flex-col gap-4">
          <h2 className="font-display text-lg font-bold text-bone">Other entries</h2>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {others.map((entry) => (
              <div
                key={entry.id}
                className="flex flex-col gap-2 rounded-[16px] border-4 border-edge bg-panel-raised p-2"
              >
                {/* eslint-disable-next-line @next/next/no-img-element -- Cloudinary asset */}
                <img
                  src={entry.imageUrl}
                  alt={`Entry by ${entry.username}`}
                  className="w-full rounded-[12px] border-2 border-edge object-cover"
                />
                <div className="flex items-center justify-between px-1 text-sm font-extrabold">
                  <span className="text-bone">{entry.username}</span>
                  <span className="text-bone-faint">{entry.voteCount}</span>
                </div>
              </div>
            ))}
          </div>
        </section>
      ) : null}
    </div>
  );
}

