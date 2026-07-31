'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import { ApiErrorCode } from '@bb/shared';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { Suspense } from 'react';
import { useForm } from 'react-hook-form';

import { ArcadeField, ProviderButtons } from '@/components/arcade/auth-parts';
import { ChunkyButton } from '@/components/arcade/chunky';
import { HeroCanvas } from '@/components/arcade/hero-canvas';
import { useLogin } from '@/features/auth/use-session';
import { loginSchema, type LoginInput } from '@/lib/validation/auth.schema';

export default function LoginPage() {
  const login = useLogin();
  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<LoginInput>({ resolver: zodResolver(loginSchema) });

  const serverError = login.error;

  return (
    <div
      className="grid min-h-dvh font-arcade-body text-cream lg:grid-cols-[1.05fr_.95fr]"
      style={{
        background:
          'radial-gradient(1100px 620px at 20% -10%, #2E2578 0%, #1B1550 45%, #14103A 100%)',
      }}
    >
      {/* The showpiece panel. Hidden below lg — on a phone the form is the only
          thing that matters and it should own the whole screen. */}
      <aside
        className="relative hidden flex-col justify-between overflow-hidden border-r-4 border-ink p-8 lg:flex lg:p-13"
        style={{ background: 'linear-gradient(150deg,#FF7A18 0%,#FF5E7A 55%,#C4267C 100%)' }}
      >
        <div
          aria-hidden="true"
          className="absolute inset-0"
          style={{
            backgroundImage: 'radial-gradient(rgba(255,255,255,.14) 1.4px, transparent 1.5px)',
            backgroundSize: '30px 30px',
          }}
        />

        <Link href="/" className="relative z-[2] flex items-center gap-3">
          <div
            aria-hidden="true"
            className="flex h-10 w-10 rotate-45 items-center justify-center rounded-xl border-[3px] border-ink bg-sun"
            style={{ boxShadow: '0 4px 0 var(--color-ink)' }}
          >
            <div className="h-3 w-3 rounded-[3px] bg-ink" />
          </div>
          <span className="font-arcade text-[21px] font-bold text-cream">BLENDERBATTLE</span>
        </Link>

        <HeroCanvas coreColor={0xffd23f} className="absolute inset-0 z-[1]" />

        <div className="relative z-[2]">
          <div className="mb-4 inline-flex items-center gap-2 rounded-full border-2 border-white/40 bg-ink/25 px-3.5 py-1.5 text-xs font-black uppercase tracking-wider text-cream">
            <span
              aria-hidden="true"
              className="h-2 w-2 rounded-full bg-mint"
              style={{ animation: 'bbTwinkle 1.5s infinite' }}
            />
            Season 4 live
          </div>
          <h2
            className="mb-3 font-arcade text-[clamp(30px,3.6vw,46px)] font-bold leading-none text-cream"
            style={{ textShadow: '0 5px 0 rgba(14,11,43,.35)' }}
          >
            Your rivals are
            <br />
            already warming up.
          </h2>
          <p className="max-w-[360px] font-extrabold text-[#FFE7CF]">
            Grab your keyboard — a new brief drops the moment you enter the queue.
          </p>
        </div>
      </aside>

      <main className="relative z-[2] flex min-h-dvh flex-col justify-center p-8 sm:p-12 lg:p-16">
        <ChunkyButton asChild tone="ghost" size="sm" className="mb-6 self-start">
          <Link href="/">← Back to home</Link>
        </ChunkyButton>

        <div className="mx-auto w-full max-w-[400px]" style={{ animation: 'bbPop .55s ease both' }}>
          <h1 className="mb-1.5 font-arcade text-[clamp(30px,4vw,44px)] font-bold text-cream">
            Welcome back, artist
          </h1>
          <p className="mb-7 font-bold text-haze-4">Log in to claim today&rsquo;s challenge.</p>

          <Suspense fallback={null}>
            <ProviderButtons />
          </Suspense>

          <form onSubmit={handleSubmit((values) => login.mutate(values))} noValidate>
            <ArcadeField
              label="Email"
              type="email"
              autoComplete="email"
              placeholder="you@studio.com"
              error={errors.email?.message}
              {...register('email')}
            />
            <ArcadeField
              label="Password"
              type="password"
              autoComplete="current-password"
              placeholder="••••••••"
              error={errors.password?.message}
              {...register('password')}
            />

            <div className="mb-5 text-right">
              <Link href="/register" className="text-[13px] font-extrabold text-aqua hover:text-mint">
                New here? Create an account
              </Link>
            </div>

            {serverError ? (
              <p
                role="alert"
                className="mb-4 rounded-xl border-2 border-punch bg-punch/15 px-4 py-3 text-sm font-bold text-punch-soft"
              >
                {serverError.code === ApiErrorCode.ACCOUNT_SUSPENDED ||
                serverError.code === ApiErrorCode.ACCOUNT_BANNED
                  ? serverError.message
                  : 'Those details do not match an account. Check the email and password and try again.'}
              </p>
            ) : (
              <Suspense fallback={null}>
                <OAuthErrorNotice />
              </Suspense>
            )}

            <ChunkyButton type="submit" size="lg" disabled={login.isPending} className="w-full">
              {login.isPending ? 'Logging in…' : 'Log in & play →'}
            </ChunkyButton>
          </form>

          <p className="mt-6 text-center text-sm font-extrabold text-haze-4">
            New challenger?{' '}
            <Link href="/register" className="text-sun hover:text-flame-lift">
              Create an account
            </Link>
          </p>
        </div>
      </main>
    </div>
  );
}

/**
 * Surfaces the ?error= the OAuth callback redirects back with. Split out so
 * only this fragment depends on the search params, which would otherwise opt
 * the whole page out of static prerendering.
 */
function OAuthErrorNotice() {
  const oauthError = useSearchParams().get('error');
  if (!oauthError) return null;

  return (
    <p
      role="alert"
      className="mb-4 rounded-xl border-2 border-punch bg-punch/15 px-4 py-3 text-sm font-bold text-punch-soft"
    >
      That sign-in did not complete. Try again, or use your email and password.
    </p>
  );
}
