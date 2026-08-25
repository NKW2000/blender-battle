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

/*
  Three stages, because one ease-out is not a spin.

  A single transition from a standstill to the target is the motion of a
  scrollbar being dragged: it starts at full speed and slows to nothing. A reel
  is pulled, thrown, and caught — so it winds back a little first, overshoots
  the slot, and snaps into it.

  The middle stage keeps the handoff's own curve and very nearly its duration.
  The two short stages either side are what make the middle read as momentum
  rather than interpolation.
*/
const WINDUP_MS = 260;
const SPIN_MS = 4000;
const SETTLE_MS = 300;
const REVEAL_MS = WINDUP_MS + SPIN_MS + SETTLE_MS;

/** How far the reel pulls back before it throws, and past the slot before it snaps. */
const WINDUP_PX = 26;
const OVERSHOOT_PX = 18;

/*
  The floor between two ticks.

  At full speed the reel crosses a card every ~40ms, and a click that fast is a
  buzz rather than a rattle. Dropping the ones that fall inside this window is
  what produces the ramp: dense but countable at the start, thinning to single
  clicks as the reel gives up its speed — without any of that being scripted.
*/
const TICK_FLOOR_MS = 55;

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

    const strip = stripRef.current;
    const viewport = windowRef.current;
    if (!strip || !viewport) return;

    const offset = landingIndex * CARD_W + CARD_W / 2 - viewport.clientWidth / 2;

    /*
      Reduced motion gets the answer, not the theatre.

      Someone who has asked for less movement is not asking to be told the
      result more slowly, and a four-second horizontal slide is exactly the kind
      of motion that setting exists to suppress. No spin, no ticks, one sound.
    */
    const reduced =
      typeof window !== 'undefined' &&
      window.matchMedia('(prefers-reduced-motion: reduce)').matches;

    if (reduced) {
      strip.style.transition = 'none';
      strip.style.transform = `translateX(-${offset}px)`;
      setRevealed(true);
      play('reelLock');
      return;
    }

    const timers: number[] = [];
    let frame = 0;

    // Wind up: a short pull the other way, which is what makes the throw read
    // as a throw rather than a start.
    strip.style.transition = `transform ${WINDUP_MS}ms cubic-bezier(.25,.9,.4,1)`;
    strip.style.transform = `translateX(${WINDUP_PX}px)`;

    timers.push(
      window.setTimeout(() => {
        // The throw, on the handoff's curve, aimed a fraction past the slot.
        strip.style.transition = `transform ${SPIN_MS}ms cubic-bezier(.12,.85,.15,1)`;
        strip.style.transform = `translateX(-${offset + OVERSHOOT_PX}px)`;
      }, WINDUP_MS),
    );

    timers.push(
      window.setTimeout(() => {
        // Caught: back the last few pixels, with a curve that overshoots
        // slightly the other way so it settles rather than stops.
        strip.style.transition = `transform ${SETTLE_MS}ms cubic-bezier(.34,1.3,.64,1)`;
        strip.style.transform = `translateX(-${offset}px)`;
      }, WINDUP_MS + SPIN_MS),
    );

    /*
      Ticks are driven by where the reel actually is, not by a schedule.

      Reading the transform each frame means the rhythm is the motion's own —
      it slows exactly as the curve slows, and it stays right if the duration or
      the easing is ever changed. A precomputed schedule would have to model the
      cubic-bezier, and would drift away from what the eye is seeing the moment
      either was touched.
    */
    let lastCard = -1;
    let lastTickAt = 0;

    const watch = () => {
      /*
        Measured from the boxes, not from the transform.

        Parsing the computed matrix works but needs `DOMMatrix`, and a rect
        subtraction says the same thing with the plainest API there is: how far
        the strip's leading edge now sits behind the marker, divided by a card.
      */
      const stripLeft = strip.getBoundingClientRect().left;
      const markerX = viewport.getBoundingClientRect().left + viewport.clientWidth / 2;
      const card = Math.floor((markerX - stripLeft) / CARD_W);

      if (card !== lastCard) {
        lastCard = card;
        const now = performance.now();
        if (now - lastTickAt >= TICK_FLOOR_MS) {
          lastTickAt = now;
          play('reelTick');
        }
      }

      frame = window.requestAnimationFrame(watch);
    };
    frame = window.requestAnimationFrame(watch);

    timers.push(
      window.setTimeout(() => {
        window.cancelAnimationFrame(frame);
        setRevealed(true);
        play('reelLock');
      }, REVEAL_MS),
    );

    return () => {
      timers.forEach((timer) => window.clearTimeout(timer));
      window.cancelAnimationFrame(frame);
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
