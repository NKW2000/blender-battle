'use client';

/**
 * Notifications in the operating system's own notification centre.
 *
 * The application already told you about a room starting — in a toast, inside
 * the tab, which is the one place you are not looking when you have switched
 * away to Blender. That is the entire point of the feature and it was the one
 * case it did not cover.
 *
 * ## What this does and does not do
 *
 * This is the Notifications API, not Web Push. It posts to the OS notification
 * centre — the same tray WhatsApp and Slack use — while the page is *alive*:
 * focused, in a background tab, or behind another window. It cannot deliver
 * anything once the tab is closed, because there is no code running to deliver
 * it.
 *
 * Reaching a closed tab needs a service worker holding a push subscription and
 * a server pushing to it through VAPID, which is a schema change, a key pair,
 * and a send path on the API. That is a genuinely different piece of work and
 * it is deliberately not pretended at here: what is built is the part that
 * covers "I alt-tabbed to Blender and missed the deadline", which is the case
 * that actually loses someone a contest.
 */

export type OsNotificationPermission = 'unsupported' | 'default' | 'granted' | 'denied';

/** Server-rendered and older browsers both land on `unsupported`. */
export function osNotificationPermission(): OsNotificationPermission {
  /*
    Both halves matter. The key is absent entirely on older Safari and during a
    server render; it is *present but undefined* in some embedded webviews and
    under test doubles, where an `in` check alone passes and the property read
    that follows throws.
  */
  if (typeof window === 'undefined' || typeof Notification === 'undefined') {
    return 'unsupported';
  }
  return Notification.permission as Exclude<OsNotificationPermission, 'unsupported'>;
}

/**
 * Asks, once, from a click.
 *
 * Browsers refuse this outside a user gesture — Chrome and Firefox both reject
 * a request that was not triggered by an interaction, and Safari requires it —
 * so this must be wired to a button and never to a mount effect. Asking on load
 * is also how a site trains someone to hit Block for everything it ever sends.
 */
export async function requestOsNotifications(): Promise<OsNotificationPermission> {
  if (osNotificationPermission() === 'unsupported') return 'unsupported';

  try {
    return (await Notification.requestPermission()) as OsNotificationPermission;
  } catch {
    // Safari on older versions rejects rather than resolving. A refusal to ask
    // is the same outcome as a refusal to grant, as far as callers care.
    return 'denied';
  }
}

/**
 * Posts one notification, and focuses the app if it is clicked.
 *
 * `tag` collapses repeats: without it, four poll cycles carrying the same room
 * result would stack four identical entries in the tray. With it, the newest
 * replaces the previous one in place, which is what every native app does.
 */
export function showOsNotification({
  title,
  body,
  link,
  tag,
}: {
  title: string;
  body?: string;
  link?: string | null;
  tag?: string;
}): void {
  if (osNotificationPermission() !== 'granted') return;

  const options: NotificationOptions = {
    body,
    tag,
    icon: '/icon-192.png',
    badge: '/icon-192.png',
    data: { link: link ?? '/' },
  };

  /** The page-owned notification. Used when no worker is available to own one. */
  const direct = () => {
    try {
      const notification = new Notification(title, options);
      notification.onclick = () => {
        window.focus();
        if (link) window.location.href = link;
        notification.close();
      };
    } catch {
      // Insecure origins and iframes both throw here. A missed tray entry is
      // cosmetic — the badge and the in-app list are already correct.
    }
  };

  /*
    Through the service worker when there is one.

    A worker-owned notification outlives the page that posted it, and its click
    is handled by the worker, which can focus an already-open tab instead of
    opening a second one. On Android Chrome it is not merely better — the bare
    constructor throws there, because a notification must come from a worker.

    The `serviceWorker` reference is resolved before the chain rather than with
    optional chaining through it: `navigator.serviceWorker?.ready.then(...)`
    short-circuits the *whole expression* to undefined when there is no worker,
    so the fallback would never run and nothing would be posted at all.
  */
  const worker = typeof navigator === 'undefined' ? undefined : navigator.serviceWorker;
  if (!worker) {
    direct();
    return;
  }

  void worker.ready
    .then((registration) => registration.showNotification(title, options))
    .catch(direct);
}
