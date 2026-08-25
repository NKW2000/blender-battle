'use client';

import { ChallengeStatus } from '@bb/shared';
import { useEffect, useMemo, useRef, useState } from 'react';

import { useChallenges } from '@/features/challenges/use-challenges';
import { useSound } from '@/features/sound/use-sound';
import type { RoomDetail } from '@/features/rooms/use-rooms';

/*
  The handoff's numbers, kept as its numbers.

  `CARD_W` is not a style choice here — the landing offset is computed from it,
  so it and the rendered card width are the same fact written once. Changing the
  card width without changing this lands the reel between two cards.
*/
const CARD_W = 260;
const REPS = 6;

/** The design's spin: 4.4s on its own curve, result revealed just after. */
const SPIN_MS = 4400;
const REVEAL_MS = 4700;

/** The card colours, cycled. Straight from the handoff's subject list. */
const CARD_COLOURS = [
  '#FF7A18',
  '#5EF0DE',
  '#22D3EE',
  '#FFD23F',
  '#FF3D9A',
  '#FF9E2C',
  '#FF6FA8',
  '#FFE08A',
];

/**
 * The challenge machine.
 *
 * The handoff draws this as a horizontal reel of coloured cards sliding behind a
 * fixed centre marker — a slot machine, with the brief that comes up framed
 * between two yellow rails. The first version of this was a vertical list of
 * titles, which is a different object entirely: it reads as a dropdown settling
 * rather than a machine being played.
 *
 * ## It presents a decision, it does not make one
 *
 * The server picks the brief when the host starts the room and reveals it as the
 * status leaves the lobby, so `room.challenge` is already the answer. The design
 * picks a random index and spins to it; here the drawn brief is *placed* at that
 * index instead, and the same spin runs. The landing is therefore exact by
 * construction rather than by stopping at the right moment.
 *
 * ## The other cards are real briefs
 *
 * From the catalogue, filtered to the room's difficulty and to published briefs
 * — what this room could plausibly have drawn. A player watching learns
 * something true about the pool rather than reading invented names.
 */
