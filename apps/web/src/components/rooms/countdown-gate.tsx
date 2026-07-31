'use client';

import { useEffect } from 'react';

import { useSound } from '@/features/sound/use-sound';

/**
 * The 3-2-1 shown between the brief being drawn and the modelling clock starting.
 *
 * `seconds` comes from the server-derived deadline, not a local timer, so every
 * client in the room hits zero together regardless of clock skew.
 */
export function CountdownGate({ seconds }: { seconds: number }) {
  // Clamped rather than trusted: a stale or skewed snapshot could hand this a
  // negative or absurd value, and the gate must still render something sane.
  const display = Math.max(0, Math.min(99, Math.ceil(seconds)));
  const play = useSound();

  // Keyed on the whole number, so it fires once per second rather than on every
  // re-render the countdown hook triggers between ticks.
  useEffect(() => {
    play(display === 0 ? 'start' : 'tick');
  }, [display, play]);

  return (
    <section
      aria-live="polite"
      className="flex flex-col items-center justify-center gap-2 rounded-[24px] border-4 border-edge py-10"
      style={{
        background:
          'radial-gradient(600px 240px at 50% 0%, #2A2170 0%, #1B1550 60%, #14103A 100%)',
        boxShadow: '0 10px 0 var(--color-edge)',
      }}
    >
      <p className="eyebrow text-punch-soft">Drawing your brief</p>

      <p
        // Keyed on the number so the pop animation restarts on each tick rather
        // than playing once and sitting still for the rest of the countdown.
        key={display}
        className="font-display text-[clamp(64px,14vw,140px)] font-bold leading-none text-sun tabular-nums"
        style={{
          textShadow: '0 8px 0 rgba(14,11,43,.45)',
          animation: 'bbPop .38s cubic-bezier(.2,1.3,.35,1) both',
        }}
      >
        {display === 0 ? 'GO' : display}
      </p>

      <p className="text-sm font-extrabold text-bone-faint">
        {display === 0 ? 'Blender open — start modelling' : 'The clock starts at zero'}
      </p>
    </section>
  );
}
