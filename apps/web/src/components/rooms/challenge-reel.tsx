'use client';

import { ChallengeStatus } from '@bb/shared';
import { useEffect, useMemo, useRef, useState } from 'react';

import { useChallenges } from '@/features/challenges/use-challenges';
import { useSound } from '@/features/sound/use-sound';
import type { RoomDetail } from '@/features/rooms/use-rooms';

/** One row's height. Fixed, because the landing offset is computed from it. */
const ROW = 68;

/** How long the spin runs before the countdown takes over. */
const SPIN_MS = 3600;

/**
 * The draw, as a slot machine.
 *
 * The server picks the brief the moment the host starts the room, and the room
 * then sat on a bare 3-2-1 for seven seconds — a number counting down with no
 * indication that anything was being decided. The pick is the most theatrical
 * moment the product has and it was the least visible.
 *
 * ## It lands on the real result
 *
 * Nothing here decides anything. `room.challenge` is already the drawn brief by
 * the time this renders — the server revealed it when the status left the lobby
 * — so the reel is a presentation of a decision that has already been made. The
 * strip is built with the winner in the final position and the whole thing is
 * translated to it, which is why the landing is exact rather than a spin that
 * has to be stopped at the right moment.
 *
 * ## The other names are real too
 *
 * They come from the catalogue, filtered to the room's difficulty, so the reel
 * shows what this room could plausibly have drawn rather than invented titles.
 * A player watching it learns something true about the pool. If the catalogue
 * has not loaded, or holds only the one brief, the strip pads itself and the
 * animation still runs — a draw that silently did nothing would be worse than
 * a short one.
 */
export function ChallengeReel({ room }: { room: RoomDetail }) {
  const play = useSound();
  const [landed, setLanded] = useState(false);
  const spun = useRef(false);

  /*
    The pool this room drew from.

    Published only, and at the room's difficulty — the same two filters the
    server's draw uses, so the names going past are ones that could have come
    up. Failing to load is not an error state here: the reel falls back to
    padding and the draw still reads as a draw.
  */
  const { data } = useChallenges({
    // A room with no difficulty filter drew from the whole catalogue, so the
    // reel should too — `undefined` is "any", where `null` is not a filter the
    // query understands.
    difficulty: room.difficulty ?? undefined,
    status: ChallengeStatus.PUBLISHED,
  });

  const winner = room.challenge?.title ?? 'Your brief';

  const strip = useMemo(() => {
    const pool = (data?.pages.flatMap((page) => page.items) ?? [])
      .map((challenge) => challenge.title)
      .filter((title) => title !== winner);

    /*
      Padded to a fixed length so the spin always travels the same distance and
      therefore always takes the same time. A pool of two would otherwise blur
      past in a fraction of a second and land before anyone registered it.
    */
    const filler = pool.length > 0 ? pool : ['—'];
    const rows: string[] = [];
    for (let i = 0; rows.length < 24; i += 1) rows.push(filler[i % filler.length]!);

    // The winner last: the translation below stops exactly on it.
    return [...rows, winner];
  }, [data, winner]);

  useEffect(() => {
    if (spun.current) return;
    spun.current = true;

    const timer = setTimeout(() => {
      setLanded(true);
      play('select');
    }, SPIN_MS);

    return () => clearTimeout(timer);
  }, [play]);

  const offset = (strip.length - 1) * ROW;

  return (
    <section
      aria-live="polite"
      className="flex flex-col items-center gap-4 rounded-[22px] border-[3px] border-ink px-5 py-8"
      style={{
        background:
          'radial-gradient(600px 240px at 50% 0%, #2A2170 0%, #1B1550 60%, #14103A 100%)',
        boxShadow: '0 8px 0 var(--color-ink)',
      }}
    >
      <p className="text-[11px] font-black uppercase tracking-[1.6px] text-punch-soft">
        Drawing your brief
      </p>

      {/*
        The window. One row tall, with the strip translated behind it — the
        overflow is the whole illusion, so it is the one place on this screen
        that genuinely needs clipping.
      */}
      <div
        className="relative w-full max-w-[420px] overflow-hidden rounded-[16px] border-[3px] border-ink bg-ink/40"
        style={{ height: ROW, boxShadow: 'inset 0 0 40px rgba(0,0,0,.55)' }}
      >
        <div
          className="will-change-transform"
          style={{
            transform: `translateY(-${landed ? offset : 0}px)`,
            /*
              A single eased transition rather than a per-frame animation.

              The curve does the deceleration, the browser runs it off the main
              thread, and the end state is exact — a hand-rolled spin has to
              decide when to stop and lands a pixel or two out often enough to
              look like a bug.
            */
            transition: `transform ${SPIN_MS}ms cubic-bezier(.12,.72,.16,1)`,
          }}
        >
          {strip.map((title, index) => (
            <div
              key={`${title}-${index}`}
              className="flex items-center justify-center px-4 text-center font-display text-lg font-bold text-cream"
              style={{ height: ROW }}
            >
              <span className="line-clamp-1">{title}</span>
            </div>
          ))}
        </div>

        {/* Fades top and bottom, so rows arrive and leave rather than appearing
            at a hard edge. */}
        <div
          aria-hidden="true"
          className="pointer-events-none absolute inset-x-0 top-0 h-4"
          style={{ background: 'linear-gradient(#14103A, transparent)' }}
        />
        <div
          aria-hidden="true"
          className="pointer-events-none absolute inset-x-0 bottom-0 h-4"
          style={{ background: 'linear-gradient(transparent, #14103A)' }}
        />
      </div>

      <p className="min-h-[1.25rem] text-xs font-extrabold text-haze">
        {landed ? 'That is the one. Get ready.' : 'Picking from the catalogue…'}
      </p>
    </section>
  );
}
