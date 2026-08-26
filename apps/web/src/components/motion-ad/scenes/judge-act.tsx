'use client';

import { useRef } from 'react';

import { AdCursor, HudFrame, HudLabel, Ticker } from '../ad-parts';
import { AdScene } from '../ad-scene';
import { clamp, easeOut, easeOutExpo, impact, mix, shake, span, spring, stagger } from '../timeline';
import { useAdFrame } from '../use-ad-clock';

/**
 * The judging act: the work is revealed, the room votes, someone wins.
 *
 * The one rule holding these three beats together is that the entries stay
 * anonymous until the result. That is the product's actual mechanic, and it is
 * also what makes the sequence tense — the viewer is asked to pick before they
 * are told who made either one.
 */

/* --------------------------------------------------------- 28–35s  REVEAL */

export function RevealScene() {
  const aRef = useRef<HTMLDivElement>(null);
  const bRef = useRef<HTMLDivElement>(null);
  const questionRef = useRef<HTMLDivElement>(null);

  useAdFrame((t) => {
    /*
      The two entries do not arrive together.

      Each gets its own moment — a push in from black, held for most of a
      second — because the film is asking the viewer to compare them, and two
      things arriving at once are seen as a pair rather than as two pieces of
      work.
    */
    for (const [ref, at] of [
      [aRef, 28.35],
      [bRef, 29.9],
    ] as const) {
      const node = ref.current;
      if (!node) continue;
      const p = span(t, at, at + 0.9);
      const e = easeOutExpo(p);

      // Slides to its final half of the screen once both are out.
      const settle = span(t, 31.2, 32.1);
      const home = ref === aRef ? -1 : 1;

      node.style.opacity = String(clamp(p * 2.6));
      node.style.transform =
        `translate3d(${mix(0, home * 21, easeOut(settle))}vmin, 0, 0)` +
        ` scale(${mix(1.16, 1, e) * mix(1, 0.82, easeOut(settle))})`;
      node.style.zIndex = ref === aRef ? '2' : '1';
    }

    if (questionRef.current) {
      const p = span(t, 32.2, 32.8);
      questionRef.current.style.opacity = String(clamp(p * 2));
      questionRef.current.style.transform = `translate3d(0, ${(1 - impact(p)) * 2.4}vmin, 0) scale(${mix(1.1, 1, impact(p))})`;
    }
  });

  return (
    <AdScene id="reveal" transition="zoom">
      <div className="relative flex items-center justify-center">
        <Entry ref={aRef} letter="A" tone="aqua" />
        <Entry ref={bRef} letter="B" tone="punch" />
      </div>

      <div
        ref={questionRef}
        className="absolute bottom-[13vmin] flex flex-col items-center gap-[1vmin]"
        style={{ opacity: 0, willChange: 'transform, opacity' }}
      >
        <span className="font-display text-[5.4vmin] font-bold leading-none text-cream">
          WHO BUILT IT BETTER?
        </span>
        <span className="font-mono text-[1.3vmin] tracking-[0.32em] text-cream/45">
          NO NAMES · ONE VOTE EACH
        </span>
      </div>

      {/*
        The pointer weighs both before choosing.

        It crosses to A, back to B, then settles — because the question the
        scene asks is a real one, and a cursor that goes straight to an answer
        would be showing a decision that had already been made.
      */}
      <AdCursor
        path={[
          { at: 32.9, x: 26, y: 16 },
          { at: 33.4, x: -20, y: 2 },
          { at: 33.9, x: 20, y: 2 },
          { at: 34.35, x: -20, y: 2 },
        ]}
        clickAt={34.4}
      />
    </AdScene>
  );
}

