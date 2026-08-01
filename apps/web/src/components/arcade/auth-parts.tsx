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
 * as actually configured — currently Google and Discord — because a button that
 * cannot complete a sign-in is worse than no button at all.
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
      <div className="mb-5 flex gap-3">
        {providers.map((provider) => (
          <button
            key={provider}
            type="button"
            onClick={() => {
              window.location.href = `${API_URL}/auth/oauth/${provider}`;
            }}
            className={`arcade-press arcade-focus flex flex-1 cursor-pointer items-center justify-center gap-2.5 rounded-2xl border-[3px] border-ink py-3.5 text-sm font-extrabold [--press-depth:5px] ${
              provider === OAuthProvider.GOOGLE ? 'bg-cream text-ink' : 'bg-ink text-cream'
            }`}
            style={{ boxShadow: '0 5px 0 var(--color-ink)' }}
          >
            {provider === OAuthProvider.GOOGLE ? <GoogleMark /> : <DiscordMark />}
            {provider === OAuthProvider.GOOGLE ? 'Google' : 'Discord'}
          </button>
        ))}
      </div>

      <div className="my-5 flex items-center gap-3.5 text-xs font-extrabold tracking-wider text-haze-6">
        <span className="h-0.5 flex-1 bg-white/12" />
        OR
        <span className="h-0.5 flex-1 bg-white/12" />
      </div>
    </>
  );
}

export function GoogleMark() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" aria-hidden="true">
      <path
        fill="#EA4335"
        d="M12 10.2v3.9h5.4c-.24 1.4-1.66 4.1-5.4 4.1-3.25 0-5.9-2.69-5.9-6s2.65-6 5.9-6c1.85 0 3.09.79 3.8 1.47l2.6-2.5C16.7 1.6 14.6.7 12 .7 6.9.7 2.8 4.8 2.8 9.9S6.9 19.1 12 19.1c5.3 0 8.8-3.72 8.8-8.96 0-.6-.06-1.06-.15-1.52H12z"
      />
    </svg>
  );
}

export function DiscordMark() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" aria-hidden="true">
      <path
        fill="#fff"
        d="M20.32 4.37A19.8 19.8 0 0 0 15.43 3a13.9 13.9 0 0 0-.63 1.28 18.3 18.3 0 0 0-5.6 0A13.9 13.9 0 0 0 8.57 3 19.7 19.7 0 0 0 3.68 4.37 20.3 20.3 0 0 0 .2 18.06a19.9 19.9 0 0 0 6 3.03c.49-.66.92-1.36 1.29-2.1a13 13 0 0 1-2.03-.98c.17-.12.34-.25.5-.38a14.2 14.2 0 0 0 12.1 0c.16.14.33.26.5.38-.65.39-1.33.72-2.04.98.37.74.8 1.44 1.29 2.1a19.9 19.9 0 0 0 6-3.03 20.3 20.3 0 0 0-3.48-13.7ZM8.02 15.33c-1.18 0-2.16-1.09-2.16-2.42s.95-2.42 2.16-2.42c1.21 0 2.18 1.1 2.16 2.42 0 1.33-.95 2.42-2.16 2.42Zm7.96 0c-1.18 0-2.16-1.09-2.16-2.42s.95-2.42 2.16-2.42c1.21 0 2.18 1.1 2.16 2.42 0 1.33-.94 2.42-2.16 2.42Z"
      />
    </svg>
  );
}