export function ChallengeReel({ room }: { room: RoomDetail }) {
  const play = useSound();
  const stripRef = useRef<HTMLDivElement>(null);
  const windowRef = useRef<HTMLDivElement>(null);
  const spun = useRef(false);
  const [revealed, setRevealed] = useState(false);

  const { data } = useChallenges({
    // A room with no discipline filter drew from the whole catalogue, so the
    // reel should too — `undefined` is "any"; `null` is not a filter.
    difficulty: room.difficulty ?? undefined,
    status: ChallengeStatus.PUBLISHED,
  });

  const winner = room.challenge?.title ?? 'Your brief';

  /*
    The strip, and where it stops.

    Built exactly as the handoff builds it — the pool repeated `REPS` times — and
    then the drawn brief is written into the final repetition's slot. That slot
    is the one the transform lands on, so the card under the marker at the end is
    the challenge the server actually chose.
  */
  const { cards, landingIndex } = useMemo(() => {
    const pool = (data?.pages.flatMap((page) => page.items) ?? [])
      .map((challenge) => challenge.title)
      .filter((title) => title !== winner);

    // A pool of one would make every card identical and the spin unreadable, so
    // the winner joins the scenery when there is nothing else to show.
    const subjects = pool.length > 0 ? pool : [winner];

    const strip: string[] = [];
    for (let rep = 0; rep < REPS; rep += 1) {
      for (const subject of subjects) strip.push(subject);
    }

    // Somewhere inside the last repetition, as the design does — not the very
    // last card, so there is still reel visible to the right of the marker.
    const index = (REPS - 1) * subjects.length + Math.floor(subjects.length / 2);
    strip[index] = winner;

    return { cards: strip, landingIndex: index };
  }, [data, winner]);

  useEffect(() => {
    if (spun.current) return;
    spun.current = true;

    /*
      The handoff's own sequence: reset to zero with no transition, force a
      reflow so the browser cannot collapse the two writes into one, then apply
      the transition and the target in the next frame. Without the reflow the
      element simply appears at the destination.
    */
    const start = window.setTimeout(() => {
      const strip = stripRef.current;
      const viewport = windowRef.current;
      if (!strip || !viewport) return;

      const offset = landingIndex * CARD_W + CARD_W / 2 - viewport.clientWidth / 2;

      strip.style.transition = 'none';
      strip.style.transform = 'translateX(0px)';
      void strip.offsetHeight;
      strip.style.transition = `transform ${SPIN_MS}ms cubic-bezier(.12,.85,.15,1)`;
      strip.style.transform = `translateX(-${offset}px)`;
    }, 60);

    const reveal = window.setTimeout(() => {
      setRevealed(true);
      play('select');
    }, REVEAL_MS);

    return () => {
      window.clearTimeout(start);
      window.clearTimeout(reveal);
    };
  }, [landingIndex, play]);

  return (
    <section
      aria-live="polite"
      className="flex flex-col items-center gap-5 rounded-[22px] border-[3px] border-ink px-4 py-7"
      style={{
        background:
          'radial-gradient(1200px 700px at 50% -10%, #2A2170 0%, #171149 55%, #0E0B2B 100%)',
        boxShadow: '0 8px 0 var(--color-ink)',
      }}
    >
      <div className="flex items-center gap-2.5">
        <span
          className="h-3 w-3 rounded-full bg-punch"
          style={{ boxShadow: '0 0 0 5px rgba(255,61,154,.22)', animation: 'bbTwinkle 1.2s infinite' }}
        />
        <span className="font-display text-[clamp(17px,2.4vw,24px)] font-bold tracking-[.5px] text-cream">
          CHALLENGE MACHINE
        </span>
      </div>

      {/* The window. Its overflow is the whole illusion. */}
      <div
        ref={windowRef}
        className="relative w-full overflow-hidden border-y-4 border-ink"
        style={{
          height: 'clamp(200px,30vh,300px)',
          background: 'rgba(14,11,43,.55)',
          boxShadow: 'inset 0 0 60px rgba(0,0,0,.6)',
        }}
      >
        <div ref={stripRef} className="flex h-full items-center will-change-transform">
          {cards.map((title, index) => (
            <div
              key={`${title}-${index}`}
              className="flex h-full flex-none items-center px-2"
              style={{ width: CARD_W }}
            >
              <div
                className="flex h-[78%] w-full flex-col justify-center gap-3 rounded-[20px] border-4 border-ink px-5"
                style={{
                  background: CARD_COLOURS[index % CARD_COLOURS.length],
                  boxShadow: '0 7px 0 rgba(14,11,43,.35)',
                }}
              >
                <span className="flex h-13 w-13 items-center justify-center rounded-[13px] bg-ink/85">
                  <span className="h-4.5 w-4.5 rotate-45 rounded-[3px] bg-cream" />
                </span>
                <span className="line-clamp-3 font-display text-xl font-bold leading-[1.05] text-ink">
                  {title}
                </span>
              </div>
            </div>
          ))}
        </div>

        {/* Edge fades, so cards arrive and leave rather than popping in. */}
        <div
          aria-hidden="true"
          className="pointer-events-none absolute inset-y-0 left-0 w-[16%]"
          style={{ background: 'linear-gradient(90deg,#171149,rgba(23,17,73,0))' }}
        />
        <div
          aria-hidden="true"
          className="pointer-events-none absolute inset-y-0 right-0 w-[16%]"
          style={{ background: 'linear-gradient(270deg,#171149,rgba(23,17,73,0))' }}
        />

        {/*
          The marker: the rails and the two arrows that frame whatever stops
          under them. This is what makes it read as a machine rather than a
          carousel — the reel moves, the frame does not.
        */}
        <div
          aria-hidden="true"
          className="pointer-events-none absolute inset-y-0 left-1/2 -translate-x-1/2"
          style={{
            width: CARD_W + 8,
            borderLeft: '3px solid rgba(255,210,63,.6)',
            borderRight: '3px solid rgba(255,210,63,.6)',
            boxShadow: '0 0 30px rgba(255,210,63,.25)',
          }}
        />
        <div
          aria-hidden="true"
          className="pointer-events-none absolute left-1/2 top-1.5 -translate-x-1/2"
          style={{
            width: 0,
            height: 0,
            borderLeft: '14px solid transparent',
            borderRight: '14px solid transparent',
            borderTop: '20px solid #FFD23F',
            filter: 'drop-shadow(0 0 6px rgba(255,210,63,.6))',
          }}
        />
        <div
          aria-hidden="true"
          className="pointer-events-none absolute bottom-1.5 left-1/2 -translate-x-1/2"
          style={{
            width: 0,
            height: 0,
            borderLeft: '14px solid transparent',
            borderRight: '14px solid transparent',
            borderBottom: '20px solid #FFD23F',
            filter: 'drop-shadow(0 0 6px rgba(255,210,63,.6))',
          }}
        />
      </div>

      <div className="flex min-h-[3.5rem] flex-col items-center justify-center text-center">
        {revealed ? (
          <div style={{ animation: 'bbPop .4s ease both' }}>
            <div className="text-[11px] font-black uppercase tracking-[2px] text-aqua">
              Locked in
            </div>
            <div className="font-display text-[clamp(20px,3.4vw,30px)] font-bold text-cream">
              {winner}
            </div>
          </div>
        ) : (
          <div className="flex items-center gap-3 font-display text-[15px] font-semibold tracking-[1px] text-haze-3">
            <span
              className="h-4 w-4 rounded-full border-[3px] border-ember border-t-transparent"
              style={{ animation: 'bbSpin .8s linear infinite' }}
            />
            Slicing through the deck…
          </div>
        )}
      </div>
    </section>
  );
}
