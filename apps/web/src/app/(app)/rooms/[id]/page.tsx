'use client';

import {
  CHALLENGE_MIN_MINUTES,
  ChallengeAssetType,
  ROOM_DRAW_SECONDS,
  ROOM_MIN_PLAYERS,
  RoomParticipantStatus,
  RoomStatus,
} from '@bb/shared';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { use, useEffect, useRef, useState } from 'react';

import { ChunkyButton } from '@/components/arcade/chunky';
import {
  EntryImageFields,
  type EntryImages,
} from '@/components/submissions/entry-image-fields';
import { UI_LOCALE } from '@/lib/utils';
import { BallotView } from '@/components/rooms/ballot-view';
import { CountdownGate } from '@/components/rooms/countdown-gate';
import {
  EmptyState,
  PANEL_ICON,
  Panel,
  PanelBody,
  PanelHeader,
  PanelTitle,
  Skeleton,
} from '@/components/ui/panel';
import {
  BriefPanel,
  Extras,
  JudgedOnPanel,
  ReferencePanel,
} from '@/components/challenges/brief-parts';
import { useSession } from '@/features/auth/use-session';
import { useSound } from '@/features/sound/use-sound';
import {
  useLeaveRoom,
  useRoom,
  useStartRoom,
  useSubmitEntry,
  type RoomDetail,
} from '@/features/rooms/use-rooms';

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
    const timer = setInterval(tick, 500);
    return () => clearInterval(timer);
  }, [deadline]);

  return remaining;
}

function formatClock(seconds: number | null): string {
  if (seconds === null) return '--:--';
  const total = Math.ceil(seconds);
  return `${String(Math.floor(total / 60)).padStart(2, '0')}:${String(total % 60).padStart(2, '0')}`;
}

export default function RoomPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const { user } = useSession();
  const { data: room, isLoading, error } = useRoom(id);

  if (isLoading) return <Skeleton className="h-64 w-full" />;

  if (!room) {
    return (
      <Panel>
        <EmptyState
          title="Room not found"
          description={error?.message ?? 'This room may have been closed.'}
          action={
            <Link href="/rooms" className="mt-2 text-sm font-extrabold text-aqua">
              Back to rooms
            </Link>
          }
        />
      </Panel>
    );
  }

  const me = room.participants.find((entry) => entry.userId === user?.id);

  return (
    <div className="flex flex-col gap-6">
      <RoomHeader room={room} />

      {room.status === RoomStatus.LOBBY ? <Lobby room={room} /> : null}
      {room.status === RoomStatus.DRAWING ? <Drawing room={room} /> : null}
      {room.status === RoomStatus.ACTIVE ? (
        <ActivePhase room={room} submitted={me?.status === RoomParticipantStatus.SUBMITTED} />
      ) : null}
      {room.status === RoomStatus.VOTING || room.status === RoomStatus.RUNOFF ? (
        <BallotView room={room} canVote={me?.status === RoomParticipantStatus.SUBMITTED} />
      ) : null}
      {room.status === RoomStatus.COMPLETED ? <Results room={room} /> : null}
      {room.status === RoomStatus.CANCELLED ? (
        <Panel>
          <EmptyState
            title="Room cancelled"
            description="Nobody submitted before the deadline, so there was nothing to judge. No results were recorded."
          />
        </Panel>
      ) : null}

      <Roster room={room} />
    </div>
  );
}

function RoomHeader({ room }: { room: RoomDetail }) {
  const remaining = useDeadline(
    room.status === RoomStatus.ACTIVE
      ? room.endsAt
      : room.status === RoomStatus.VOTING || room.status === RoomStatus.RUNOFF
        ? room.votingEndsAt
        : null,
    room.serverNow,
  );

  const label =
    room.status === RoomStatus.ACTIVE
      ? 'Time left'
      : room.status === RoomStatus.VOTING
        ? 'Voting ends'
        : room.status === RoomStatus.RUNOFF
          ? 'Runoff ends'
          : 'Status';

  return (
    <header className="flex flex-wrap items-start justify-between gap-4">
      <div>
        <div className="flex flex-wrap items-center gap-3">
          <Link href="/rooms" className="eyebrow hover:text-select">
            ← Rooms
          </Link>
          <span className="eyebrow">{room.category?.name ?? 'Any discipline'}</span>
        </div>
        <h1 className="mt-2 font-display text-2xl font-bold uppercase tracking-tight text-bone">
          {room.challenge?.title ?? room.name}
        </h1>
      </div>

      <div className="text-right">
        <p className="eyebrow">{label}</p>
        <p className="font-mono text-2xl font-bold text-sun tabular-nums">
          {remaining === null ? room.status : formatClock(remaining)}
        </p>
      </div>
    </header>
  );
}

