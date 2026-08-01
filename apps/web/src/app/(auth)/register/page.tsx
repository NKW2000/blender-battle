'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import { PASSWORD_MIN_LENGTH } from '@bb/shared';
import Link from 'next/link';
import { Suspense, useEffect } from 'react';
import { useForm } from 'react-hook-form';

import { ChunkyButton } from '@/components/arcade/chunky';
import { HeroCanvas } from '@/components/arcade/hero-canvas';
import { useRegister } from '@/features/auth/use-session';
import { collectFormMessages, notify } from '@/lib/notify';
import { registerSchema, type RegisterInput } from '@/lib/validation/auth.schema';
import { ArcadeField, ProviderButtons } from '@/components/arcade/auth-parts';

export default function RegisterPage() {
  const signUp = useRegister();
  const {
    register,
    handleSubmit,
    setError,
    formState: { errors },
  } = useForm<RegisterInput>({ resolver: zodResolver(registerSchema) });

  // Uniqueness is only knowable server-side, so those errors are mapped back
  // onto the same fields the client-side rules use.
  useEffect(() => {
    const details = signUp.error?.details;
    if (!details) return;

    for (const [field, messages] of Object.entries(details)) {
      if (field === 'username' || field === 'email') {
        setError(field, { message: messages[0] });
      }
    }
  }, [signUp.error, setError]);

  return (
    <div
      className="grid min-h-dvh font-arcade-body text-cream lg:grid-cols-[.95fr_1.05fr]"
      style={{
        background:
          'radial-gradient(1100px 620px at 80% -10%, #2E2578 0%, #1B1550 45%, #14103A 100%)',
      }}
    >
      <main className="relative z-[2] order-2 flex min-h-dvh flex-col justify-center p-8 sm:p-12 lg:order-1 lg:p-16">
        <ChunkyButton asChild tone="ghost" size="sm" className="mb-6 self-start">
          <Link href="/">← Back to home</Link>
        </ChunkyButton>

        <div className="mx-auto w-full max-w-[400px]" style={{ animation: 'bbPop .55s ease both' }}>
          <h1 className="mb-1.5 font-arcade text-[clamp(30px,4vw,44px)] font-bold text-cream">
            Claim your handle
          </h1>
          <p className="mb-7 font-bold text-haze-4">
            This is how you appear on the leaderboard.
          </p>

          <Suspense fallback={null}>
            <ProviderButtons />
          </Suspense>

          <form
            onSubmit={handleSubmit(
              (values) => signUp.mutate(values),
              (fieldErrors) => notify.invalidForm(collectFormMessages(fieldErrors)),
            )}
            noValidate
          >
            <ArcadeField
              label="Username"
              autoComplete="username"
              placeholder="polycount"
              error={errors.username?.message}
              {...register('username')}
            />
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
              autoComplete="new-password"
              placeholder="••••••••"
              hint={`${PASSWORD_MIN_LENGTH} characters or more. Length beats symbols.`}
              error={errors.password?.message}
              {...register('password')}
            />

            {signUp.error && !signUp.error.details ? (
              <p
                role="alert"
                className="mb-4 rounded-xl border-2 border-punch bg-punch/15 px-4 py-3 text-sm font-bold text-punch-soft"
              >
                {signUp.error.message}
              </p>
            ) : null}

            <ChunkyButton
              type="submit"
              tone="aqua"
              size="lg"
              disabled={signUp.isPending}
              className="mt-2 w-full"
            >
              {signUp.isPending ? 'Creating account…' : 'Create account →'}
            </ChunkyButton>
          </form>

          <p className="mt-6 text-center text-sm font-extrabold text-haze-4">
            Already registered?{' '}
            <Link href="/login" className="text-sun hover:text-flame-lift">
              Sign in
            </Link>
          </p>
        </div>
      </main>

      <aside
        className="relative order-1 hidden flex-col justify-between overflow-hidden border-l-4 border-ink p-8 lg:order-2 lg:flex lg:p-13"
        style={{ background: 'linear-gradient(150deg,#22D3EE 0%,#3E7BF0 55%,#5B2FBF 100%)' }}
      >
        <div
          aria-hidden="true"
          className="absolute inset-0"
          style={{
            backgroundImage: 'radial-gradient(rgba(255,255,255,.14) 1.4px, transparent 1.5px)',
            backgroundSize: '30px 30px',
          }}
        />

        <div className="relative z-[2] flex items-center gap-3 self-end">
          <span className="font-arcade text-[21px] font-bold text-cream">BLENDERBATTLE</span>
          <div
            aria-hidden="true"
            className="flex h-10 w-10 rotate-45 items-center justify-center rounded-xl border-[3px] border-ink bg-sun"
            style={{ boxShadow: '0 4px 0 var(--color-ink)' }}
          >
            <div className="h-3 w-3 rounded-[3px] bg-ink" />
          </div>
        </div>

        <HeroCanvas coreColor={0x5ef0de} className="absolute inset-0 z-[1]" />

        <div className="relative z-[2]">
          <h2
            className="mb-3 font-arcade text-[clamp(30px,3.6vw,46px)] font-bold leading-none text-cream"
            style={{ textShadow: '0 5px 0 rgba(14,11,43,.35)' }}
          >
            Nine tiers.
            <br />
            One place to start.
          </h2>
          <p className="max-w-[360px] font-extrabold text-[#E3F6FF]">
            Everyone opens at Clay Novice. Where you finish the season is up to you.
          </p>
        </div>
      </aside>
    </div>
  );
}
