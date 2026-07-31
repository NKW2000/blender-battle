'use client';

import type { NotificationItem } from '@bb/shared';
import Link from 'next/link';
import { useEffect, useRef, useState } from 'react';

import { Button } from '@/components/ui/button';
import { BellIcon } from '@/components/ui/icons';
import {
  useMarkAllRead,
  useMarkRead,
  useNotifications,
  useUnreadCount,
} from '@/features/notifications/use-notifications';
import { cn } from '@/lib/utils';

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
          className="absolute right-0 z-50 mt-2.5 max-h-[28rem] w-80 overflow-y-auto rounded-[16px] border-4 border-edge bg-panel-raised"
          style={{ boxShadow: '0 8px 0 var(--color-edge)', animation: 'bbPop .16s ease both' }}
        >
          <div className="flex items-center justify-between border-b-[3px] border-edge px-4 py-2.5">
            <span className="eyebrow text-aqua">Notifications</span>
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

          {items.length === 0 ? (
            <p className="px-4 py-8 text-center text-sm text-bone-muted">
              Nothing yet. Battle results and unlocks land here.
            </p>
          ) : (
            <ul className="divide-y divide-edge/60">
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
            <div className="border-t-[3px] border-edge p-2">
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

function NotificationRow({ item, onOpen }: { item: NotificationItem; onOpen: () => void }) {
  const body = (
    <div className="flex gap-3 px-4 py-3">
      {/* Unread is marked by a dot AND by weight, never by colour alone. */}
      <span
        aria-hidden="true"
        className={cn(
          'mt-1.5 h-1.5 w-1.5 shrink-0',
          item.readAt ? 'bg-transparent' : 'bg-select',
        )}
      />
      <div className="min-w-0">
        <p className={cn('text-sm', item.readAt ? 'text-bone-muted' : 'text-bone')}>
          {item.title}
        </p>
        {item.body ? (
          <p className="mt-0.5 truncate font-mono text-xs text-bone-faint">{item.body}</p>
        ) : null}
        <p className="mt-1 font-mono text-[0.625rem] text-bone-faint">
          {new Date(item.createdAt).toLocaleString()}
        </p>
      </div>
    </div>
  );

  return (
    <li className="hover:bg-panel-raised">
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
