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
      className="flex min-h-[60vh] flex-col items-center justify-center gap-5"
    >
      {/* Three cubes in a row, pulsing in sequence — the same shapes the rest of
          the language uses, rather than a generic spinner. */}
      <div className="flex items-end gap-2.5" aria-hidden="true">
        {[0, 1, 2].map((index) => (
          <span
            key={index}
            className="h-5 w-5 rounded-[5px] border-[3px] border-edge"
            style={{
              background: ['#FF7A18', '#FFD23F', '#5EF0DE'][index],
              boxShadow: '0 4px 0 var(--color-edge)',
              animation: `bbLoadHop .72s ${index * 0.12}s cubic-bezier(.4,0,.2,1) infinite`,
            }}
          />
        ))}
      </div>

      <p className="font-display text-sm font-bold uppercase tracking-[3px] text-bone-faint">
        {label}
      </p>
    </div>
  );
}
