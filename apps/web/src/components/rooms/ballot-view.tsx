'use client';

import { RoomStatus } from '@bb/shared';
import { useEffect, useRef, useState } from 'react';

import { ChunkyButton } from '@/components/arcade/chunky';
import { FireIcon } from '@/components/ui/icons';
import { EmptyState, Panel, PanelBody, PanelHeader, PanelTitle } from '@/components/ui/panel';
import { useSound } from '@/features/sound/use-sound';
import { useBallot, useLikeEntry, type RoomDetail } from '@/features/rooms/use-rooms';

/**
 * The blind ballot.
 *
 * "Blind" is used here and deliberately not on the public-challenge vote
 * screen. Both hide the author, so both are *anonymous*; only this one also
 * shuffles the order per voter and gives each entry a fixed ten seconds, so
 * nobody can linger on a rival's work, compare freely, or be advantaged by
 * appearing first. One word for both made two different promises sound
 * identical.
 *
 * Two shapes, one component, because they are the same act with different rules:
 *
 *  - main round: one entry at a time beside the reference, ten seconds each,
 *    advancing on its own. Like as many as deserve it.
 *  - runoff: the tied entries together, one movable pick. Unlimited likes cannot
 *    separate entries that already tied on unlimited likes.
 *
 * The countdown here is cosmetic. The server holds the real per-entry window and
 * rejects a like outside it, so a paused or scripted client gains nothing.
 */
export function BallotView({ room, canVote }: { room: RoomDetail; canVote: boolean }) {
  const isRunoff = room.status === RoomStatus.RUNOFF;
  const ballot = useBallot(room.id, canVote);
  const [started, setStarted] = useState(false);

  if (!canVote) {
    return (
      <Panel>
        <EmptyState
          title="Voting is underway"
          description="Only players who submitted an entry can vote. Results appear here when it closes."
        />
      </Panel>
    );
  }

  // Opening the ballot starts the clock server-side, so it is behind a
  // deliberate action rather than firing on page load.
  if (!started) {
    return (
      <Panel active>
        <PanelHeader>
          <PanelTitle>{isRunoff ? 'Tie-break' : 'Judging'}</PanelTitle>
        </PanelHeader>
        <PanelBody className="flex flex-col items-center gap-4 py-8 text-center">
          <p className="max-w-md text-sm font-extrabold text-bone-muted">
            {isRunoff
              ? 'It ended level at the top. The tied entries are shown together — pick the one you think won. You can move your pick until voting closes.'
              : "A blind ballot: each entry appears beside the reference for ten seconds, in an order picked just for you, with no name attached. Like the ones that earn it. Your own work is not in the deck."}
          </p>
          <ChunkyButton size="md" sheen onClick={() => setStarted(true)}>
            {isRunoff ? 'OPEN TIE-BREAK' : "I'M READY TO VOTE"}
          </ChunkyButton>
        </PanelBody>
      </Panel>
    );
  }

  if (ballot.isLoading) {
    return (
      <Panel>
        <PanelBody>
          <p className="text-sm font-extrabold text-bone-muted">Dealing the ballot…</p>
        </PanelBody>
      </Panel>
    );
  }

  if (ballot.error || !ballot.data) {
    return (
      <Panel>
        <EmptyState
          title="Cannot vote right now"
          description={ballot.error?.message ?? 'The ballot could not be loaded.'}
        />
      </Panel>
    );
  }

  return isRunoff ? (
    <RunoffGrid room={room} ballot={ballot.data} />
  ) : (
    <SequentialBallot room={room} ballot={ballot.data} />
  );
}

