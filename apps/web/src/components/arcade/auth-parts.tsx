'use client';

import { OAuthProvider } from '@bb/shared';
import { useQuery } from '@tanstack/react-query';
import * as React from 'react';

import { api } from '@/lib/api/client';

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000/api/v1';

/**
 * Text input in the arcade style.
 *
 * The focus treatment is a colour change on an already-3px border rather than a
 * ring, because a ring reads as a second outline against the chunky borders this
 * design uses everywhere. It still meets the non-colour requirement: the border
 * also thickens perceptibly against the filled background.
 */
export const ArcadeField = React.forwardRef<
  HTMLInputElement,
  React.InputHTMLAttributes<HTMLInputElement> & {
    label: string;
    error?: string;
    hint?: string;
  }
>(function ArcadeField({ label, error, hint, ...props }, ref) {
  const generatedId = React.useId();
  const id = props.id ?? generatedId;
  // No `-error` target: the message itself is raised as a toast on submit, so
  // the only thing left here is the outline marking which field it refers to.
  const describedBy = hint && !error ? `${id}-hint` : undefined;

  return (
    <div className="mb-4">
      <label htmlFor={id} className="mb-1.5 block text-[13px] font-extrabold text-haze-3">
        {label}
      </label>
      <input
        ref={ref}
        id={id}
        aria-invalid={Boolean(error)}
        aria-describedby={describedBy}
        className={`w-full rounded-2xl border-[3px] bg-white/6 px-4 py-3.5 font-arcade-body text-[15px] font-bold text-cream outline-none placeholder:text-haze-6 focus:border-flame focus:bg-flame/10 ${
          error ? 'border-punch' : 'border-white/16'
        }`}
        {...props}
      />
      {/*
        A failing field is marked by its outline, not by a message underneath.
        The wording lives in the toast the submit raises, so the same problem is
        never stated twice, and the form does not reflow as messages appear and
        disappear under each input.
      */}
      {hint && !error ? (
        <p id={`${id}-hint`} className="mt-1.5 text-xs font-bold text-haze-6">
          {hint}
        </p>
      ) : null}
    </div>
  );
});

/**
 * Provider sign-in buttons.
 *
 * The design mocked Google and GitHub. These render whatever the server reports
 * as actually configured, because a button that cannot complete a sign-in is
 * worse than no button at all — which is also why Apple appears only once its
 * four credentials are set, and simply does not render until then.
 */
export function ProviderButtons() {
  const { data } = useQuery({
    queryKey: ['auth', 'oauth-providers'],
    queryFn: () => api.get<{ providers: OAuthProvider[] }>('/auth/oauth/providers'),
    staleTime: 60 * 60 * 1000,
  });

  const providers = data?.providers ?? [];
  if (providers.length === 0) return null;

  return (
    <>
      {/*
        `basis-0` beside `flex-1`.

        `flex-1` alone still lets each button start from its own content width,
        so two providers with different word lengths and glyph widths settle at
        different sizes. Zeroing the basis makes the split purely even, which is
        what a row of equal-rank choices should look like.

        A fixed height for the same reason: the two marks have different aspect
        ratios, and without it the taller glyph makes its button taller.
      */}
      <div className="mb-5 flex gap-3">
        {providers.map((provider) => {
          const isGoogle = provider === OAuthProvider.GOOGLE;

          return (
            <button
              key={provider}
              type="button"
              onClick={() => {
                window.location.href = `${API_URL}/auth/oauth/${provider}`;
              }}
              className={`arcade-press arcade-focus flex h-12 flex-1 basis-0 cursor-pointer items-center justify-center gap-2.5 rounded-2xl border-[3px] border-ink text-sm font-extrabold [--press-depth:5px] ${
                isGoogle ? 'bg-cream text-ink' : 'bg-ink text-white'
              }`}
              /*
                Each provider in its own colour, which is what their brand
                guidelines ask for and what stops a row of buttons reading as one
                control split in half. Apple's is black on white or white on
                black; black is the one that separates it from the cream Google
                button beside it.
              */
              style={{ boxShadow: '0 5px 0 var(--color-ink)' }}
            >
              {isGoogle ? <GoogleMark /> : <AppleMark />}
              {isGoogle ? 'Google' : 'Apple'}
            </button>
          );
        })}
      </div>

      <div className="my-5 flex items-center gap-3.5 text-xs font-extrabold tracking-wider text-haze-6">
        <span className="h-0.5 flex-1 bg-white/12" />
        OR
        <span className="h-0.5 flex-1 bg-white/12" />
      </div>
    </>
  );
}