function Lobby({ room }: { room: RoomDetail }) {
  const start = useStartRoom();
  const seated = room.participants.length;

  /*
    The same check the server runs at kickoff, mirrored here.

    The deadline is fixed but a lobby can sit open indefinitely, so a room can
    quietly age past the point where there is any modelling time left in it.
    Without this the host only found out by pressing Start and being refused,
    with nothing on screen having warned them it was coming.

    Measured against `serverNow` rather than the browser clock — the deadline is
    the server's to enforce, and a skewed local clock would put this and the
    server's answer on different sides of the line.
  */
  const msAtKickoff = room.endsAt
    ? new Date(room.endsAt).getTime() -
      new Date(room.serverNow).getTime() -
      ROOM_DRAW_SECONDS * 1000
    : null;
  const outOfTime = msAtKickoff !== null && msAtKickoff < CHALLENGE_MIN_MINUTES * 60_000;

  const canStart = room.isHost && seated >= ROOM_MIN_PLAYERS && !outOfTime;

  return (
    <Panel>
      <PanelHeader>
        <PanelTitle>Waiting to start</PanelTitle>
      </PanelHeader>
      <PanelBody className="flex flex-col gap-5">
        <p className="text-sm font-extrabold text-bone-muted">
          The brief is drawn when the host starts — it does not exist yet, so nobody can prepare
          for it in advance.
        </p>

        {room.joinCode ? (
          <div className="flex flex-wrap items-center gap-3">
            <span className="eyebrow text-aqua">Invite code</span>
            <code
              className="rounded-xl border-[3px] border-edge bg-panel px-4 py-2 font-mono text-xl font-bold tracking-[0.3em] text-sun"
              style={{ boxShadow: '0 4px 0 var(--color-edge)' }}
            >
              {room.joinCode}
            </code>
            <button
              type="button"
              onClick={() => navigator.clipboard?.writeText(room.joinCode ?? '')}
              className="text-sm font-extrabold text-aqua hover:text-mint"
            >
              Copy
            </button>
          </div>
        ) : null}

        {room.endsAt ? (
          <p
            className={`text-sm font-extrabold ${outOfTime ? 'text-punch-soft' : 'text-bone-muted'}`}
          >
            <span className={outOfTime ? 'text-punch' : 'text-aqua'}>Ends</span>{' '}
            {new Date(room.endsAt).toLocaleString(UI_LOCALE)} — each player sees this in their own
            timezone.
          </p>
        ) : null}

        {room.isHost ? (
          <div className="flex flex-wrap items-center gap-4">
            <ChunkyButton
              size="md"
              sheen
              onClick={() => start.mutate(room.id)}
              disabled={!canStart || start.isPending}
            >
              {start.isPending ? 'Starting…' : '⚔ START'}
            </ChunkyButton>
            {/*
              Says which rule is blocking, rather than always blaming the player
              count — a room that has run out of time reads as "needs 2 players"
              even with eight people sitting in it.
            */}
            {outOfTime ? (
              <span className="text-sm font-extrabold text-punch-soft">
                Out of time — this room&apos;s end time has nearly arrived. Open a new room with a
                later deadline.
              </span>
            ) : !canStart ? (
              <span className="text-sm font-extrabold text-bone-faint">
                Needs at least {ROOM_MIN_PLAYERS} players — {seated} so far
              </span>
            ) : null}
          </div>
        ) : (
          <p className="text-sm font-extrabold text-bone-faint">
            Waiting for {room.hostUsername} to start.
          </p>
        )}

        <LeaveControl room={room} seated={seated} />
      </PanelBody>
    </Panel>
  );
}

/**
 * Leaving is a lobby-only action: once the clock is running the API refuses it,
 * because not submitting is already how you drop out and the room still has to
 * account for you.
 *
 * The host gets a confirmation step, since the consequence is not the same one
 * the button implies — the server either hands the room to the longest-standing
 * remaining player, or cancels it outright when the host was the last one in.
 */
