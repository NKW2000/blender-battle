'use client';

import { Difficulty } from '@bb/shared';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState } from 'react';

import { ChunkyButton } from '@/components/arcade/chunky';
import { EmptyState, Panel, PanelBody, PanelHeader, PanelTitle } from '@/components/ui/panel';
import { Select } from '@/components/ui/select';
import { useCategories } from '@/features/challenges/use-challenges';
import { useActiveRoom, useCreateRoom, useJoinRoom } from '@/features/rooms/use-rooms';

const DIFFICULTY_LABEL: Record<Difficulty, string> = {
  [Difficulty.EASY]: 'Beginner',
  [Difficulty.MEDIUM]: 'Intermediate',
  [Difficulty.HARD]: 'Advanced',
};

/** "0.5" -> "30m", "1" -> "1h", "1.5" -> "1h 30m". */
function formatHours(hours: number): string {
  const totalMinutes = Math.round(hours * 60);
  const h = Math.floor(totalMinutes / 60);
  const m = totalMinutes % 60;
  if (h === 0) return `${m}m`;
  if (m === 0) return `${h}h`;
  return `${h}h ${m}m`;
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
            {join.error ? (
              <p role="alert" className="text-sm font-bold text-punch-soft">
                {join.error.message}
              </p>
            ) : null}
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

/** Create form. Note there is no challenge picker — the server draws it. */
function CreateRoomPanel({ onClose }: { onClose: () => void }) {
  const router = useRouter();
  const create = useCreateRoom();
  const { data: categories } = useCategories();

  const [name, setName] = useState('');
  const [categoryId, setCategoryId] = useState('');
  const [difficulty, setDifficulty] = useState<Difficulty | ''>('');
  const [maxPlayers, setMaxPlayers] = useState(8);
  const [hours, setHours] = useState(0.5);

  const submit = () => {
    create.mutate(
      {
        name: name.trim() || 'Untitled room',
        categoryId: categoryId || undefined,
        difficulty: difficulty || undefined,
        maxPlayers,
        durationSeconds: Math.round(hours * 3600),
      },
      { onSuccess: (room) => router.push(`/rooms/${room.id}`) },
    );
  };

  return (
    <div
      className="fixed inset-0 z-[70] flex items-center justify-center overflow-y-auto px-4 py-10"
      style={{ background: 'rgba(14,11,43,.72)', backdropFilter: 'blur(3px)' }}
      onMouseDown={(event) => event.target === event.currentTarget && onClose()}
      role="dialog"
      aria-modal="true"
      aria-label="Create a room"
    >
      <div
        className="w-full max-w-[620px] rounded-[24px] border-4 border-edge p-7"
        style={{
          background: 'linear-gradient(180deg,#2A2170,#1B1550)',
          boxShadow: '0 14px 0 var(--color-edge)',
          animation: 'bbPop .3s cubic-bezier(.2,1.3,.35,1) both',
        }}
      >
        <h2 className="font-display text-2xl font-bold text-cream">Create a room</h2>
        <p className="mt-1.5 text-sm font-extrabold text-[#9E96D2]">
          Pick the kind of brief you want. The challenge itself is drawn when you start.
        </p>

        <label className="mt-6 block">
          <span className="eyebrow text-aqua">Room name</span>
          <input
            value={name}
            onChange={(event) => setName(event.target.value)}
            maxLength={60}
            placeholder="Friday night hard surface"
            className="arcade-focus mt-2 w-full rounded-xl border-[3px] border-edge bg-panel px-4 py-3 font-bold text-bone"
          />
        </label>

        <div className="mt-5 grid gap-4 sm:grid-cols-2">
          <div className="block">
            <span className="eyebrow text-aqua">Discipline</span>
            <Select
              className="mt-2"
              ariaLabel="Discipline"
              value={categoryId}
              onChange={setCategoryId}
              placeholder="Any"
              options={[
                { value: '', label: 'Any' },
                ...(categories ?? []).map((category) => ({
                  value: category.id,
                  label: category.name,
                })),
              ]}
            />
          </div>

          <div className="block">
            <span className="eyebrow text-aqua">Difficulty</span>
            <Select
              className="mt-2"
              ariaLabel="Difficulty"
              value={difficulty}
              onChange={(value) => setDifficulty(value as Difficulty | '')}
              placeholder="Any"
              options={[
                { value: '', label: 'Any' },
                ...Object.values(Difficulty).map((value) => ({
                  value,
                  label: DIFFICULTY_LABEL[value],
                })),
              ]}
            />
          </div>

          <label className="block">
            <span className="eyebrow text-aqua">Max players — {maxPlayers}</span>
            <input
              type="range"
              min={2}
              max={16}
              value={maxPlayers}
              onChange={(event) => setMaxPlayers(Number(event.target.value))}
              className="mt-3 w-full accent-sun"
            />
          </label>

          <label className="block">
            <span className="eyebrow text-aqua">Duration — {formatHours(hours)}</span>
            <input
              type="range"
              min={0.25}
              max={8}
              step={0.25}
              value={hours}
              onChange={(event) => setHours(Number(event.target.value))}
              className="mt-3 w-full accent-sun"
            />
          </label>
        </div>

        {create.error ? (
          <p
            role="alert"
            className="mt-5 rounded-xl border-2 border-punch bg-punch/15 px-4 py-2.5 text-sm font-bold text-punch-soft"
          >
            {create.error.message}
          </p>
        ) : null}

        <div className="mt-7 flex flex-wrap justify-end gap-3">
          <button
            type="button"
            onClick={onClose}
            className="arcade-focus rounded-[14px] border-[3px] border-white/24 bg-white/8 px-5 py-3 font-display text-[15px] font-semibold text-cream hover:bg-white/16"
          >
            Cancel
          </button>
          <ChunkyButton size="md" onClick={submit} disabled={create.isPending}>
            {create.isPending ? 'Creating…' : 'Create room'}
          </ChunkyButton>
        </div>
      </div>
    </div>
  );
}
