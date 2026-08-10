import { afterEach, describe, expect, it, vi } from 'vitest';

import {
  osNotificationPermission,
  requestOsNotifications,
  showOsNotification,
} from './os-notifications';

/**
 * Notifications in the OS tray.
 *
 * Every failure here is silent by construction — a tray entry that never
 * appears looks exactly like one nobody happened to see, and the in-app badge
 * stays correct either way. So the guards are the thing worth asserting: that
 * nothing is posted without permission, that a browser without the API is not
 * a crash, and that a click carries the link the row was about.
 */

afterEach(() => {
  vi.unstubAllGlobals();
});

/** Replaces the Notification global with one that records what it was given. */
function stubNotification(permission: NotificationPermission) {
  const posted: Array<{ title: string; options?: NotificationOptions }> = [];

  class FakeNotification {
    static permission = permission;
    static requestPermission = vi.fn(async () => 'granted' as NotificationPermission);
    onclick: (() => void) | null = null;
    close = vi.fn();

    constructor(title: string, options?: NotificationOptions) {
      posted.push({ title, options });
    }
  }

  vi.stubGlobal('Notification', FakeNotification);
  // No service worker: exercises the direct-constructor fallback path.
  vi.stubGlobal('navigator', { serviceWorker: undefined });
  return { posted, FakeNotification };
}

describe('permission', () => {
  it('reports unsupported rather than throwing when the API is absent', () => {
    // Server render and older Safari both land here. Reading `Notification`
    // unguarded would be a ReferenceError during SSR.
    vi.stubGlobal('Notification', undefined);
    expect(osNotificationPermission()).toBe('unsupported');
  });

  it('reads the browser’s current answer', () => {
    stubNotification('denied');
    expect(osNotificationPermission()).toBe('denied');
  });

  it('does not ask a browser that cannot answer', async () => {
    vi.stubGlobal('Notification', undefined);
    await expect(requestOsNotifications()).resolves.toBe('unsupported');
  });

  it('treats a thrown request as a refusal', async () => {
    // Older Safari rejects instead of resolving. A refusal to ask and a refusal
    // to grant are the same outcome to every caller.
    const { FakeNotification } = stubNotification('default');
    FakeNotification.requestPermission = vi.fn(async () => {
      throw new Error('not allowed');
    });

    await expect(requestOsNotifications()).resolves.toBe('denied');
  });
});

describe('posting', () => {
  it('posts nothing without permission', () => {
    const { posted } = stubNotification('default');
    showOsNotification({ title: 'Room started' });
    expect(posted).toHaveLength(0);
  });

  it('posts nothing once denied', () => {
    const { posted } = stubNotification('denied');
    showOsNotification({ title: 'Room started' });
    expect(posted).toHaveLength(0);
  });

  it('carries the title, body, icon and link when granted', () => {
    const { posted } = stubNotification('granted');
    showOsNotification({
      title: '"Test" has started',
      body: 'The brief is Horn.',
      link: '/rooms/abc',
      tag: 'notification-1',
    });

    expect(posted).toHaveLength(1);
    expect(posted[0]!.title).toBe('"Test" has started');
    expect(posted[0]!.options).toMatchObject({
      body: 'The brief is Horn.',
      tag: 'notification-1',
      icon: '/icon-192.png',
      data: { link: '/rooms/abc' },
    });
  });

  it('tags the notification so repeats collapse instead of stacking', () => {
    /*
      The listener polls. Without a tag, the same room result arriving across
      several cycles would leave several identical entries in the tray — the
      behaviour every native app is careful to avoid.
    */
    const { posted } = stubNotification('granted');
    showOsNotification({ title: 'Result', tag: 'n-7' });
    expect(posted[0]!.options?.tag).toBe('n-7');
  });

  it('falls back to the root when a notification has no link', () => {
    const { posted } = stubNotification('granted');
    showOsNotification({ title: 'Something happened', link: null });
    expect(posted[0]!.options?.data).toEqual({ link: '/' });
  });

  it('does not throw when constructing one fails', () => {
    // Insecure origins and iframes both throw here. A missed tray entry must
    // never take down the poll that produced it.
    vi.stubGlobal(
      'Notification',
      class {
        static permission: NotificationPermission = 'granted';
        constructor() {
          throw new Error('not allowed in this context');
        }
      },
    );
    vi.stubGlobal('navigator', { serviceWorker: undefined });

    expect(() => showOsNotification({ title: 'Room started' })).not.toThrow();
  });
});
