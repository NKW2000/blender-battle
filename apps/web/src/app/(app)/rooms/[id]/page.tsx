'use client';

import {
  CHALLENGE_MIN_MINUTES,
  ROOM_DRAW_SECONDS,
  ROOM_MIN_PLAYERS,
  RoomParticipantStatus,
  RoomStatus,
} from '@bb/shared';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { use, useEffect, useRef, useState } from 'react';

import { ChunkyButton } from '@/components/arcade/chunky';
import { BallotView } from '@/components/rooms/ballot-view';
import { CountdownGate } from '@/components/rooms/countdown-gate';
import { EmptyState, Panel, PanelBody, PanelHeader, PanelTitle, Skeleton } from '@/components/ui/panel';
import { useSession } from '@/features/auth/use-session';
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
            {new Date(room.endsAt).toLocaleString()} — each player sees this in their own
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

        {start.error ? (
          <p role="alert" className="text-sm font-bold text-punch-soft">
            {start.error.message}
          </p>
        ) : null}

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

      {leave.error ? (
        <p role="alert" className="text-sm font-bold text-punch-soft">
          {leave.error.message}
        </p>
      ) : null}

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

/** Modelling window: the brief, the clock, and the upload. */
function ActivePhase({ room, submitted }: { room: RoomDetail; submitted: boolean }) {
  const submit = useSubmitEntry(room.id);
  const [image, setImage] = useState<File | null>(null);
  const [model, setModel] = useState<File | null>(null);

  return (
    <div className="grid gap-6 lg:grid-cols-2">
      <Panel>
        <PanelHeader>
          <PanelTitle>The brief</PanelTitle>
        </PanelHeader>
        <PanelBody className="flex flex-col gap-3">
          <p className="font-display text-lg font-bold text-bone">{room.challenge?.title}</p>
          {room.challenge ? (
            <Link
              href={`/challenges/${room.challenge.slug}`}
              className="text-sm font-extrabold text-aqua hover:text-mint"
            >
              Read the full brief →
            </Link>
          ) : null}
        </PanelBody>
      </Panel>

      <Panel active={!submitted}>
        <PanelHeader>
          <PanelTitle>{submitted ? 'Entry received' : 'Upload your entry'}</PanelTitle>
        </PanelHeader>
        <PanelBody className="flex flex-col gap-4">
          {submitted ? (
            <p className="text-sm font-extrabold text-mint">
              You are on the ballot. You can replace your entry until the deadline.
            </p>
          ) : (
            <p className="text-sm font-extrabold text-bone-muted">
              Both are needed before the deadline. Anyone without an entry when the clock runs out
              is eliminated.
            </p>
          )}

          <label className="block">
            <span className="eyebrow text-aqua">Render (JPEG, PNG or WebP)</span>
            <input
              type="file"
              accept="image/jpeg,image/png,image/webp"
              onChange={(event) => setImage(event.target.files?.[0] ?? null)}
              className="mt-2 w-full text-sm font-bold text-bone-muted file:mr-3 file:rounded-lg file:border-[3px] file:border-edge file:bg-sun file:px-3 file:py-2 file:font-display file:font-bold file:text-edge"
            />
          </label>

          <label className="block">
            <span className="eyebrow text-aqua">Model (.fbx, .obj, .glb, .gltf)</span>
            <input
              type="file"
              accept=".fbx,.obj,.glb,.gltf"
              onChange={(event) => setModel(event.target.files?.[0] ?? null)}
              className="mt-2 w-full text-sm font-bold text-bone-muted file:mr-3 file:rounded-lg file:border-[3px] file:border-edge file:bg-aqua file:px-3 file:py-2 file:font-display file:font-bold file:text-edge"
            />
          </label>

          {submit.error ? (
            <p role="alert" className="text-sm font-bold text-punch-soft">
              {submit.error.message}
            </p>
          ) : null}

          <ChunkyButton
            size="md"
            onClick={() => image && submit.mutate({ image, model })}
            disabled={!image || submit.isPending}
          >
            {submit.isPending ? 'Uploading…' : submitted ? 'Replace entry' : 'Submit entry'}
          </ChunkyButton>
        </PanelBody>
      </Panel>
    </div>
  );
}

function Results({ room }: { room: RoomDetail }) {
  const ranked = [...room.participants]
    .filter((entry) => entry.placement !== null)
    .sort((a, b) => (a.placement ?? 99) - (b.placement ?? 99));

  return (
    <Panel active>
      <PanelHeader>
        <PanelTitle>Result</PanelTitle>
      </PanelHeader>
      <PanelBody className="flex flex-col gap-3">
        {ranked.map((entry) => (
          <div
            key={entry.userId}
            className="flex items-center justify-between gap-4 rounded-xl border-2 border-edge bg-panel-raised px-4 py-3"
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
            className="flex items-center gap-2 rounded-full border-2 border-edge bg-panel-raised px-3 py-1.5 text-sm font-extrabold text-bone"
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