function SequentialBallot({
  room,
  ballot,
}: {
  room: RoomDetail;
  ballot: NonNullable<ReturnType<typeof useBallot>['data']>;
}) {
  const like = useLikeEntry(room.id);
  const play = useSound();
  const [index, setIndex] = useState(0);
  const [liked, setLiked] = useState<Set<string>>(
    () => new Set(ballot.entries.filter((entry) => entry.liked).map((entry) => entry.submissionId)),
  );
  const [remaining, setRemaining] = useState(ballot.secondsPerEntry);

  // Clock skew: the ballot's absolute timestamps are the server's, so the local
  // clock is corrected against `serverNow` rather than trusted.
  const offsetRef = useRef(Date.parse(ballot.serverNow) - Date.now());
  // Undefined once the index runs past the deck, which is also the "finished"
  // signal — checked directly so the narrowing holds for the rest of the render.
  const entry = ballot.entries[index];

  useEffect(() => {
    if (!entry) return;

    const tick = () => {
      const now = Date.now() + offsetRef.current;
      const left = (Date.parse(entry.closesAt) - now) / 1000;
      setRemaining(Math.max(0, left));
      // Advancing on its own is the point — every entry gets the same attention
      // whether or not the voter acts.
      if (left <= 0) setIndex((value) => value + 1);
    };

    tick();
    const timer = setInterval(tick, 200);
    return () => clearInterval(timer);
  }, [entry]);

  if (!entry) {
    return (
      <Panel active>
        <PanelHeader>
          <PanelTitle>Ballot complete</PanelTitle>
        </PanelHeader>
        <PanelBody className="flex flex-col items-center gap-2 py-8 text-center">
          <p className="font-display text-xl font-bold text-mint">
            {liked.size} {liked.size === 1 ? 'like' : 'likes'} cast
          </p>
          <p className="text-sm font-extrabold text-bone-faint">
            Results appear when everyone has voted or the window closes.
          </p>
        </PanelBody>
      </Panel>
    );
  }

  const isLiked = liked.has(entry.submissionId);

  const toggle = () => {
    const next = !isLiked;
    // Optimistic: the server is the record, but a vote button that waits on a
    // round trip inside a ten-second window feels broken.
    setLiked((previous) => {
      const copy = new Set(previous);
      if (next) copy.add(entry.submissionId);
      else copy.delete(entry.submissionId);
      return copy;
    });
    play(next ? 'vote' : 'press');
    like.mutate({ submissionId: entry.submissionId, liked: next });
  };

  const pct = Math.max(0, Math.min(100, (remaining / ballot.secondsPerEntry) * 100));

  return (
    <Panel active>
      <PanelHeader>
        <PanelTitle>
          Entry {index + 1} of {ballot.entries.length}
        </PanelTitle>
      </PanelHeader>
      <PanelBody className="flex flex-col gap-4">
        {/* Per-entry timer. Cosmetic — the server enforces the real window. */}
        <div className="h-2 w-full overflow-hidden rounded-full border-2 border-edge bg-panel">
          <div
            className="h-full rounded-full"
            style={{
              width: `${pct}%`,
              background: 'linear-gradient(90deg,#FFD23F,#FFE580)',
              transition: 'width .2s linear',
            }}
          />
        </div>

        <div className="grid gap-4 md:grid-cols-2">
          <figure className="flex flex-col gap-2">
            <figcaption className="eyebrow text-aqua">Reference</figcaption>
            {ballot.referenceImageUrl ? (
              // eslint-disable-next-line @next/next/no-img-element -- Cloudinary asset
              <img
                src={ballot.referenceImageUrl}
                alt="The challenge reference"
                className="w-full rounded-[16px] border-4 border-edge object-cover"
              />
            ) : (
              <div className="flex h-56 items-center justify-center rounded-[16px] border-4 border-dashed border-white/20 text-sm font-extrabold text-bone-faint">
                No reference image on this challenge
              </div>
            )}
          </figure>

          <figure className="flex flex-col gap-2">
            <figcaption className="eyebrow text-sun">The entry</figcaption>
            {/* eslint-disable-next-line @next/next/no-img-element -- Cloudinary asset */}
            <img
              key={entry.submissionId}
              src={entry.imageUrl}
              alt={`Entry ${index + 1}`}
              className="w-full rounded-[16px] border-4 border-edge object-cover"
              style={{ animation: 'bbPop .3s cubic-bezier(.2,1.3,.35,1) both' }}
            />
          </figure>
        </div>

        <div className="flex flex-wrap items-center justify-between gap-4">
          <span className="font-mono text-lg font-bold text-sun tabular-nums">
            {Math.ceil(remaining)}s
          </span>

          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={toggle}
              aria-pressed={isLiked}
              className={`arcade-focus arcade-press flex items-center gap-2 rounded-[16px] border-4 border-edge px-6 py-3 font-display text-lg font-bold [--press-depth:5px] ${
                isLiked ? 'bg-sun text-edge' : 'bg-panel-raised text-bone'
              }`}
              style={{ boxShadow: '0 5px 0 var(--color-edge)' }}
            >
              <FireIcon size={24} animate={isLiked} />
              {isLiked ? 'Liked' : 'Like'}
            </button>

            <button
              type="button"
              onClick={() => setIndex((value) => value + 1)}
              className="rounded-[14px] border-[3px] border-white/24 bg-white/8 px-5 py-3 font-display text-[15px] font-semibold text-cream hover:bg-white/16"
            >
              Skip →
            </button>
          </div>
        </div>
      </PanelBody>
    </Panel>
  );
}

