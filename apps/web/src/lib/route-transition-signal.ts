/**
 * The way something that is not a link asks for the full navigation cover.
 *
 * A plain event rather than a shared React context or a callback threaded down:
 * the two callers are mutations in `use-session`, and the listener is a single
 * component mounted once at the root. A context would mean every consumer of
 * the session hook re-rendering for something none of them care about.
 *
 * It lives here rather than beside the component so that importing it does not
 * drag a client component — and the whole loading lockup with it — into every
 * module that happens to use the session.
 */
export const COVER_NAVIGATION_EVENT = 'bb:cover-navigation';

/**
 * Requests the full cover for the navigation that is about to happen.
 *
 * Signing in and signing out are `router.push` calls inside mutations, so the
 * transition's click listener never sees them — and they are two of the three
 * moments the full panel exists for. Call this immediately before the push.
 */
export function coverNextNavigation() {
  if (typeof window === 'undefined') return;
  window.dispatchEvent(new CustomEvent(COVER_NAVIGATION_EVENT));
}
