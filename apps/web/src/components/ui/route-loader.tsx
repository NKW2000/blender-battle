/**
 * The loading screen shown while a route is being fetched or streamed.
 *
 * Rendered from `loading.tsx` files, so React shows it automatically the moment
 * a navigation starts and swaps it out when the segment is ready — no router
 * events to subscribe to and no state that can get stuck on.
 *
 * A server component on purpose: it must be able to render before any client
 * JavaScript for the destination has been downloaded, which is exactly the gap
 * it exists to fill.
 */
export function RouteLoader({ label = 'Loading' }: { label?: string }) {
  return (
    <div
      role="status"
      aria-live="polite"
      /*
        Sized to the viewport minus exactly what sits above and below it: a
        3.5rem header plus the page's own vertical padding, which is 1.5rem each
        side below sm and 2.5rem from sm up. Reserving more than that — as a flat
        9rem did — makes the box shorter than the space it fills, so it centres
        against the wrong height.
      */
      className="relative flex min-h-[calc(100dvh-6.5rem)] items-center justify-center sm:min-h-[calc(100dvh-8.5rem)]"
    >
      {/* Three cubes in a row, pulsing in sequence — the same shapes the rest of
          the language uses, rather than a generic spinner. */}
      <div className="flex items-end gap-2.5" aria-hidden="true">
        {[0, 1, 2].map((index) => (
          <span
            key={index}
            className="h-5 w-5 rounded-[5px] border-[3px] border-edge"
            style={{
              background: ['#FFD23F', '#FF3D9A', '#5EF0DE'][index],
              boxShadow: '0 4px 0 var(--color-edge)',
              animation: `bbLoadHop .72s ${index * 0.12}s cubic-bezier(.4,0,.2,1) infinite`,
            }}
          />
        ))}
      </div>

      {/*
        Positioned rather than stacked. In a centred column the caption is part
        of what gets centred, so the cubes — the thing the eye actually tracks —
        sat half the caption's height above the middle and read as misaligned.
        Out of flow, the cubes hold the centre exactly and the caption hangs
        beneath them.
      */}
      <p className="absolute left-1/2 top-1/2 mt-9 -translate-x-1/2 whitespace-nowrap font-display text-sm font-bold uppercase tracking-[3px] text-bone-faint">
        {label}
      </p>
    </div>
  );
}