/** Tie-break: everything tied at the top, one movable pick. */
function RunoffGrid({
  room,
  ballot,
}: {
  room: RoomDetail;
  ballot: NonNullable<ReturnType<typeof useBallot>['data']>;
}) {
  const like = useLikeEntry(room.id);
  const play = useSound();
  const [picked, setPicked] = useState<string | null>(
    ballot.entries.find((entry) => entry.liked)?.submissionId ?? null,
  );

  const choose = (submissionId: string) => {
    setPicked(submissionId);
    play('vote');
    like.mutate({ submissionId, liked: true });
  };

  return (
    <Panel active>
      <PanelHeader>
        <PanelTitle>Tie-break — pick the winner</PanelTitle>
      </PanelHeader>
      <PanelBody className="flex flex-col gap-4">
        {ballot.referenceImageUrl ? (
          <figure className="flex flex-col gap-2">
            <figcaption className="eyebrow text-aqua">Reference</figcaption>
            {/* eslint-disable-next-line @next/next/no-img-element -- Cloudinary asset */}
            <img
              src={ballot.referenceImageUrl}
              alt="The challenge reference"
              className="max-h-64 w-full rounded-[16px] border-4 border-edge object-contain"
            />
          </figure>
        ) : null}

        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {ballot.entries.map((entry) => {
            const isPicked = picked === entry.submissionId;
            return (
              <button
                key={entry.submissionId}
                type="button"
                onClick={() => choose(entry.submissionId)}
                aria-pressed={isPicked}
                className={`arcade-press flex flex-col gap-2 rounded-[18px] border-4 p-2 [--press-depth:4px] ${
                  isPicked ? 'border-sun bg-sun/15' : 'border-edge bg-panel-raised'
                }`}
                style={{ boxShadow: '0 5px 0 var(--color-edge)' }}
              >
                {/* eslint-disable-next-line @next/next/no-img-element -- Cloudinary asset */}
                <img
                  src={entry.imageUrl}
                  alt="Tied entry"
                  className="w-full rounded-[12px] border-2 border-edge object-cover"
                />
                <span
                  className={`flex items-center justify-center gap-2 py-1 font-display text-sm font-bold ${
                    isPicked ? 'text-sun' : 'text-bone-faint'
                  }`}
                >
                  <FireIcon size={18} animate={isPicked} />
                  {isPicked ? 'Your pick' : 'Pick this'}
                </span>
              </button>
            );
          })}
        </div>

        <p className="text-xs font-bold text-bone-faint">
          One pick each. Choosing another moves it — nothing is final until voting closes.
        </p>
      </PanelBody>
    </Panel>
  );
}