/** One anonymous entry. The work is the subject; the author is deliberately absent. */
function Entry({
  ref,
  letter,
  tone,
}: {
  ref: React.RefObject<HTMLDivElement | null>;
  letter: 'A' | 'B';
  tone: 'aqua' | 'punch';
}) {
  return (
    <div ref={ref} className="absolute" style={{ opacity: 0, willChange: 'transform, opacity' }}>
      <HudFrame tone={tone} className="rounded-[1.8vmin] p-[1.4vmin]">
        {/*
          The render itself is drawn rather than photographed: a soft-lit form on
          a gradient, which is what a Blender render of a single object looks
          like at this size, and costs nothing to ship.
        */}
        <div
          className="grid h-[38vmin] w-[38vmin] place-items-center rounded-[1.2vmin] border-2 border-ink"
          style={{
            background:
              tone === 'aqua'
                ? 'radial-gradient(60% 55% at 38% 30%, #7fe3ff 0%, #2b7fa8 48%, #101a3c 100%)'
                : 'radial-gradient(60% 55% at 62% 32%, #ff9ecb 0%, #b3316f 46%, #2a0f2c 100%)',
          }}
        >
          <div
            className="h-[16vmin] w-[16vmin] rounded-[2.2vmin]"
            style={{
              background:
                tone === 'aqua'
                  ? 'linear-gradient(150deg, #eaffff, #6fd4ff 45%, #1d5f86)'
                  : 'linear-gradient(150deg, #fff0f7, #ff7db6 45%, #7d1f4d)',
              boxShadow: '0 1.4vmin 2.6vmin rgba(0,0,0,.45)',
              transform: 'rotate(-12deg)',
            }}
          />
        </div>

        <div className="mt-[1.2vmin] flex items-center justify-between px-[0.6vmin] pb-[0.4vmin]">
          <span className="font-mono text-[1.25vmin] tracking-[0.3em] text-cream/60">ENTRY</span>
          <span className={`font-display text-[3vmin] font-bold leading-none ${tone === 'aqua' ? 'text-aqua' : 'text-punch'}`}>
            {letter}
          </span>
        </div>
      </HudFrame>
    </div>
  );
}

/* --------------------------------------------------------- 35–41s  VOTING */

export function VotingScene() {
  const aBarRef = useRef<HTMLDivElement>(null);
  const bBarRef = useRef<HTMLDivElement>(null);
  const aPctRef = useRef<HTMLSpanElement>(null);
  const bPctRef = useRef<HTMLSpanElement>(null);
  const everyRef = useRef<HTMLDivElement>(null);
  const tallyRef = useRef<HTMLDivElement>(null);

  useAdFrame((t) => {
    /*
      The split moves like a real vote: contested, then decided.

      It is written as a curve rather than random noise so it lands on the same
      number every viewing — and so it can be made to *swap the lead* twice
      before settling, which is the shape that makes a result feel earned.
    */
    const local = span(t, 35.2, 40.2);
    const contest = Math.sin(local * 9.5) * (1 - local) * 9;
    const settle = mix(47, 53, easeOut(local));
    const bShare = clamp(settle + contest, 12, 88);
    const aShare = 100 - bShare;

    if (aBarRef.current) aBarRef.current.style.transform = `scaleX(${aShare / 100})`;
    if (bBarRef.current) bBarRef.current.style.transform = `scaleX(${bShare / 100})`;
    if (aPctRef.current) aPctRef.current.textContent = `${Math.round(aShare)}%`;
    if (bPctRef.current) bPctRef.current.textContent = `${Math.round(bShare)}%`;

    // Votes landing, one at a time, quickening.
    if (tallyRef.current) {
      const votes = Math.floor(mix(0, 214, easeOut(local)));
      tallyRef.current.textContent = `${votes} VOTES`;
    }

    if (everyRef.current) {
      const p = span(t, 39.1, 39.7);
      everyRef.current.style.opacity = String(clamp(p * 2));
      everyRef.current.style.transform = `scale(${mix(1.24, 1, impact(p))})`;
    }
  });

  return (
    <AdScene id="voting">
      <div className="flex w-full max-w-[110vmin] flex-col items-center gap-[3vmin]">
        <div className="font-mono text-[1.4vmin] tracking-[0.34em] text-cream/50">
          <HudLabel from={35.2}>COMMUNITY VOTE · LIVE</HudLabel>
        </div>

        <div className="flex w-full flex-col gap-[1.8vmin]">
          <VoteRow
            letter="A"
            tone="aqua"
            barRef={aBarRef}
            pctRef={aPctRef}
            from={35.35}
          />
          <VoteRow
            letter="B"
            tone="punch"
            barRef={bBarRef}
            pctRef={bPctRef}
            from={35.5}
          />
        </div>

        <div ref={tallyRef} className="font-mono text-[1.5vmin] tracking-[0.3em] text-cream/55 tabular-nums">
          0 VOTES
        </div>

        <div
          ref={everyRef}
          className="font-display text-[5.6vmin] font-bold leading-none text-sun"
          style={{ opacity: 0, willChange: 'transform, opacity' }}
        >
          EVERY VOTE COUNTS
        </div>
      </div>
    </AdScene>
  );
}

