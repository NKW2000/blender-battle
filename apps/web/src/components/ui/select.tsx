'use client';

import { useEffect, useId, useRef, useState } from 'react';

import { cn } from '@/lib/utils';

export interface SelectOption {
  value: string;
  label: string;
  /** A quieter second line, e.g. "Surprise me" under "Any". */
  hint?: string;
}

/**
 * The arcade dropdown.
 *
 * A native `<select>` is replaced wholesale rather than styled, because the part
 * that looked wrong — the open option list — is drawn by the operating system
 * and cannot be reached by CSS at all. Only a custom listbox can carry the ink
 * borders, hard shadow and hover states the rest of the language uses.
 *
 * The trade is that everything a native select gave for free has to be rebuilt:
 * keyboard navigation, type-to-focus's simpler cousin (arrow + enter), Escape to
 * close, click-outside, and the listbox/option ARIA roles a screen reader needs.
 * That is done here so no call site has to think about it.
 */
export function Select({
  value,
  onChange,
  options,
  placeholder = 'Select…',
  className,
  ariaLabel,
  disabled = false,
  tone = 'panel',
}: {
  value: string;
  onChange: (value: string) => void;
  options: SelectOption[];
  placeholder?: string;
  className?: string;
  ariaLabel?: string;
  disabled?: boolean;
  /**
   * 'panel' is the ink-bordered toolbar look, for filter bars sitting beside
   * plain text inputs (search boxes, the code field). 'field' matches `Field`'s
   * translucent style, for use inside a form where it sits beside labeled
   * `Field` inputs — mixing the two in one form is the sharp-edge mismatch this
   * exists to avoid.
   */
  tone?: 'panel' | 'field';
}) {
  const [open, setOpen] = useState(false);
  // Which option the keyboard is on, separate from which is selected — you can
  // arrow through the list without committing until Enter.
  const [activeIndex, setActiveIndex] = useState(-1);
  const rootRef = useRef<HTMLDivElement>(null);
  const listRef = useRef<HTMLUListElement>(null);
  const listId = useId();

  const selected = options.find((option) => option.value === value);

  useEffect(() => {
    if (!open) return;

    const onPointerDown = (event: PointerEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) setOpen(false);
    };
    document.addEventListener('pointerdown', onPointerDown);
    return () => document.removeEventListener('pointerdown', onPointerDown);
  }, [open]);

  // Opening lands the highlight on the current value, so the first arrow press
  // moves from where you are rather than from the top.
  useEffect(() => {
    if (open) {
      setActiveIndex(options.findIndex((option) => option.value === value));
    }
  }, [open, options, value]);

  // Keep the highlighted row in view when arrowing through a long list.
  useEffect(() => {
    if (!open || activeIndex < 0) return;
    listRef.current?.children[activeIndex]?.scrollIntoView({ block: 'nearest' });
  }, [open, activeIndex]);

  const commit = (index: number) => {
    const option = options[index];
    if (!option) return;
    onChange(option.value);
    setOpen(false);
  };

  const onKeyDown = (event: React.KeyboardEvent) => {
    switch (event.key) {
      case 'ArrowDown':
        event.preventDefault();
        if (!open) setOpen(true);
        else setActiveIndex((index) => Math.min(options.length - 1, index + 1));
        break;
      case 'ArrowUp':
        event.preventDefault();
        if (open) setActiveIndex((index) => Math.max(0, index - 1));
        break;
      case 'Enter':
      case ' ':
        event.preventDefault();
        if (!open) setOpen(true);
        else commit(activeIndex);
        break;
      case 'Escape':
        if (open) {
          event.preventDefault();
          setOpen(false);
        }
        break;
      case 'Tab':
        setOpen(false);
        break;
    }
  };

  return (
    <div ref={rootRef} className={cn('relative', className)}>
      <button
        type="button"
        onClick={() => !disabled && setOpen((value) => !value)}
        onKeyDown={disabled ? undefined : onKeyDown}
        disabled={disabled}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-label={ariaLabel}
        className={cn(
          'arcade-focus flex h-11 w-full items-center justify-between gap-2 rounded-2xl border-[3px] px-4 text-left font-bold text-bone transition-colors disabled:cursor-not-allowed disabled:opacity-40',
          tone === 'field'
            ? cn('h-12 bg-white/6 focus:border-select focus:bg-select/10', open ? 'border-select bg-select/10' : 'border-white/16')
            : 'border-edge bg-panel',
        )}
      >
        <span className={cn('truncate', !selected && 'text-bone-faint')}>
          {selected?.label ?? placeholder}
        </span>
        <Chevron open={open} />
      </button>

      {open ? (
        <ul
          ref={listRef}
          role="listbox"
          id={listId}
          aria-activedescendant={activeIndex >= 0 ? `${listId}-${activeIndex}` : undefined}
          tabIndex={-1}
          className="select-listbox absolute left-0 right-0 top-[calc(100%+6px)] z-50 max-h-64 overflow-y-auto rounded-[16px] border-4 border-edge bg-panel-raised p-1.5"
          style={{ boxShadow: '0 8px 0 var(--color-edge)', animation: 'bbPop .16s ease both' }}
        >
          {options.map((option, index) => {
            const isSelected = option.value === value;
            const isActive = index === activeIndex;
            return (
              <li
                key={option.value}
                id={`${listId}-${index}`}
                role="option"
                aria-selected={isSelected}
                onClick={() => commit(index)}
                onMouseEnter={() => setActiveIndex(index)}
                className={cn(
                  'flex cursor-pointer items-center justify-between gap-3 rounded-[10px] px-3 py-2.5 font-extrabold',
                  isSelected
                    ? 'bg-sun text-edge'
                    : isActive
                      ? 'bg-white/10 text-cream'
                      : 'text-bone',
                )}
              >
                <span className="flex flex-col leading-tight">
                  <span>{option.label}</span>
                  {option.hint ? (
                    <span
                      className={cn(
                        'text-[11px] font-extrabold',
                        isSelected ? 'text-edge/70' : 'text-bone-faint',
                      )}
                    >
                      {option.hint}
                    </span>
                  ) : null}
                </span>
                {isSelected ? <Check /> : null}
              </li>
            );
          })}
        </ul>
      ) : null}
    </div>
  );
}

function Chevron({ open }: { open: boolean }) {
  return (
    <svg
      width="18"
      height="18"
      viewBox="0 0 24 24"
      fill="none"
      aria-hidden="true"
      className="shrink-0 text-bone-muted transition-transform"
      style={{ transform: open ? 'rotate(180deg)' : 'none' }}
    >
      <path
        d="M6 9l6 6 6-6"
        stroke="currentColor"
        strokeWidth="3"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function Check() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden="true" className="shrink-0">
      <path
        d="M5 13l4 4L19 7"
        stroke="#0E0B2B"
        strokeWidth="3.2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}
