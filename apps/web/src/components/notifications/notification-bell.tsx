'use client';

import type { NotificationItem } from '@bb/shared';
import Link from 'next/link';
import { useEffect, useRef, useState } from 'react';

import { Button } from '@/components/ui/button';
import { BellIcon } from '@/components/ui/icons';
import { PANEL_ICON, PanelIcon } from '@/components/ui/panel';
import { ChunkyButton } from '@/components/arcade/chunky';
import {
  osNotificationPermission,
  requestOsNotifications,
  type OsNotificationPermission,
} from '@/features/notifications/os-notifications';
import {
  useMarkAllRead,
  useMarkRead,
  useNotifications,
  useUnreadCount,
} from '@/features/notifications/use-notifications';
import { UI_LOCALE, cn } from '@/lib/utils';

/**
 * The inbox, as a dropdown in the header.
 *
 * Opening the panel does NOT mark everything read — a glance at a list is not
 * the same as having read it, and silently clearing the badge loses the one
 * signal that says "there is something here you have not seen". Reading is an
 * explicit act: clicking a row, or the "Mark all read" control.
 */
export function NotificationBell() {
  const [open, setOpen] = useState(false);
  const { data: unread } = useUnreadCount();
  const notifications = useNotifications();
  const markRead = useMarkRead();
  const markAllRead = useMarkAllRead();
  const containerRef = useRef<HTMLDivElement>(null);

  const count = unread?.count ?? 0;
  const items = notifications.data?.pages.flatMap((page) => page.items) ?? [];

  // Click-outside and Escape both close it — a dropdown that can only be closed
  // by the button that opened it is a trap for keyboard users.
  useEffect(() => {
    if (!open) return;

    const onPointerDown = (event: MouseEvent) => {
      if (!containerRef.current?.contains(event.target as Node)) setOpen(false);
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setOpen(false);
    };

    document.addEventListener('mousedown', onPointerDown);
    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('mousedown', onPointerDown);
      document.removeEventListener('keydown', onKeyDown);
    };
  }, [open]);

  return (
    <div ref={containerRef} className="relative">
      <button
        type="button"
        onClick={() => setOpen((value) => !value)}
        aria-expanded={open}
        aria-haspopup="menu"
        aria-label={count > 0 ? `Notifications, ${count} unread` : 'Notifications'}
        className="arcade-focus relative flex h-11 w-11 items-center justify-center rounded-xl border-2 border-white/20 bg-white/6 transition-colors hover:border-white/40"
      >
        {/* Rings only while something is actually unread — a bell that swings
            with an empty inbox is decoration pretending to be a signal. */}
        <BellIcon size={26} animate={count > 0} />
        {count > 0 ? (
          <span
            aria-hidden="true"
            className="absolute -right-1.5 -top-1.5 flex h-5 min-w-5 items-center justify-center rounded-full border-2 border-edge bg-punch px-1 font-display text-[0.6875rem] font-bold text-cream"
            style={{ boxShadow: '0 2px 0 var(--color-edge)' }}
          >
            {count > 9 ? '9+' : count}
          </span>
        ) : null}
      </button>

      {open ? (
        <div
          role="menu"
          /*
            Centred on a phone, anchored to the bell from md up.

            The panel is 320px wide and hangs from a button that sits in the
            far corner, so on a narrow screen it ran off the left edge. Below md
            it is therefore positioned against the viewport instead: `fixed`
            works here because the header it lives in is full width and pinned
            to the top, so the header's box and the viewport's agree on where
            the centre is.

            The width is clamped rather than fixed, so it still fits a 320px
            screen with a margin either side.
          */
          className={cn(
            // The block, like every other surface: 22px radius, 3px ink
            // outline, 0 8px 0. It was a 16px radius and a 4px outline on the
            // opaque indigo, which is the one panel language the application no
            // longer speaks anywhere else.
            'z-50 max-h-[28rem] overflow-y-auto rounded-[22px] border-[3px] border-ink bg-arcade-panel',
            'fixed left-1/2 top-[4.25rem] w-[calc(100vw-2rem)] max-w-sm -translate-x-1/2',
            'md:absolute md:left-auto md:right-0 md:top-full md:mt-2.5 md:w-80 md:max-w-none md:translate-x-0',
          )}
          style={{ boxShadow: '0 8px 0 var(--color-ink)', animation: 'bbPop .16s ease both' }}
        >
          <div className="sticky top-0 z-10 flex items-center justify-between gap-3 rounded-t-[19px] border-b-[3px] border-ink bg-arcade-panel px-4 py-3">
            <div className="flex items-center gap-2.5">
              <PanelIcon tone="punch">{PANEL_ICON.clock}</PanelIcon>
              <span className="font-display text-base font-bold text-cream">Notifications</span>
            </div>
            {count > 0 ? (
              <Button
                variant="ghost"
                size="sm"
                onClick={() => markAllRead.mutate()}
                disabled={markAllRead.isPending}
              >
                Mark all read
              </Button>
            ) : null}
          </div>

          <DesktopAlertsRow />

          {items.length === 0 ? (
            <p className="px-4 py-10 text-center text-sm font-extrabold text-haze-5">
              Nothing yet. Room results and challenge news land here.
            </p>
          ) : (
            <ul className="flex flex-col gap-2 p-2.5">
              {items.map((item) => (
                <NotificationRow
                  key={item.id}
                  item={item}
                  onOpen={() => {
                    if (!item.readAt) markRead.mutate(item.id);
                    setOpen(false);
                  }}
                />
              ))}
            </ul>
          )}

          {notifications.hasNextPage ? (
            <div className="border-t-[3px] border-ink p-2">
              <Button
                variant="ghost"
                size="sm"
                className="w-full"
                onClick={() => notifications.fetchNextPage()}
                disabled={notifications.isFetchingNextPage}
              >
                {notifications.isFetchingNextPage ? 'Loading…' : 'Older'}
              </Button>
            </div>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}

/**
 * Opt in to the OS notification tray.
 *
 * A button rather than an effect on mount: every browser refuses a permission
 * request that did not come from a click, and asking on load is how a site
 * teaches someone to hit Block for everything it will ever send. It appears
 * only while the answer is still "not asked" — once granted it has nothing to
 * say, and once denied the browser will not ask again, so a button that cannot
 * work would be worse than none.
 */
function DesktopAlertsRow() {
  const [permission, setPermission] = useState<OsNotificationPermission>('unsupported');

  // Read after mount: `Notification.permission` does not exist on the server,
  // and reading it during render would make the markup differ between the two.
  useEffect(() => setPermission(osNotificationPermission()), []);

  if (permission !== 'default') return null;

  return (
    <div className="flex items-center justify-between gap-3 border-b-[3px] border-ink px-3.5 py-3">
      <p className="min-w-0 text-xs font-extrabold leading-relaxed text-haze">
        Get these in your desktop notifications, even with the tab in the background.
      </p>
      <ChunkyButton
        size="sm"
        tone="cream"
        className="shrink-0"
        onClick={() => {
          void requestOsNotifications().then(setPermission);
        }}
      >
        Turn on
      </ChunkyButton>
    </div>
  );
}

function NotificationRow({ item, onOpen }: { item: NotificationItem; onOpen: () => void }) {
  const body = (
    <div className="flex min-w-0 gap-3 px-3.5 py-3">
      {/* Unread is marked by a dot AND by weight, never by colour alone. */}
      <span
        aria-hidden="true"
        className={cn(
          'mt-[7px] h-2 w-2 shrink-0 rounded-[3px] border-[1.5px]',
          item.readAt ? 'border-transparent bg-transparent' : 'border-ink bg-sun',
        )}
      />
      <div className="min-w-0">
        <p
          className={cn(
            'font-display text-sm font-bold',
            item.readAt ? 'text-haze' : 'text-cream',
          )}
        >
          {item.title}
        </p>
        {/* Wraps to two lines rather than truncating to one. A notification body
            is the sentence that says what happened; a single clipped line of it
            was rarely enough to know whether the row was worth opening. */}
        {item.body ? (
          <p className="mt-0.5 line-clamp-2 text-xs font-extrabold leading-relaxed text-haze-5">
            {item.body}
          </p>
        ) : null}
        <p className="mt-1.5 text-[11px] font-extrabold text-haze-6">
          {new Date(item.createdAt).toLocaleString(UI_LOCALE)}
        </p>
      </div>
    </div>
  );

  return (
    <li
      className={cn(
        'min-w-0 overflow-hidden rounded-[14px] border-[2.5px] border-ink transition-colors',
        item.readAt ? 'bg-white/4 hover:bg-white/8' : 'bg-sun/8 hover:bg-sun/14',
      )}
      style={{ boxShadow: '0 3px 0 var(--color-ink)' }}
    >
      {item.link ? (
        <Link href={item.link} onClick={onOpen} className="block">
          {body}
        </Link>
      ) : (
        <button type="button" onClick={onOpen} className="block w-full text-left">
          {body}
        </button>
      )}
    </li>
  );
}
