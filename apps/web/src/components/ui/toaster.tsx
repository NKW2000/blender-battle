'use client';

import { Toaster as SonnerToaster } from 'sonner';

/**
 * The arcade toaster.
 *
 * Sonner's own chrome is switched off entirely (`unstyled`) rather than patched:
 * its defaults are a thin-bordered, square, system-font card, and overriding
 * that piecemeal was what left the old configuration sitting at
 * `borderRadius: 0` with a 1px border while every other surface in the app had
 * moved to 3px ink outlines and hard offset shadows.
 *
 * Severity is carried by the outline and the icon tile, never by colour alone —
 * each toast also states what happened in words, so the distinction survives for
 * a colourblind viewer.
 */
export function Toaster() {
  return (
    <SonnerToaster
      position="bottom-right"
      // Long enough to read a server error, which is usually a full sentence.
      duration={6000}
      gap={12}
      // Full width on a phone, where a 356px card would hang off the screen.
      mobileOffset={{ left: 16, right: 16, bottom: 16 }}
      toastOptions={{
        unstyled: true,
        classNames: {
          /*
            `w-full` and the `content` wrapper below both matter. Turning
            sonner's own styles off takes its layout with them, and without a
            width the card collapsed to its text while the description escaped
            the border and printed over the page behind it.
          */
          toast:
            'group flex w-full items-start gap-3 overflow-hidden rounded-2xl border-[3px] border-ink bg-panel-raised px-4 py-3.5 shadow-[0_6px_0_var(--color-ink)]',
          // min-w-0 lets the flex child shrink; without it long words push the
          // card wider than its container instead of wrapping.
          content: 'flex min-w-0 flex-1 flex-col',
          title: 'font-display text-sm font-bold leading-snug text-cream break-words',
          description:
            'mt-1 whitespace-pre-line text-xs font-extrabold leading-relaxed text-bone-muted break-words',
          icon: 'mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-lg border-2 border-ink',
          error: 'border-punch bg-punch/15 [&_[data-icon]]:bg-punch [&_[data-icon]]:text-ink',
          success: 'border-mint [&_[data-icon]]:bg-mint [&_[data-icon]]:text-ink',
          info: 'border-aqua [&_[data-icon]]:bg-aqua [&_[data-icon]]:text-ink',
          warning: 'border-sun [&_[data-icon]]:bg-sun [&_[data-icon]]:text-ink',
          closeButton:
            'rounded-lg border-2 border-ink bg-cream font-display text-ink hover:bg-white',
          actionButton:
            'rounded-lg border-2 border-ink bg-sun px-3 py-1 font-display text-xs font-bold text-ink',
        },
      }}
      icons={{
        error: <BangGlyph />,
        success: <CheckGlyph />,
        info: <InfoGlyph />,
        warning: <BangGlyph />,
      }}
    />
  );
}

function BangGlyph() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path
        d="M12 6v8M12 18v.01"
        stroke="currentColor"
        strokeWidth="3.2"
        strokeLinecap="round"
      />
    </svg>
  );
}

function CheckGlyph() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path
        d="M5 13l4 4L19 7"
        stroke="currentColor"
        strokeWidth="3.2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function InfoGlyph() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path
        d="M12 11v7M12 6v.01"
        stroke="currentColor"
        strokeWidth="3.2"
        strokeLinecap="round"
      />
    </svg>
  );
}
