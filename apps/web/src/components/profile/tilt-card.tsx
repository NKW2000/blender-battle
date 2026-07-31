'use client';

import { useRef, useState } from 'react';

import { cn } from '@/lib/utils';

/**
 * A card that leans toward the pointer.
 *
 * The rotation is written straight to the element's style rather than held in
 * React state: this fires on every pointermove, and re-rendering a subtree at
 * pointer frequency is what turns a tilt into jank. Only the "is the pointer
 * over me" flag is state, because that one changes rarely and drives the shadow.
 *
 * `prefers-reduced-motion` disables the tilt entirely — a card that pitches
 * under the cursor is exactly the kind of vestibular trigger that setting is for.
 * The card keeps its hover shadow, so the affordance survives.
 */
export function TiltCard({
  children,
  className,
  maxTilt = 9,
}: {
  children: React.ReactNode;
  className?: string;
  /** Degrees at the far edge. Past ~12 the perspective reads as a fisheye. */
  maxTilt?: number;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [lifted, setLifted] = useState(false);

  const reduced = () =>
    typeof window !== 'undefined' &&
    window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  const onPointerMove = (event: React.PointerEvent<HTMLDivElement>) => {
    const node = ref.current;
    if (!node || reduced()) return;

    const rect = node.getBoundingClientRect();
    // -1..1 from the centre of the card.
    const x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
    const y = ((event.clientY - rect.top) / rect.height) * 2 - 1;

    // Y drives rotateX inverted: pointer above centre should tip the top away.
    node.style.transform = `perspective(900px) rotateX(${(-y * maxTilt).toFixed(2)}deg) rotateY(${(x * maxTilt).toFixed(2)}deg) translateZ(0)`;
  };

  const reset = () => {
    setLifted(false);
    const node = ref.current;
    if (!node) return;
    node.style.transform = 'perspective(900px) rotateX(0deg) rotateY(0deg) translateZ(0)';
  };

  return (
    <div
      ref={ref}
      onPointerMove={onPointerMove}
      onPointerEnter={() => setLifted(true)}
      onPointerLeave={reset}
      className={cn('will-change-transform', className)}
      style={{
        // Only the settle-back is transitioned. Transitioning the live tilt too
        // would add a lag between pointer and card that reads as sluggish.
        transition: lifted ? 'box-shadow .2s ease' : 'transform .35s ease, box-shadow .2s ease',
        transformStyle: 'preserve-3d',
      }}
    >
      {children}
    </div>
  );
}
