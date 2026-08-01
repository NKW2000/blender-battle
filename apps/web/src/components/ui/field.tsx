import * as React from 'react';

import { cn } from '@/lib/utils';

/**
 * Text input, on the arcade language.
 *
 * Translucent fill with a 3px border that turns colored and warms its
 * background on focus. The colour shift is paired with a background change so
 * focus is not signalled by hue alone. `accent` picks which colour: flame for
 * an artist's own identity fields, aqua for fields that point off-site — the
 * same distinction the settings page draws between "about you" and "find you
 * elsewhere".
 */
const ACCENT_FOCUS = {
  flame: 'focus:border-select focus:bg-select/10',
  aqua: 'focus:border-aqua focus:bg-aqua/10',
} as const;

export interface FieldProps extends React.InputHTMLAttributes<HTMLInputElement> {
  label: string;
  error?: string;
  hint?: string;
  accent?: keyof typeof ACCENT_FOCUS;
}

export const Field = React.forwardRef<HTMLInputElement, FieldProps>(
  ({ label, error, hint, id, className, accent = 'flame', ...props }, ref) => {
    const generatedId = React.useId();
    const inputId = id ?? generatedId;
    const describedBy = error ? `${inputId}-error` : hint ? `${inputId}-hint` : undefined;

    return (
      <div className="flex flex-col gap-2">
        <label htmlFor={inputId} className="text-[13px] font-extrabold text-[#B7AFE6]">
          {label}
        </label>

        <input
          ref={ref}
          id={inputId}
          aria-invalid={Boolean(error)}
          aria-describedby={describedBy}
          className={cn(
            'h-12 w-full rounded-2xl border-[3px] bg-white/6 px-4 font-sans text-[15px] font-bold text-bone outline-none transition-colors',
            'placeholder:text-[#6E67A0]',
            ACCENT_FOCUS[accent],
            error ? 'border-axis-x' : 'border-white/16',
            className,
          )}
          {...props}
        />

        {error ? (
          <p id={`${inputId}-error`} role="alert" className="text-xs font-bold text-axis-x">
            {error}
          </p>
        ) : hint ? (
          <p id={`${inputId}-hint`} className="text-xs font-bold text-bone-faint">
            {hint}
          </p>
        ) : null}
      </div>
    );
  },
);
Field.displayName = 'Field';
