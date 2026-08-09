'use client';

import {
  CHALLENGE_MAX_MINUTES,
  CHALLENGE_MIN_MINUTES,
  Difficulty,
  ROOM_MAX_PLAYERS,
  ROOM_MIN_PLAYERS,
  ROOM_NAME_MAX_LENGTH,
  ROOM_NAME_MIN_LENGTH,
} from '@bb/shared';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useRef, useState } from 'react';

import { ChunkyButton } from '@/components/arcade/chunky';
import { DateTimeField, toLocalInputValue } from '@/components/ui/date-time-field';
import { EmptyState, Panel, PanelBody, PanelHeader, PanelTitle } from '@/components/ui/panel';
import { Select } from '@/components/ui/select';
import { useCategories } from '@/features/challenges/use-challenges';
import { useActiveRoom, useCreateRoom, useJoinRoom } from '@/features/rooms/use-rooms';
import { cn } from '@/lib/utils';

const DIFFICULTY_LABEL: Record<Difficulty, string> = {
  [Difficulty.EASY]: 'Beginner',
  [Difficulty.MEDIUM]: 'Intermediate',
  [Difficulty.HARD]: 'Advanced',
};

const DIFFICULTY_HINT: Record<Difficulty, string> = {
  [Difficulty.EASY]: 'Gentle brief',
  [Difficulty.MEDIUM]: 'Some teeth',
  [Difficulty.HARD]: 'Bring a plan',
};

/** Where the deadline field starts: half an hour out, which is a typical round. */
const DEFAULT_DURATION_MINUTES = 30;

function endsAtFromNow(minutes: number): string {
  return toLocalInputValue(new Date(Date.now() + minutes * 60_000));
}

/**
 * Rooms are invite-only.
 *
 * There is no browse list because there are no public rooms: a room is reached
 * by creating one or by being given its code. That is the whole of its access
 * control, which is why the code is only ever shown to the host.
 */
export default function RoomsPage() {
  const router = useRouter();
  const join = useJoinRoom();
  const { data: active } = useActiveRoom();
  const [code, setCode] = useState('');
  const [creating, setCreating] = useState(false);

  const joinByCode = () => {
    if (code.trim().length < 4) return;
    join.mutate(
      { code: code.trim().toUpperCase() },
      { onSuccess: (room) => router.push(`/rooms/${room.id}`) },
    );
  };

  return (
    <div className="flex flex-col gap-8">
      {creating ? <CreateRoomPanel onClose={() => setCreating(false)} /> : null}

      <div>
        <h1 className="font-display text-3xl font-bold text-bone">Rooms</h1>
        <p className="mt-1 text-sm font-extrabold text-bone-faint">
          Invite-only. Several artists, one brief, one deadline.
        </p>
      </div>

      {active ? (
        <Panel active>
          <PanelHeader>
            <PanelTitle>You are in a room</PanelTitle>
          </PanelHeader>
          <PanelBody className="flex flex-wrap items-center justify-between gap-4">
            <span className="font-display text-lg font-bold text-bone">{active.name}</span>
            <ChunkyButton asChild size="sm">
              <Link href={`/rooms/${active.id}`}>Rejoin →</Link>
            </ChunkyButton>
          </PanelBody>
        </Panel>
      ) : null}

      <div className="grid gap-6 md:grid-cols-2">
        <Panel className="flex flex-col">
          <PanelHeader>
            <PanelTitle>Create a room</PanelTitle>
          </PanelHeader>
          <PanelBody className="flex flex-1 flex-col gap-4">
            <p className="text-sm font-extrabold text-bone-muted">
              You get a code to share. The brief is drawn when you start — nobody sees it early,
              including you.
            </p>
            <ChunkyButton size="md" sheen className="mt-auto" onClick={() => setCreating(true)}>
              ⚔ CREATE
            </ChunkyButton>
          </PanelBody>
        </Panel>

        <Panel className="flex flex-col">
          <PanelHeader>
            <PanelTitle>Join with a code</PanelTitle>
          </PanelHeader>
          <PanelBody className="flex flex-1 flex-col gap-4">
            <input
              value={code}
              onChange={(event) => setCode(event.target.value.toUpperCase())}
              onKeyDown={(event) => event.key === 'Enter' && joinByCode()}
              placeholder="ABC123"
              maxLength={12}
              aria-label="Room code"
              className="arcade-focus w-full rounded-xl border-[3px] border-edge bg-panel px-4 py-3 text-center font-mono text-2xl font-bold uppercase tracking-[0.3em] text-bone"
            />
            <ChunkyButton size="md" tone="aqua" onClick={joinByCode} disabled={join.isPending}>
              {join.isPending ? 'Joining…' : 'JOIN'}
            </ChunkyButton>
          </PanelBody>
        </Panel>
      </div>

      {!active ? (
        <Panel>
          <EmptyState
            title="Nothing running"
            description="Create a room and share the code, or paste a code you were given."
          />
        </Panel>
      ) : null}
    </div>
  );
}

