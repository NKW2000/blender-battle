'use client';

import { ChallengeAssetType, SUBMISSION_IMAGE_SIZE } from '@bb/shared';
import Link from 'next/link';
import { useEffect, useRef, useState } from 'react';

import { ChunkyButton } from '@/components/arcade/chunky';
import {
  EntryImageFields,
  type EntryImages,
} from '@/components/submissions/entry-image-fields';
import { UI_LOCALE } from '@/lib/utils';
import { DifficultyBadge } from '@/components/challenges/challenge-card';
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

      {/*
        Below the action, and in every phase.

        What you do here changes with the phase — enter, vote, read the result —
        but what the challenge asks for does not, and it is worth reading in all
        four. It sits under the action rather than above it because someone
        arriving mid-window is here to enter, not to re-read the rules.
      */}
      <Brief event={event} />
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
          <DifficultyBadge difficulty={event.difficulty} />
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

/**
 * The whole brief, on the page you are already on.
 *
 * This was a title and a link reading "read the full brief", which sent someone
 * off the page they had just opened to find out what the challenge actually
 * asked for, then back again to enter it. The competition and its brief are the
 * same subject; there is no reason for them to be two documents.
 *
 * `/challenges/[slug]` still exists and still holds this content — it is the
 * catalogue entry, it is what the challenge cards link to, and it carries its
 * own `<head>`. What is gone is the detour from here to there.
 */
function Brief({ event }: { event: EventDetail }) {
  const images = event.assets.filter((asset) => asset.type === ChallengeAssetType.REFERENCE_IMAGE);
  const files = event.assets.filter((asset) => asset.type === ChallengeAssetType.REFERENCE_FILE);

  return (
    <section className="grid gap-6 lg:grid-cols-[1.6fr_1fr]">
      <div className="flex flex-col gap-6">
        <Panel>
          <PanelHeader>
            <PanelTitle>The brief</PanelTitle>
          </PanelHeader>
          <PanelBody className="flex flex-col gap-4">
            <dl className="flex flex-wrap gap-x-6 gap-y-2 font-mono text-xs text-bone-faint">
              <div className="flex gap-2">
                <dt>Time</dt>
                <dd className="text-bone">{event.estimatedMinutes} min</dd>
              </div>
              <div className="flex gap-2">
                <dt>Reward</dt>
                <dd className="text-sun">{event.rewardXp} XP</dd>
              </div>
              {event.blenderVersion ? (
                <div className="flex gap-2">
                  <dt>Blender</dt>
                  <dd className="text-bone">{event.blenderVersion}</dd>
                </div>
              ) : null}
            </dl>

            {/* `whitespace-pre-line`: managers write these with paragraph breaks,
                and collapsing them turns a brief into a wall. */}
            <p className="whitespace-pre-line text-sm leading-relaxed text-bone-muted">
              {event.description}
            </p>
          </PanelBody>
        </Panel>

        {images.length > 0 ? (
          <Panel>
            <PanelHeader>
              <PanelTitle>Reference</PanelTitle>
            </PanelHeader>
            <PanelBody className="grid gap-3 sm:grid-cols-2">
              {images.map((asset) => (
                // eslint-disable-next-line @next/next/no-img-element -- Cloudinary-sized asset
                <img
                  key={asset.id}
                  src={asset.url}
                  alt={asset.filename}
                  className="w-full rounded-[12px] border-2 border-edge object-cover"
                />
              ))}
            </PanelBody>
          </Panel>
        ) : null}
      </div>

      <aside className="flex flex-col gap-6">
        {event.objectives.length > 0 ? (
          <Panel>
            <PanelHeader>
              <PanelTitle>Judged on</PanelTitle>
            </PanelHeader>
            <PanelBody>
              <ul className="flex flex-col gap-2">
                {event.objectives.map((objective) => (
                  <li key={objective} className="flex gap-3 text-sm font-extrabold text-bone">
                    <span
                      className="mt-[0.45rem] h-1.5 w-1.5 shrink-0 rounded-full bg-sun"
                      aria-hidden="true"
                    />
                    {objective}
                  </li>
                ))}
              </ul>
            </PanelBody>
          </Panel>
        ) : null}

        {event.rules || event.allowedAssets || event.forbiddenAssets ? (
          <Panel>
            <PanelHeader>
              <PanelTitle>Rules</PanelTitle>
            </PanelHeader>
            <PanelBody className="flex flex-col gap-4 text-sm">
              {event.rules ? (
                <p className="whitespace-pre-line text-bone-muted">{event.rules}</p>
              ) : null}
              {event.allowedAssets ? (
                <div>
                  <p className="eyebrow">Allowed</p>
                  <p className="mt-1 text-bone-muted">{event.allowedAssets}</p>
                </div>
              ) : null}
              {event.forbiddenAssets ? (
                <div>
                  <p className="eyebrow">Not allowed</p>
                  <p className="mt-1 text-bone-muted">{event.forbiddenAssets}</p>
                </div>
              ) : null}
            </PanelBody>
          </Panel>
        ) : null}

        {files.length > 0 ? (
          <Panel>
            <PanelHeader>
              <PanelTitle>Files</PanelTitle>
            </PanelHeader>
            <PanelBody className="flex flex-col gap-2">
              {files.map((asset) => (
                <a
                  key={asset.id}
                  href={asset.url}
                  download
                  rel="noopener noreferrer nofollow"
                  className="flex items-center justify-between gap-3 rounded-xl border-2 border-edge px-3 py-2 font-mono text-xs text-bone-muted hover:border-sun hover:text-sun"
                >
                  <span className="truncate">{asset.filename}</span>
                  <span className="shrink-0">{Math.round(asset.bytes / 1024)} KB</span>
                </a>
              ))}
            </PanelBody>
          </Panel>
        ) : null}

        {event.tags.length > 0 ? (
          <div className="flex flex-wrap gap-2">
            {event.tags.map((tag) => (
              <Link
                key={tag.id}
                href={`/challenges?tag=${tag.slug}`}
                className="rounded-lg border-2 border-edge px-2 py-1 font-mono text-xs text-bone-faint hover:border-sun hover:text-sun"
              >
                {tag.name}
              </Link>
            ))}
          </div>
        ) : null}
      </aside>
    </section>
  );
}

function Upcoming({ event }: { event: EventDetail }) {
  return (
    // One panel, not the old two-column split — the brief that used to fill the
    // other column is now the section below, in every phase.
    <div>
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
    <div>
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

