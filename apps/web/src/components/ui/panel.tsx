import * as React from 'react';

import { cn } from '@/lib/utils';

/**
 * The application surface, on the arcade language.
 *
 * Raised indigo gradient, thick ink outline, hard offset shadow. Used for every
 * panel across the app, so restyling it here is what carries the language onto
 * screens that were never individually touched.
 */
export function Panel({
  className,
  active,
  children,
  ...props
}: React.HTMLAttributes<HTMLDivElement> & { active?: boolean }) {
  return (
    <div
      data-active={active ? 'true' : undefined}
      className={cn(
        'rounded-[24px] border-4 border-edge bg-linear-to-b from-panel-raised to-panel',
        // Active panels get the accent outline rather than corner marks; same
        // meaning, expressed the way this language expresses it.
        active && 'border-select',
        className,
      )}
      style={{ boxShadow: '0 12px 0 var(--color-edge)' }}
      {...props}
    >
      {children}
    </div>
  );
}

export function PanelHeader({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn(
        'flex items-center justify-between gap-3 border-b-[3px] border-edge px-6 py-4',
        className,
      )}
      {...props}
    />
  );
}

export function PanelTitle({ className, ...props }: React.HTMLAttributes<HTMLHeadingElement>) {
  return (
    <h2 className={cn('font-display text-lg font-bold text-bone', className)} {...props} />
  );
}

export function PanelBody({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return <div className={cn('p-6', className)} {...props} />;
}

/** Loading placeholder. Rounded to match the surfaces it stands in for. */
export function Skeleton({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      aria-hidden="true"
      className={cn('animate-pulse rounded-2xl bg-white/8', className)}
      {...props}
    />
  );
}

/** Empty states carry the action, so the screen is an invitation rather than a dead end. */
export function EmptyState({
  title,
  description,
  action,
}: {
  title: string;
  description: string;
  action?: React.ReactNode;
}) {
  return (
    <div className="flex flex-col items-center gap-3 px-6 py-16 text-center">
      <div
        aria-hidden="true"
        className="h-3 w-12 rounded-full border-2 border-edge bg-sun"
        style={{ boxShadow: '0 3px 0 var(--color-edge)' }}
      />
      <p className="mt-1 font-display text-xl font-bold text-bone">{title}</p>
      <p className="max-w-sm font-bold text-bone-muted">{description}</p>
      {action}
    </div>
  );
}