function VoteRow({
  letter,
  tone,
  barRef,
  pctRef,
  from,
}: {
  letter: string;
  tone: 'aqua' | 'punch';
  barRef: React.RefObject<HTMLDivElement | null>;
  pctRef: React.RefObject<HTMLSpanElement | null>;
  from: number;
}) {
  const rowRef = useRef<HTMLDivElement>(null);

  useAdFrame((t) => {
    const node = rowRef.current;
    if (!node) return;
    const p = span(t, from, from + 0.6);
    const e = spring(p);
    node.style.opacity = String(clamp(p * 2.4));
    node.style.transform = `translate3d(${mix(tone === 'aqua' ? -8 : 8, 0, e)}vmin, 0, 0)`;
  });

  return (
    <div ref={rowRef} className="flex items-center gap-[2vmin]" style={{ opacity: 0, willChange: 'transform, opacity' }}>
      <span
        className={`grid h-[7vmin] w-[7vmin] flex-none place-items-center rounded-[1.4vmin] border-2 border-ink font-display text-[3.4vmin] font-bold text-ink ${tone === 'aqua' ? 'bg-aqua' : 'bg-punch'}`}
        style={{ boxShadow: '0 0.7vmin 0 var(--color-ink)' }}
      >
        {letter}
      </span>

      <div className="relative h-[3.4vmin] flex-1 overflow-hidden rounded-full border-2 border-ink bg-white/[0.06]">
        <div
          ref={barRef}
          className={`h-full origin-left rounded-full ${tone === 'aqua' ? 'bg-linear-to-r from-mint to-aqua' : 'bg-linear-to-r from-[#ff6fa8] to-punch'}`}
          style={{ transform: 'scaleX(0)', willChange: 'transform' }}
        />
      </div>

      <span
        ref={pctRef}
        className={`w-[9vmin] flex-none text-right font-display text-[3.4vmin] font-bold tabular-nums ${tone === 'aqua' ? 'text-aqua' : 'text-punch'}`}
      >
        0%
      </span>
    </div>
  );
}

/* -------------------------------------------------------- 41–46s  VICTORY */