/*
  Fields inside the dialog sit on `bg-white/6`, not `bg-panel`: the dialog's
  gradient bottoms out at exactly `--color-panel`, so a panel-toned input at the
  foot of the form would have had no edge against its own background. This is the
  same treatment as `Select tone="field"`, which the selects below use — the two
  must match or the form reads as two different components bolted together.
*/
const FIELD_CLASS =
  'arcade-focus h-12 w-full rounded-2xl border-[3px] border-white/16 bg-white/6 px-4 font-bold text-bone transition-colors placeholder:text-bone-faint/70 focus:border-select focus:bg-select/10';

/** Create form. Note there is no challenge picker — the server draws it. */
function CreateRoomPanel({ onClose }: { onClose: () => void }) {
  const router = useRouter();
  const create = useCreateRoom();
  const { data: categories } = useCategories();

  const panelRef = useRef<HTMLDivElement>(null);
  const nameRef = useRef<HTMLInputElement>(null);
  const returnFocusRef = useRef<HTMLElement | null>(null);

  const [name, setName] = useState('');
  const [categoryId, setCategoryId] = useState('');
  const [difficulty, setDifficulty] = useState<Difficulty | ''>('');
  const [maxPlayers, setMaxPlayers] = useState(8);
  const [endsAtLocal, setEndsAtLocal] = useState(() => endsAtFromNow(DEFAULT_DURATION_MINUTES));
  // The deadline is absolute, so every second the dialog sits open eats into it.
  // Re-reading the clock keeps the "in X" readout and the minimum-time check
  // honest instead of frozen at whatever the time was on open.
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 15_000);
    return () => clearInterval(timer);
  }, []);

  // Everything a native <dialog> would have given for free: focus in on open,
  // Escape to cancel, Tab trapped inside, the page behind frozen, focus back to
  // the trigger on close.
  useEffect(() => {
    returnFocusRef.current = document.activeElement as HTMLElement | null;
    nameRef.current?.focus();

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        onClose();
        return;
      }
      if (event.key !== 'Tab') return;

      const focusable = panelRef.current?.querySelectorAll<HTMLElement>(
        'button:not([disabled]), [href], input:not([disabled]), select, textarea, [tabindex]:not([tabindex="-1"])',
      );
      if (!focusable?.length) return;

      const first = focusable[0] as HTMLElement;
      const last = focusable[focusable.length - 1] as HTMLElement;

      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };

    document.addEventListener('keydown', onKeyDown);
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';

    return () => {
      document.removeEventListener('keydown', onKeyDown);
      document.body.style.overflow = previousOverflow;
      returnFocusRef.current?.focus?.();
    };
  }, [onClose]);

  // Client-side mirror of the server's bounds, so a bad pick is caught before the
  // request rather than bounced back as an error. The server still enforces both.
  const endsAtDate = endsAtLocal ? new Date(endsAtLocal) : null;
  const endsAtValid = Boolean(endsAtDate && !Number.isNaN(endsAtDate.getTime()));
  const minutesFromNow = endsAtValid ? ((endsAtDate as Date).getTime() - now) / 60_000 : 0;
  const endsAtError = !endsAtValid
    ? 'Pick an end date and time.'
    : minutesFromNow < CHALLENGE_MIN_MINUTES
      ? `Must be at least ${CHALLENGE_MIN_MINUTES} minutes from now.`
      : minutesFromNow > CHALLENGE_MAX_MINUTES
        ? `Must be within ${Math.round(CHALLENGE_MAX_MINUTES / 60)} hours from now.`
        : null;

  // An empty name is fine — it falls back to "Untitled room" on submit. Only a
  // name that was started and left too short is an error.
  const trimmedName = name.trim();
  const nameError =
    trimmedName.length > 0 && trimmedName.length < ROOM_NAME_MIN_LENGTH
      ? `At least ${ROOM_NAME_MIN_LENGTH} characters.`
      : null;

  const canSubmit = !create.isPending && !endsAtError && !nameError;

  const submit = () => {
    if (!endsAtDate || !canSubmit) return;
    create.mutate(
      {
        name: trimmedName || 'Untitled room',
        categoryId: categoryId || undefined,
        difficulty: difficulty || undefined,
        maxPlayers,
        // The browser reads the picked wall-clock value in its own timezone —
        // toISOString() is what turns that into the single UTC instant every
        // other player's client will later render back in theirs.
        endsAt: endsAtDate.toISOString(),
      },
      { onSuccess: (room) => router.push(`/rooms/${room.id}`) },
    );
  };

  return (
    <div
      className="fixed inset-0 z-[70] flex items-start justify-center overflow-y-auto px-4 py-8 sm:items-center"
      style={{ background: 'rgba(14,11,43,.72)', backdropFilter: 'blur(3px)' }}
      onMouseDown={(event) => event.target === event.currentTarget && onClose()}
    >
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="bb-create-room-title"
        className="w-full max-w-[620px] rounded-[24px] border-4 border-edge"
        style={{
          background: 'linear-gradient(180deg,#2A2170,#1B1550)',
          boxShadow: '0 14px 0 var(--color-edge)',
          animation: 'bbPop .3s cubic-bezier(.2,1.3,.35,1) both',
        }}
      >
        <header className="flex items-start gap-4 border-b-[3px] border-white/10 px-6 py-5">
          <div
            aria-hidden="true"
            className="flex h-12 w-12 shrink-0 items-center justify-center rounded-[14px] border-[3px] border-ink bg-linear-to-b from-flame-lift to-flame text-2xl leading-none"
            style={{ boxShadow: '0 4px 0 var(--color-ink)' }}
          >
            ⚔
          </div>

          <div className="min-w-0 flex-1">
            <h2
              id="bb-create-room-title"
              className="font-display text-2xl font-bold leading-tight text-cream"
            >
              Create a room
            </h2>
            <p className="mt-1 text-sm font-extrabold text-bone-faint">
              Set the shape of the contest. The brief itself is drawn when you start.
            </p>
          </div>

          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="arcade-focus -mr-1 -mt-1 flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border-2 border-white/20 bg-white/6 font-display text-lg font-bold leading-none text-bone-muted transition-colors hover:bg-white/16 hover:text-cream"
          >
            ✕
          </button>
        </header>

        <div className="flex flex-col gap-5 px-6 py-5">
          <FormSection
            label="Room name"
            hint={`${trimmedName.length} / ${ROOM_NAME_MAX_LENGTH}`}
          >
            <input
              ref={nameRef}
              value={name}
              onChange={(event) => setName(event.target.value)}
              maxLength={ROOM_NAME_MAX_LENGTH}
              placeholder="Friday night hard surface"
              aria-label="Room name"
              aria-invalid={Boolean(nameError)}
              className={cn(FIELD_CLASS, nameError && 'border-punch/70')}
            />
            <p
              aria-live="polite"
              className={cn(
                'mt-1.5 text-xs font-extrabold',
                nameError ? 'text-punch-soft' : 'text-bone-faint',
              )}
            >
              {nameError ?? 'Leave it blank and it becomes “Untitled room”.'}
            </p>
          </FormSection>

          <FormSection label="The brief" hint="Drawn at start — hidden from you too">
            <div className="grid gap-3 sm:grid-cols-2">
              <Select
                tone="field"
                ariaLabel="Discipline"
                value={categoryId}
                onChange={setCategoryId}
                placeholder="Any discipline"
                options={[
                  { value: '', label: 'Any discipline', hint: 'Surprise me' },
                  ...(categories ?? []).map((category) => ({
                    value: category.id,
                    label: category.name,
                  })),
                ]}
              />
              <Select
                tone="field"
                ariaLabel="Difficulty"
                value={difficulty}
                onChange={(value) => setDifficulty(value as Difficulty | '')}
                placeholder="Any difficulty"
                options={[
                  { value: '', label: 'Any difficulty', hint: 'Surprise me' },
                  ...Object.values(Difficulty).map((value) => ({
                    value,
                    label: DIFFICULTY_LABEL[value],
                    hint: DIFFICULTY_HINT[value],
                  })),
                ]}
              />
            </div>
          </FormSection>

          <FormSection label="Players" hint={`${ROOM_MIN_PLAYERS}–${ROOM_MAX_PLAYERS}`}>
            <div className="flex items-center gap-3">
              <StepperButton
                label="Fewer players"
                disabled={maxPlayers <= ROOM_MIN_PLAYERS}
                onClick={() => setMaxPlayers((value) => Math.max(ROOM_MIN_PLAYERS, value - 1))}
              >
                −
              </StepperButton>
              <output
                aria-live="polite"
                className="flex h-12 flex-1 items-center justify-center rounded-2xl border-[3px] border-white/16 bg-white/6 font-display text-2xl font-bold text-bone"
              >
                {maxPlayers}
              </output>
              <StepperButton
                label="More players"
                disabled={maxPlayers >= ROOM_MAX_PLAYERS}
                onClick={() => setMaxPlayers((value) => Math.min(ROOM_MAX_PLAYERS, value + 1))}
              >
                +
              </StepperButton>
            </div>
          </FormSection>

          <FormSection label="Deadline" hint={`Up to ${CHALLENGE_MAX_MINUTES / 60} hours`}>
            <DateTimeField
              ariaLabel="Ends at"
              value={endsAtLocal}
              invalid={Boolean(endsAtError)}
              minDate={new Date(now + CHALLENGE_MIN_MINUTES * 60_000)}
              maxDate={new Date(now + CHALLENGE_MAX_MINUTES * 60_000)}
              onChange={setEndsAtLocal}
            />
            <p
              aria-live="polite"
              className={cn(
                'mt-1.5 text-xs font-extrabold',
                endsAtError ? 'text-punch-soft' : 'text-bone-faint',
              )}
            >
              {endsAtError ?? 'Every player sees this in their own timezone.'}
            </p>
          </FormSection>
        </div>

        <footer className="flex flex-wrap justify-end gap-3 border-t-[3px] border-white/10 px-6 py-5">
          <button
            type="button"
            onClick={onClose}
            className="arcade-focus rounded-[14px] border-[3px] border-white/24 bg-white/8 px-5 py-3 font-display text-[15px] font-semibold text-cream transition-colors hover:bg-white/16"
          >
            Cancel
          </button>
          <ChunkyButton size="md" sheen={canSubmit} onClick={submit} disabled={!canSubmit}>
            {create.isPending ? 'Creating…' : 'Create room'}
          </ChunkyButton>
        </footer>
      </div>
    </div>
  );
}

/** A labelled block in the create form, with an optional right-aligned counter. */
function FormSection({
  label,
  hint,
  children,
}: {
  label: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <section>
      <div className="flex items-baseline justify-between gap-3">
        <span className="eyebrow text-aqua">{label}</span>
        {hint ? (
          <span className="text-[11px] font-extrabold text-bone-faint">{hint}</span>
        ) : null}
      </div>
      <div className="mt-2">{children}</div>
    </section>
  );
}

/** The −/+ pair either side of the player count. */
function StepperButton({
  label,
  disabled,
  onClick,
  children,
}: {
  label: string;
  disabled: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      aria-label={label}
      disabled={disabled}
      onClick={onClick}
      className="arcade-press arcade-focus flex h-12 w-12 shrink-0 cursor-pointer items-center justify-center rounded-2xl border-[3px] border-ink bg-cream font-display text-2xl font-bold leading-none text-ink [--press-depth:3px] disabled:cursor-not-allowed disabled:opacity-40"
      style={{ boxShadow: '0 3px 0 var(--color-ink)' }}
    >
      {children}
    </button>
  );
}

