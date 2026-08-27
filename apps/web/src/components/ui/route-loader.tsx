import {
  LOADING_DOTS_BACKDROP,
  LOADING_PANEL_BACKGROUND,
  LoadingMark,
} from '@/components/ui/loading-mark';

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
 *
 * It carries the same panel as the navigation cover, minus the bars. The bars
 * are a transition — they sweep in from somewhere — and there is nowhere to
 * sweep from when you have arrived on a URL cold. What stays is the part that
 * says which product you are waiting for.
 */
export function RouteLoader({ label = 'Loading' }: { label?: string }) {
  return (
    <div
      role="status"
      aria-live="polite"
      aria-label={label}
      /*
        Sized to the viewport minus exactly what sits above and below it: a
        3.5rem header plus the page's own vertical padding, which is 1.5rem each
        side below sm and 2.5rem from sm up.
      */
      className="relative flex min-h-[calc(100dvh-6.5rem)] items-center justify-center overflow-hidden rounded-[24px] border-[3px] border-ink sm:min-h-[calc(100dvh-8.5rem)]"
      style={{ background: LOADING_PANEL_BACKGROUND }}
    >
      <div className="pointer-events-none absolute inset-0" style={LOADING_DOTS_BACKDROP} />
      <LoadingMark />
    </div>
  );
}