/**
 * The Google "G".
 *
 * Four paths, because the mark is four coloured segments and always has been.
 * What was here before was a single `#EA4335` path — one red blob that read as
 * a broken icon rather than as Google, and Google's brand terms do not allow a
 * recoloured or partial mark on a sign-in button anyway.
 *
 * Sized in a fixed square slot alongside the Apple mark: the two logos have
 * very different aspect ratios, so identical `width` attributes produce two
 * visibly different sizes. The slot equalises them.
 */
export function GoogleMark() {
  return (
    <svg
      width="18"
      height="18"
      viewBox="0 0 24 24"
      aria-hidden="true"
      className="shrink-0"
    >
      <path
        fill="#4285F4"
        d="M23.49 12.27c0-.79-.07-1.54-.19-2.27H12v4.51h6.47a5.53 5.53 0 0 1-2.4 3.63v3h3.86c2.26-2.09 3.56-5.17 3.56-8.87Z"
      />
      <path
        fill="#34A853"
        d="M12 24c3.24 0 5.95-1.08 7.93-2.91l-3.86-3c-1.08.72-2.45 1.16-4.07 1.16-3.13 0-5.78-2.11-6.73-4.96H1.29v3.09A11.99 11.99 0 0 0 12 24Z"
      />
      <path
        fill="#FBBC05"
        d="M5.27 14.29a7.2 7.2 0 0 1 0-4.58V6.62H1.29a12 12 0 0 0 0 10.76l3.98-3.09Z"
      />
      <path
        fill="#EA4335"
        d="M12 4.75c1.77 0 3.35.61 4.6 1.8l3.42-3.42C17.95 1.19 15.24 0 12 0 7.7 0 3.99 2.47 1.29 6.62l3.98 3.09C6.22 6.86 8.87 4.75 12 4.75Z"
      />
    </svg>
  );
}

/**
 * The Apple logo.
 *
 * One path, drawn at 20px against Google's 18. The marks have very different
 * ink-to-viewBox ratios — Apple's is tall and narrow, the G nearly fills its
 * square — so equal `width` attributes would render at visibly different
 * optical sizes. The numbers differ so the glyphs look the same size, which is
 * the thing being matched.
 *
 * `currentColor` rather than black: Apple's guidelines allow the mark in black
 * or white and require it to sit on sufficient contrast, so it takes the
 * button's own text colour and cannot end up black on black.
 */
export function AppleMark() {
  return (
    <svg
      width="20"
      height="20"
      viewBox="0 0 24 24"
      aria-hidden="true"
      className="shrink-0"
    >
      <path
        fill="currentColor"
        d="M17.05 12.94c-.03-2.65 2.17-3.92 2.27-3.98-1.24-1.81-3.16-2.06-3.84-2.09-1.63-.17-3.19.96-4.02.96-.83 0-2.11-.94-3.47-.91-1.78.03-3.43 1.04-4.35 2.63-1.85 3.22-.47 7.98 1.33 10.59.88 1.28 1.93 2.71 3.31 2.66 1.33-.05 1.83-.86 3.44-.86 1.6 0 2.06.86 3.46.83 1.43-.02 2.34-1.3 3.21-2.59 1.01-1.48 1.43-2.92 1.45-3-.03-.01-2.78-1.07-2.81-4.24ZM14.4 5.15c.73-.89 1.23-2.12 1.09-3.35-1.06.04-2.34.7-3.1 1.59-.68.78-1.27 2.03-1.11 3.23 1.18.09 2.39-.6 3.12-1.47Z"
      />
    </svg>
  );
}
