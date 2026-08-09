'use client';

import { Slot, Slottable } from '@radix-ui/react-slot';
import { cva, type VariantProps } from 'class-variance-authority';
import * as React from 'react';

import { useSound } from '@/features/sound/use-sound';
import { cn } from '@/lib/utils';

/**
 * The arcade button.
 *
 * The whole look rests on one idea: a thick ink outline plus a hard offset
 * shadow directly below, so the control reads as a physical object with height.
 * Pressing it translates down by exactly the shadow offset and removes the
 * shadow, which is why `--press-depth` is set per size rather than shared.
 */
const chunkyButton = cva(
  'arcade-press arcade-focus relative inline-flex items-center justify-center gap-2 font-arcade font-bold border-ink text-ink cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed',
  {
    variants: {
      tone: {
        flame: 'bg-linear-to-b from-flame-lift to-flame text-ink',
        sun: 'bg-sun text-ink',
        aqua: 'bg-linear-to-b from-mint to-aqua text-ink',
        cream: 'bg-cream text-ink',
        // Irreversible actions only. Distinct from `flame`, which is the
        // primary "go" button — the two must never be mistaken for each other
        // in a confirmation dialog.
        danger: 'bg-linear-to-b from-[#FF6FA8] to-punch text-ink',
        // The only variant without an outline: a quiet action that should not
        // compete with the primary object next to it.
        ghost:
          'bg-white/8 text-cream border-white/28 hover:bg-white/16 !shadow-none hover:!translate-y-0 active:!translate-y-0',
      },
      size: {
        sm: 'text-sm rounded-xl border-2 px-4 py-2 [--press-depth:3px]',
        md: 'text-base rounded-2xl border-[3px] px-6 py-3 [--press-depth:5px]',
        lg: 'text-xl rounded-[18px] border-4 px-8 py-4 [--press-depth:8px]',
        xl: 'text-2xl rounded-[20px] border-4 px-12 py-5 [--press-depth:9px]',
      },
    },
    defaultVariants: { tone: 'flame', size: 'lg' },
  },
);

const SHADOW: Record<string, string> = {
  sm: '0 3px 0 var(--color-ink)',
  md: '0 5px 0 var(--color-ink)',
  lg: '0 8px 0 var(--color-ink)',
  xl: '0 9px 0 var(--color-ink)',
};

export interface ChunkyButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof chunkyButton> {
  asChild?: boolean;
  /** Adds the sweeping highlight used on the primary call to action. */
  sheen?: boolean;
}

export const ChunkyButton = React.forwardRef<HTMLButtonElement, ChunkyButtonProps>(
  ({ className, tone, size = 'lg', asChild, sheen, children, style, onClick, ...props }, ref) => {
    const Comp = asChild ? Slot : 'button';
    const play = useSound();

    return (
      <Comp
        ref={ref}
        className={cn(chunkyButton({ tone, size }), sheen && 'overflow-hidden', className)}
        style={{ boxShadow: SHADOW[size as string], ...style }}
        onClick={(event: React.MouseEvent<HTMLButtonElement>) => {
          // Sound first so it fires even if the handler navigates away.
          play('press');
          onClick?.(event);
        }}
        {...props}
      >
        {sheen ? (
          <span
            aria-hidden="true"
            className="pointer-events-none absolute left-0 top-0 h-full w-[38%] -skew-x-12 bg-linear-to-r from-transparent via-white/55 to-transparent"
            style={{ animation: 'bbSheen 3.4s ease-in-out infinite' }}
          />
        ) : null}
        {/*
          Slottable, not a bare {children}: with asChild the Slot accepts exactly
          one element child, and the sheen span above would be a second one. This
          marks which child the Slot should merge into, letting the decoration
          coexist with an asChild <Link>.
        */}
        <Slottable>{children}</Slottable>
      </Comp>
    );
  },
);
ChunkyButton.displayName = 'ChunkyButton';

/** A card with the same outline-and-shadow construction as the buttons. */
export function ChunkyCard({
  className,
  children,
  ...props
}: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn('rounded-3xl border-4 border-ink', className)}
      style={{ boxShadow: '0 12px 0 var(--color-ink)' }}
      {...props}
    >
      {children}
    </div>
  );
}

/**
 * The rotated square mark used as the wordmark's logo.
 *
 * Sun yellow, not flame. The sign-in and sign-up screens had always drawn this
 * mark by hand in `bg-sun` while this component used an orange gradient, so the
 * same logo arrived in two colours depending on which page you were on. Yellow
 * is the one that was already on the way in, and it reads against both the dark
 * ground and the orange panels that flame disappeared into.
 */
export function ArcadeLogo({ size = 40 }: { size?: number }) {
  return (
    <div
      aria-hidden="true"
      className="flex shrink-0 rotate-45 items-center justify-center rounded-xl border-[3px] border-ink bg-sun"
      style={{ width: size, height: size, boxShadow: '0 4px 0 var(--color-ink)' }}
    >
      <div className="rounded-[3px] bg-ink" style={{ width: size * 0.32, height: size * 0.32 }} />
    </div>
  );
}

export function ArcadeWordmark({ size = 22 }: { size?: number }) {
  return (
    <span
      className="font-arcade font-bold tracking-wide text-cream"
      style={{ fontSize: size }}
    >
      BLENDER<span className="text-flame">BATTLE</span>
    </span>
  );
}

/** The pill used for status lines like "Season 4 · Live now". */
export function LivePill({
  children,
  tone = 'punch',
}: {
  children: React.ReactNode;
  tone?: 'punch' | 'aqua';
}) {
  const isPunch = tone === 'punch';

  return (
    <div
      className={cn(
        'inline-flex items-center gap-2 rounded-full border-2 px-4 py-1.5 font-arcade-body text-xs font-black uppercase tracking-[1.5px]',
        isPunch ? 'border-punch bg-punch/15 text-punch-soft' : 'border-aqua bg-aqua/15 text-aqua',
      )}
    >
      <span
        aria-hidden="true"
        className={cn('h-2 w-2 rounded-full', isPunch ? 'bg-punch' : 'bg-aqua')}
        style={{ animation: 'bbTwinkle 1.6s infinite' }}
      />
      {children}
    </div>
  );
}
