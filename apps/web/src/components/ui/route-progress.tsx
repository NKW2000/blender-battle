'use client';

import { useEffect, useRef, useState } from 'react';
import { usePathname } from 'next/navigation';

/**
 * The thin progress bar across the top of the app during a navigation.
 *
 * Complements `loading.tsx`, which only appears once the destination segment
 * actually suspends. A fast route swaps in without ever suspending, so nothing
 * would acknowledge the click at all — this fires on the click itself, which is
 * the moment the user needs feedback.
 *
 * The bar creeps toward 90% on an ease-out curve and only completes when the
 * pathname changes. It never reaches 100% on its own, because a bar that fills
 * and sits there is a lie about work that has not finished.
 */
export function RouteProgress() {
  const pathname = usePathname();
  const [progress, setProgress] = useState(0);
  const [visible, setVisible] = useState(false);
  const timers = useRef<ReturnType<typeof setTimeout>[]>([]);

  const clearTimers = () => {
    timers.current.forEach(clearTimeout);
    timers.current = [];
  };

  // Any click that lands on an internal link starts the bar. Listening at the
  // document rather than wrapping every Link keeps this to one listener and
  // covers links rendered anywhere in the tree.
  useEffect(() => {
    const onClick = (event: MouseEvent) => {
      if (event.defaultPrevented || event.button !== 0) return;
      if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;

      const anchor = (event.target as HTMLElement | null)?.closest?.('a');
      if (!anchor) return;

      const href = anchor.getAttribute('href');
      if (!href || anchor.target === '_blank' || anchor.hasAttribute('download')) return;
      // Internal, and not a jump within the current page.
      if (!href.startsWith('/') || href === pathname) return;

      clearTimers();
      setVisible(true);
      setProgress(8);

      // Hand-rolled easing rather than a fixed rate: early progress is fast so
      // the bar is obviously alive, then it slows as it approaches the ceiling.
      const step = (value: number) => {
        const next = value + (90 - value) * 0.18;
        setProgress(next);
        if (next < 89) timers.current.push(setTimeout(() => step(next), 120));
      };
      timers.current.push(setTimeout(() => step(8), 120));
    };

    document.addEventListener('click', onClick, true);
    return () => document.removeEventListener('click', onClick, true);
  }, [pathname]);

  // Arrival: fill, fade out, then snap the width back to zero only after the bar
  // is fully invisible — so the empty bar never slides back across the screen.
  useEffect(() => {
    if (!visible) return;

    clearTimers();
    setProgress(100);
    const hide = setTimeout(() => setVisible(false), 240);
    // After the opacity fade (.24s) has finished. The width transition is
    // disabled while hidden, so this is an instantaneous, unseen reset.
    const reset = setTimeout(() => setProgress(0), 560);

    return () => {
      clearTimeout(hide);
      clearTimeout(reset);
    };
    // Deliberately keyed on pathname alone: this is the "navigation finished"
    // signal. Including `visible` would re-run it as the bar starts and complete
    // it instantly, which is the opposite of what it is for.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pathname]);

  useEffect(() => clearTimers, []);

  return (
    <div
      aria-hidden="true"
      className="pointer-events-none fixed inset-x-0 top-0 z-[100] h-1"
      style={{ opacity: visible ? 1 : 0, transition: 'opacity .24s ease' }}
    >
      <div
        className="h-full rounded-r-full"
        style={{
          width: `${progress}%`,
          background: 'linear-gradient(90deg,#FFE580,#FFD23F,#5EF0DE)',
          boxShadow: '0 0 12px rgba(255,210,63,.6)',
          // Animate the width only while the bar is on screen; when it is hidden
          // the reset to 0 is instant, so it is never seen travelling backwards.
          transition: visible ? 'width .18s ease-out' : 'none',
        }}
      />
    </div>
  );
}
