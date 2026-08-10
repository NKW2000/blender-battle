'use client';

import Link from 'next/link';

import { ArcadeLogo } from '@/components/arcade/chunky';

/**
 * The frame the recovery pages share.
 *
 * Lifted out rather than copied three times. These pages are reached by people
 * who are already having a bad time — a forgotten password, a link that did not
 * work — and consistency between them is what makes the sequence feel like one
 * flow rather than three separate dead ends.
 *
 * Deliberately narrower and quieter than the sign-in page: there is no hero
 * panel, because nothing here is being sold.
 */
export function AuthShell({
  title,
  subtitle,
  children,
  footer,
}: {
  title: string;
  subtitle: string;
  children: React.ReactNode;
  footer?: React.ReactNode;
}) {
  return (
    <div
      className="flex min-h-dvh items-center justify-center px-5 py-10 font-arcade-body text-cream"
      style={{
        background:
          'radial-gradient(1100px 620px at 20% -10%, #2E2578 0%, #1B1550 45%, #14103A 100%)',
      }}
    >
      <main className="w-full max-w-md">
        <Link href="/" className="mb-8 flex items-center justify-center gap-3">
          <ArcadeLogo size={38} />
        </Link>

        <div
          className="rounded-[26px] border-4 border-ink p-7 sm:p-9"
          style={{ background: 'rgba(20,16,58,.86)', boxShadow: '0 12px 0 rgba(14,11,43,.5)' }}
        >
          <h1 className="font-arcade text-2xl font-bold text-cream">{title}</h1>
          <p className="mt-2 text-sm font-bold leading-relaxed text-haze-3">{subtitle}</p>

          <div className="mt-6">{children}</div>
        </div>

        {footer ? (
          <p className="mt-6 text-center text-sm font-extrabold text-haze-4">{footer}</p>
        ) : null}
      </main>
    </div>
  );
}