function LeaveControl({ room, seated }: { room: RoomDetail; seated: number }) {
  const router = useRouter();
  const leave = useLeaveRoom();
  const [confirming, setConfirming] = useState(false);

  const heir = room.participants.find((entry) => entry.userId !== room.hostId);
  const consequence =
    !room.isHost
      ? null
      : heir
        ? `${heir.username} becomes the host.`
        : 'You are the only player, so the room is cancelled.';

  const go = () => leave.mutate(room.id, { onSuccess: () => router.replace('/rooms') });

  return (
    <div className="flex flex-col gap-2 border-t-2 border-edge pt-4">
      {confirming && consequence ? (
        <div className="flex flex-wrap items-center gap-3">
          <span className="text-sm font-extrabold text-bone-muted">{consequence}</span>
          <button
            type="button"
            onClick={go}
            disabled={leave.isPending}
            className="text-sm font-extrabold text-punch-soft hover:text-punch"
          >
            {leave.isPending ? 'Leaving…' : 'Leave anyway'}
          </button>
          <button
            type="button"
            onClick={() => setConfirming(false)}
            disabled={leave.isPending}
            className="text-sm font-extrabold text-bone-faint hover:text-bone"
          >
            Stay
          </button>
        </div>
      ) : (
        <button
          type="button"
          onClick={() => (room.isHost ? setConfirming(true) : go())}
          disabled={leave.isPending}
          className="self-start text-sm font-extrabold text-bone-faint hover:text-punch-soft"
        >
          {leave.isPending ? 'Leaving…' : 'Leave room'}
        </button>
      )}

      {seated >= room.maxPlayers ? (
        <span className="text-xs font-extrabold text-bone-faint">
          Room is full — leaving frees your seat for someone else.
        </span>
      ) : null}
    </div>
  );
}

function Drawing({ room }: { room: RoomDetail }) {
  const remaining = useDeadline(room.startsAt, room.serverNow);
  return <CountdownGate seconds={remaining ?? 0} />;
}

/**
 * Modelling window: the brief, the clock, and the upload.
 *
 * Three things were wrong here and they compounded. The brief was a title and a
 * link, which sent a competitor off a timed screen to read the rules of the
 * thing they were being timed on. The upload had no error branch, so a failed
 * submit put the button back to "Submit entry" and said nothing — which is what
 * "the submit button does not work" looks like from the outside. And an entry
 * you had already made was invisible, so replacing it was a guess.
 */
function ActivePhase({ room, submitted }: { room: RoomDetail; submitted: boolean }) {
  const submit = useSubmitEntry(room.id);
  const [files, setFiles] = useState<EntryImages>({ image: null, workspace: null });
  const ready = Boolean(files.image && files.workspace);
  const references = (room.challenge?.assets ?? []).filter(
    (asset) => asset.type === ChallengeAssetType.REFERENCE_IMAGE,
  );

  return (
    <div className="flex flex-col gap-6">
      <div className="grid grid-cols-1 items-start gap-6 lg:grid-cols-[1fr_1.15fr]">
        <Panel active={!submitted}>
          <PanelHeader tone="sun" icon={PANEL_ICON.upload}>
            <PanelTitle>{submitted ? 'Entry received' : 'Upload your entry'}</PanelTitle>
          </PanelHeader>
          <PanelBody className="flex flex-col gap-4">
            {/*
              Your current entry, shown before the fields rather than after.

              Replacing used to be blind: the form looked identical whether or
              not you had already submitted, so the choice was between an image
              you could not see and one you had not uploaded yet.
            */}
            {room.mySubmission ? (
              <div className="flex flex-col gap-2.5">
                <p className="text-sm font-extrabold text-mint">
                  You are on the ballot. Replace it any time before the deadline.
                </p>
                <div className="grid grid-cols-2 gap-3">
                  <CurrentEntryImage
                    label="Your render"
                    url={room.mySubmission.imageUrl}
                    tone="sun"
                  />
                  {room.mySubmission.workspacePhotoUrl ? (
                    <CurrentEntryImage
                      label="Your workspace"
                      url={room.mySubmission.workspacePhotoUrl}
                      tone="aqua"
                    />
                  ) : null}
                </div>
              </div>
            ) : (
              <p className="text-sm font-extrabold text-haze">
                Both images are needed before the deadline. Anyone without an entry when the clock
                runs out is eliminated.
              </p>
            )}

            <EntryImageFields value={files} onChange={setFiles} disabled={submit.isPending} />

            {/*
              The failure the button used to swallow. An upload can be refused
              for a deadline that passed mid-transfer or a file the server
              rejects, and neither is guessable from a button that simply
              stopped saying "Uploading".
            */}
            {submit.isError ? (
              <p role="alert" className="text-sm font-extrabold text-punch-soft">
                {submit.error.message}
              </p>
            ) : null}

            <ChunkyButton
              size="md"
              onClick={() =>
                files.image &&
                files.workspace &&
                submit.mutate({ image: files.image, workspace: files.workspace })
              }
              disabled={!ready || submit.isPending}
            >
              {submit.isPending
                ? 'Uploading…'
                : room.mySubmission
                  ? 'Replace entry'
                  : 'Submit entry'}
            </ChunkyButton>

            {/* Says why it is disabled. The button was greyed with nothing
                explaining which of the two images was missing. */}
            {!ready && !submit.isPending ? (
              <p className="text-center text-xs font-extrabold text-haze-5">
                {!files.image && !files.workspace
                  ? 'Add both images to enable this.'
                  : !files.image
                    ? 'Still need your final render.'
                    : 'Still need your workspace photo.'}
              </p>
            ) : null}
          </PanelBody>
        </Panel>

        <ReferencePanel references={references} />
      </div>

      {room.challenge ? (
        <div className="grid grid-cols-1 items-stretch gap-6 lg:grid-cols-[1.15fr_.85fr]">
          <BriefPanel brief={room.challenge} />
          {room.challenge.objectives.length > 0 ? (
            <JudgedOnPanel objectives={room.challenge.objectives} />
          ) : null}
        </div>
      ) : null}

      {room.challenge ? <Extras brief={room.challenge} /> : null}
    </div>
  );
}