export function VictoryScene() {
  const winRef = useRef<HTMLDivElement>(null);
  const cardRef = useRef<HTMLDivElement>(null);
  const xpBarRef = useRef<HTMLDivElement>(null);
  const levelRef = useRef<HTMLSpanElement>(null);
  const shakeRef = useRef<HTMLDivElement>(null);
  const rewardsRef = useRef<HTMLDivElement>(null);

  useAdFrame((t) => {
    // WINNER stamps in and knocks the whole scene.
    if (winRef.current) {
      const p = span(t, 41.15, 41.7);
      const e = impact(p);
      winRef.current.style.opacity = String(clamp(p * 4));
      winRef.current.style.transform = `scale(${mix(3, 1, e)}) rotate(${mix(12, -3, easeOutExpo(p))}deg)`;
    }

    if (shakeRef.current) {
      const jolt = shake(t, 41.18, 1.3, 0.55);
      shakeRef.current.style.transform = `translate3d(${jolt.x}vmin, ${jolt.y}vmin, 0)`;
    }

    // The profile rises once the stamp has landed.
    if (cardRef.current) {
      const p = span(t, 42.1, 42.9);
      const e = spring(p);
      cardRef.current.style.opacity = String(clamp(p * 2.4));
      cardRef.current.style.transform = `translate3d(0, ${mix(6, 0, e)}vmin, 0) scale(${mix(0.9, 1, e)})`;
    }

    // The three rewards tick on in sequence.
    if (rewardsRef.current) {
      for (let i = 0; i < rewardsRef.current.children.length; i += 1) {
        const p = stagger(t, 43.1, 0.28, i, 0.42);
        const child = rewardsRef.current.children[i] as HTMLElement;
        child.style.opacity = String(clamp(p * 2));
        child.style.transform = `translate3d(0, ${(1 - impact(p)) * 1.8}vmin, 0) scale(${mix(1.2, 1, impact(p))})`;
      }
    }

    /*
      The XP bar fills, and the level only flips once it is full.

      Flipping the number early would break the causal chain the beat exists to
      show: the bar filling is *why* the level changes.
    */
    const fill = span(t, 43.5, 44.9);
    if (xpBarRef.current) xpBarRef.current.style.transform = `scaleX(${easeOut(fill)})`;

    if (levelRef.current) {
      const flipped = t >= 44.9;
      levelRef.current.textContent = flipped ? 'LEVEL 08' : 'LEVEL 07';
      const p = span(t, 44.9, 45.3);
      levelRef.current.style.transform = `scale(${1 + Math.sin(clamp(p) * Math.PI) * 0.22})`;
      levelRef.current.style.color = flipped ? 'var(--color-sun)' : 'var(--color-cream)';
    }
  });

  return (
    <AdScene id="victory">
      <div ref={shakeRef} className="flex flex-col items-center gap-[2.6vmin]" style={{ willChange: 'transform' }}>
        <div
          ref={winRef}
          className="border-[0.9vmin] border-sun px-[5vmin] py-[1.4vmin] font-display text-[8vmin] font-bold leading-none text-sun"
          style={{ opacity: 0, willChange: 'transform, opacity' }}
        >
          WINNER
        </div>

        <div ref={cardRef} style={{ opacity: 0, willChange: 'transform, opacity' }}>
          <HudFrame tone="sun" className="w-[62vmin] rounded-[1.8vmin] px-[3vmin] py-[2.6vmin]">
            <div className="flex items-center gap-[2vmin]">
              <div
                className="h-[9vmin] w-[9vmin] rounded-full border-[0.4vmin] border-ink bg-aqua"
                style={{ boxShadow: '0 0.8vmin 0 var(--color-ink)' }}
              />
              <div className="flex flex-col">
                <span className="font-display text-[3.4vmin] font-bold leading-none text-cream">kessler</span>
                <span ref={levelRef} className="font-mono text-[1.5vmin] tracking-[0.3em] text-cream" style={{ willChange: 'transform' }}>
                  LEVEL 07
                </span>
              </div>

              <div ref={rewardsRef} className="ml-auto flex flex-col items-end gap-[0.5vmin]">
                {[
                  { label: '+250 XP', tone: 'text-sun' },
                  { label: 'BATTLE +1', tone: 'text-mint' },
                  { label: 'LEVEL UP', tone: 'text-aqua' },
                ].map((reward) => (
                  <span
                    key={reward.label}
                    className={`font-display text-[2vmin] font-bold ${reward.tone}`}
                    style={{ opacity: 0, willChange: 'transform, opacity' }}
                  >
                    {reward.label}
                  </span>
                ))}
              </div>
            </div>

            <div className="mt-[2.2vmin] h-[1.6vmin] overflow-hidden rounded-full border-2 border-ink bg-white/[0.06]">
              <div
                ref={xpBarRef}
                className="h-full origin-left bg-linear-to-r from-sun to-flame"
                style={{ transform: 'scaleX(0)', willChange: 'transform' }}
              />
            </div>

            <div className="mt-[1.4vmin] flex items-center justify-between font-mono text-[1.2vmin] tracking-[0.28em] text-cream/45">
              <span>RECORD UPDATED</span>
              <Ticker to={1284} from={43.4} duration={1.4} className="text-sun tabular-nums" />
            </div>
          </HudFrame>
        </div>
      </div>
    </AdScene>
  );
}
