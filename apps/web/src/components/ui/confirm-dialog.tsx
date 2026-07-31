'use client';

import { useEffect, useRef, useState } from 'react';

import { ChunkyButton } from '@/components/arcade/chunky';

/**
 * The confirmation dialog.
 *
 * Replaces `window.confirm`, which could not be styled at all: it rendered in
 * the operating system's chrome, ignored the whole design language, and on some
 * browsers offers a "prevent this page from creating more dialogs" checkbox that
 * would silently disable a confirmation guarding an irreversible action.
 *
 * Implemented as a modal with the focus behaviour a native dialog gave for free
 * and a hand-rolled one usually loses: focus moves in on open, Escape cancels,
 * Tab is trapped inside, and focus returns to the trigger on close.
 */
export function ConfirmDialog({
  open,
  title,
  description,
  confirmLabel = 'Confirm',
  cancelLabel = 'Cancel',
  tone = 'danger',
  busy = false,
  onConfirm,
  onCancel,
}: {
  open: boolean;
  title: string;
  description: string;
  confirmLabel?: string;
  cancelLabel?: string;
  tone?: 'danger' | 'default';
  busy?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  const panelRef = useRef<HTMLDivElement>(null);
  const cancelRef = useRef<HTMLButtonElement>(null);
  const returnFocusRef = useRef<HTMLElement | null>(null);

  // Stays mounted for one beat after `open` goes false so the dialog can fade
  // out instead of vanishing — the abrupt disappearance was the jolt on confirm.
  const [rendered, setRendered] = useState(open);
  useEffect(() => {
    if (open) {
      setRendered(true);
      return;
    }
    const timer = setTimeout(() => setRendered(false), 160);
    return () => clearTimeout(timer);
  }, [open]);

  useEffect(() => {
    if (!open) return;

    returnFocusRef.current = document.activeElement as HTMLElement | null;
    // Cancel takes focus, not confirm: a stray Enter on an irreversible action
    // should do nothing rather than commit it.
    cancelRef.current?.focus();

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        onCancel();
        return;
      }

      if (event.key !== 'Tab') return;

      const focusable = panelRef.current?.querySelectorAll<HTMLElement>(
        'button:not([disabled]), [href], input, select, textarea, [tabindex]:not([tabindex="-1"])',
      );
      if (!focusable?.length) return;

      const first = focusable[0] as HTMLElement;
      const last = focusable[focusable.length - 1] as HTMLElement;

      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };

    document.addEventListener('keydown', onKeyDown);
    // The page behind a modal must not scroll under it.
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';

    return () => {
      document.removeEventListener('keydown', onKeyDown);
      document.body.style.overflow = previousOverflow;
      returnFocusRef.current?.focus?.();
    };
  }, [open, onCancel]);

  if (!rendered) return null;

  // `open` false while still rendered = mid fade-out.
  const closing = !open;

  return (
    <div
      className="fixed inset-0 z-[80] flex items-center justify-center px-4"
      style={{
        background: 'rgba(14,11,43,.72)',
        backdropFilter: 'blur(3px)',
        opacity: closing ? 0 : 1,
        transition: 'opacity .16s ease',
      }}
      // Clicking the backdrop cancels — the safe outcome, never the destructive
      // one. The check keeps a click that started inside the panel from closing.
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onCancel();
      }}
    >
      <div
        ref={panelRef}
        role="alertdialog"
        aria-modal="true"
        aria-labelledby="bb-confirm-title"
        aria-describedby="bb-confirm-description"
        className="w-full max-w-[460px] rounded-[24px] border-4 border-edge p-7"
        style={{
          background: 'linear-gradient(180deg,#2A2170,#1B1550)',
          boxShadow: '0 14px 0 var(--color-edge)',
          // Pop in on open; on close the backdrop fade carries it, and the panel
          // eases down a touch rather than snapping away.
          animation: closing
            ? 'none'
            : 'bbPop .28s cubic-bezier(.2,1.3,.35,1) both',
          transform: closing ? 'translateY(6px) scale(.98)' : undefined,
          transition: 'transform .16s ease',
        }}
      >
        <div
          aria-hidden="true"
          className="mb-4 flex h-12 w-12 items-center justify-center rounded-[14px] border-[3px] border-edge font-display text-2xl font-bold text-edge"
          style={{
            background: tone === 'danger' ? '#FF3D9A' : '#FFD23F',
            boxShadow: '0 4px 0 var(--color-edge)',
          }}
        >
          !
        </div>

        <h2
          id="bb-confirm-title"
          className="font-display text-[clamp(22px,3vw,28px)] font-bold leading-tight text-cream"
        >
          {title}
        </h2>

        <p id="bb-confirm-description" className="mt-2.5 text-sm font-extrabold text-[#9E96D2]">
          {description}
        </p>

        <div className="mt-7 flex flex-wrap justify-end gap-3">
          <button
            ref={cancelRef}
            type="button"
            onClick={onCancel}
            disabled={busy}
            className="arcade-focus rounded-[14px] border-[3px] border-white/24 bg-white/8 px-5 py-3 font-display text-[15px] font-semibold text-cream transition-colors hover:bg-white/16 disabled:opacity-50"
          >
            {cancelLabel}
          </button>

          <ChunkyButton
            size="md"
            tone={tone === 'danger' ? 'danger' : undefined}
            onClick={onConfirm}
            disabled={busy}
          >
            {busy ? 'Working…' : confirmLabel}
          </ChunkyButton>
        </div>
      </div>
    </div>
  );
}