/** One image from the entry already on the ballot. */
function CurrentEntryImage({
  label,
  url,
  tone,
}: {
  label: string;
  url: string;
  tone: 'sun' | 'aqua';
}) {
  return (
    <figure className="flex flex-col gap-1.5">
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

function Results({ room }: { room: RoomDetail }) {
  const { user } = useSession();
  const play = useSound();
  const ranked = [...room.participants]
    .filter((entry) => entry.placement !== null)
    .sort((a, b) => (a.placement ?? 99) - (b.placement ?? 99));

  const myPlacement =
    room.participants.find((entry) => entry.userId === user?.id)?.placement ?? null;

  /*
    Plays once when the result first appears.

    Keyed on the room id rather than firing on every render: this panel is
    inside a polled page, so without the key a re-fetch would replay the
    fanfare every few seconds. Eliminated players get nothing — they have no
    placement, and a losing sting for someone who ran out of time would be
    punishing the attempt.
  */
  const soundedFor = useRef<string | null>(null);
  useEffect(() => {
    if (myPlacement === null || soundedFor.current === room.id) return;
    soundedFor.current = room.id;
    play(myPlacement === 1 ? 'win' : 'lose');
  }, [room.id, myPlacement, play]);

  return (
    <Panel active>
      <PanelHeader>
        <PanelTitle>Result</PanelTitle>
      </PanelHeader>
      <PanelBody className="flex flex-col gap-3">
        {ranked.map((entry) => (
          <div
            key={entry.userId}
            className="flex items-center justify-between gap-4 rounded-[14px] border-[2.5px] border-ink bg-white/5 px-4 py-3"
          >
            <div className="flex items-center gap-3">
              <span className="font-display text-xl font-bold text-sun tabular-nums">
                #{entry.placement}
              </span>
              <span className="font-display text-base font-bold text-bone">{entry.username}</span>
            </div>
            <div className="flex items-center gap-4 text-sm font-extrabold">
              <span className="text-bone-faint">{entry.likeCount ?? 0} likes</span>
            </div>
          </div>
        ))}
      </PanelBody>
    </Panel>
  );
}

function Roster({ room }: { room: RoomDetail }) {
  const TONE: Record<string, string> = {
    [RoomParticipantStatus.SUBMITTED]: 'text-mint',
    [RoomParticipantStatus.ELIMINATED]: 'text-punch-soft',
    [RoomParticipantStatus.ENTERED]: 'text-bone-faint',
  };

  return (
    <section className="flex flex-col gap-3">
      <h2 className="font-display text-lg font-bold text-bone">
        Players — {room.participants.length}/{room.maxPlayers}
      </h2>
      <div className="flex flex-wrap gap-2">
        {room.participants.map((entry) => (
          <span
            key={entry.userId}
            className="flex items-center gap-2 rounded-full border-2 border-ink bg-white/8 px-3 py-1.5 text-sm font-extrabold text-bone"
          >
            {entry.username}
            {entry.userId === room.hostId ? (
              <span className="text-[0.625rem] font-black uppercase text-sun">host</span>
            ) : null}
            <span className={`text-[0.625rem] font-black uppercase ${TONE[entry.status] ?? ''}`}>
              {entry.status}
            </span>
          </span>
        ))}
      </div>
    </section>
  );
}
