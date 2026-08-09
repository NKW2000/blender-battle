'use client';

import Link from 'next/link';

import {
  ArcadeLogo,
  ArcadeWordmark,
  ChunkyButton,
  ChunkyCard,
} from '@/components/arcade/chunky';
import { HeroCanvas } from '@/components/arcade/hero-canvas';

/** Decorative shapes drifting behind the hero. */
const FLOATERS = [
  { className: 'left-[6%] top-[14%] h-14 w-14 rounded-2xl bg-sun', rotate: '12deg', duration: '6s', delay: '0s' },
  { className: 'left-[9%] top-[64%] h-9 w-9 rounded-full bg-aqua', rotate: '0deg', duration: '7.5s', delay: '.6s' },
  { className: 'bottom-[12%] right-[11%] h-11 w-11 rounded-xl bg-mint', rotate: '-14deg', duration: '6.8s', delay: '1s' },
];

const MARQUEE_ITEMS =
  'PUBLIC CHALLENGES ✦ PRIVATE ROOMS ✦ ONE BRIEF ✦ ONE DEADLINE ✦ BLIND VOTING ✦ NO EARLY LOOKS ✦ ';

export function ArcadeLanding() {
  return (
    // No background of its own: <body> already paints this exact gradient.
    <div className="relative min-h-dvh overflow-hidden font-arcade-body text-cream">
      <div className="arcade-dots pointer-events-none absolute inset-0" aria-hidden="true" />

      {/* The 3D object and its two floating stat chips. Hidden below lg: on a
          phone it would eat the fold and push the actual message off screen. */}
      <div className="pointer-events-none absolute right-0 top-0 z-[1] hidden h-dvh w-[58%] lg:block">
        <div
          className="pointer-events-none absolute inset-[4%]"
          style={{
            background: 'radial-gradient(closest-side, rgba(255,210,63,.20), transparent 74%)',
          }}
          aria-hidden="true"
        />
        <HeroCanvas className="pointer-events-auto absolute inset-0" />

        {/*
          One chip, and it states a rule rather than a reading. The pair here
          before showed "YOUR RANK / Diamond III" beside "TIME LEFT / 04:12" —
          invented live data for a rank system that does not exist and a room
          that is not running.
        */}
        <div
          className="pointer-events-auto absolute bottom-[30%] right-[6%] rounded-2xl border-[3px] border-ink bg-aqua px-3.5 py-2.5"
          style={{
            color: '#053B3B',
            boxShadow: '0 6px 0 var(--color-ink)',
            animation: 'bbBob 4.6s ease-in-out .5s infinite',
          }}
        >
          <div className="text-[11px] font-black tracking-wide" style={{ color: '#075E5E' }}>
            EVERY ROOM
          </div>
          <div className="font-arcade text-lg font-bold">One deadline</div>
        </div>
      </div>

      {/*
        Hidden below lg, for the same reason the 3D object above is.

        These are placed in percentages tuned to the wide layout, where they sit
        in the empty space beside the copy column. Narrow the viewport and the
        percentages walk them straight onto the text — the sun-yellow one landed
        over the opening line of the subheading, and muted purple on bright
        yellow is barely more than 1:1. Decoration that obscures the message is
        worse than no decoration.
      */}
      {FLOATERS.map((floater, index) => (
        <div
          key={index}
          aria-hidden="true"
          className={`absolute hidden border-4 border-ink lg:block ${floater.className}`}
          style={{
            ['--r' as string]: floater.rotate,
            animation: `bbFloat ${floater.duration} ease-in-out ${floater.delay} infinite`,
            boxShadow: '0 8px 0 rgba(14,11,43,.35)',
          }}
        />
      ))}

      <nav className="relative z-[5] mx-auto flex max-w-[1440px] items-center justify-between px-5 py-5 sm:px-8 lg:px-16">
        <Link href="/" className="flex items-center gap-3">
          <ArcadeLogo />
          <ArcadeWordmark />
        </Link>

        <div className="flex items-center gap-4 sm:gap-6 lg:gap-8">
          <Link href="/rooms" className="hidden text-[15px] font-extrabold text-haze hover:text-cream sm:block">
            Rooms
          </Link>
          <Link href="/events" className="hidden text-[15px] font-extrabold text-haze hover:text-cream md:block">
            Challenges
          </Link>
          <ChunkyButton asChild tone="sun" size="sm">
            <Link href="/login">Log in</Link>
          </ChunkyButton>
        </div>
      </nav>

      {/*
        pointer-events-none on the section, auto on its content.

        The section is z-4 and spans the full 1440px even though its grid column
        is 640px, so it lies on top of the canvas at z-1 and would otherwise
        swallow every drag aimed at the 3D object. Letting clicks fall through
        the empty right-hand half — while the copy and buttons stay clickable —
        is what makes the hero interactive.
      */}
      <section
        className="pointer-events-none relative z-[4] mx-auto grid max-w-[1440px] grid-cols-[minmax(0,640px)] items-center px-5 pb-14 pt-8 sm:px-8 lg:min-h-[78vh] lg:px-16 lg:pt-14"
      >
        <div className="pointer-events-auto" style={{ animation: 'bbPop .7s ease both' }}>
          <h1
            className="mt-5 font-arcade text-[clamp(46px,7.2vw,104px)] font-bold leading-[.92] tracking-tight"
            style={{ textShadow: '0 6px 0 rgba(14,11,43,.45)' }}
          >
            <span className="block text-cream">MODEL.</span>
            <span className="block text-flame">BATTLE.</span>
            <span className="block bg-linear-to-r from-aqua to-mint bg-clip-text text-transparent">
              CLIMB.
            </span>
          </h1>

          <p className="my-6 max-w-[440px] text-[clamp(16px,1.5vw,19px)] font-bold leading-relaxed text-haze-2">
            Head-to-head Blender challenges with a ticking clock. Draw a brief, build
            against the deadline, and let everyone vote on the result.
          </p>

          <div className="flex flex-wrap items-center gap-4">
            <ChunkyButton
              asChild
              sheen
              size="lg"
              style={{ animation: 'bbPulse 2.4s ease-in-out infinite' }}
            >
              <Link href="/rooms">START THE CHALLENGE</Link>
            </ChunkyButton>
            <ChunkyButton asChild tone="ghost" size="md">
              <Link href="/rooms">▶ Browse rooms</Link>
            </ChunkyButton>
          </div>

          {/*
            An avatar stack and "12,480 artists battling right now" sat here.
            Nothing counted them — the number was written into the markup, and
            there is no endpoint that could have produced it. A made-up
            popularity figure is the one claim a visitor cannot check and the
            one that costs the most when they find out.
          */}
        </div>
      </section>

      <div className="relative z-[4] overflow-hidden border-y-[3px] border-ink bg-flame py-3">
        <div
          className="flex w-max whitespace-nowrap font-arcade text-[17px] font-bold text-ink"
          style={{ animation: 'bbMarquee 22s linear infinite' }}
          aria-hidden="true"
        >
          <span>{MARQUEE_ITEMS.repeat(2)}</span>
          <span>{MARQUEE_ITEMS.repeat(2)}</span>
        </div>
      </div>

      <section
        className="relative z-[4] mx-auto max-w-[1320px] px-5 py-16 sm:px-8 lg:px-16 lg:py-22"
      >
        <div className="mb-12 text-center">
          <div className="text-[13px] font-black uppercase tracking-[2px] text-aqua">
            How the arena works
          </div>
          <h2
            className="mt-2.5 font-arcade text-[clamp(32px,4.5vw,54px)] font-bold text-cream"
            style={{ textShadow: '0 5px 0 rgba(14,11,43,.4)' }}
          >
            Three ways to prove it
          </h2>
        </div>

        <div className="grid gap-6 md:grid-cols-3">
          <FeatureCard
            surface="bg-cream"
            iconBg="bg-sun"
            title="Public Challenges"
            titleClass="text-ink"
            bodyClass="text-[#4A4470]"
            body="Open briefs with a deadline. Upload your final render and a shot of your workspace before entries close — then everyone votes on what they see."
            icon={
              <svg width="30" height="30" viewBox="0 0 24 24" aria-hidden="true">
                <path
                  d="M12 2 L22 8 V16 L12 22 L2 16 V8 Z"
                  fill="none"
                  stroke="#0E0B2B"
                  strokeWidth="2.4"
                  strokeLinejoin="round"
                />
                <circle cx="12" cy="12" r="3.4" fill="#0E0B2B" />
              </svg>
            }
          />
          <FeatureCard
            surface="bg-sun"
            iconBg="bg-cream"
            title="Private Rooms"
            titleClass="text-ink"
            bodyClass="text-[#4A4470]"
            body="Share a code with up to sixteen artists. The brief is drawn when the host starts, so nobody sees it early — not even them. One deadline, then everyone who submitted votes."
            icon={
              <svg width="30" height="30" viewBox="0 0 24 24" aria-hidden="true">
                <path
                  d="M4 5 L11 12 L4 19"
                  fill="none"
                  stroke="#0E0B2B"
                  strokeWidth="2.6"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
                <path
                  d="M13 5 L20 12 L13 19"
                  fill="none"
                  stroke="#0E0B2B"
                  strokeWidth="2.6"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              </svg>
            }
          />
          <FeatureCard
            surface="bg-cream"
            iconBg="bg-aqua"
            title="Build a Portfolio"
            titleClass="text-ink"
            bodyClass="text-[#4A4470]"
            body="Every finished entry lands on your profile. Pin up to ten to your showcase, and your record — battles, wins and votes earned — counts itself as you go."
            icon={
              <svg width="30" height="30" viewBox="0 0 24 24" aria-hidden="true">
                <path
                  d="M4 20 V13 M10 20 V8 M16 20 V4 M4 20 H20"
                  fill="none"
                  stroke="#0E0B2B"
                  strokeWidth="2.6"
                  strokeLinecap="round"
                />
              </svg>
            }
          />
        </div>

        <div
          className="relative mt-14 flex flex-wrap items-center justify-between gap-6 overflow-hidden rounded-[28px] border-4 border-ink p-8 sm:p-13"
          style={{
            background: 'linear-gradient(135deg,#2A2170,#1B1550)',
            boxShadow: '0 14px 0 rgba(14,11,43,.55)',
          }}
        >
          <div
            aria-hidden="true"
            className="pointer-events-none absolute -right-10 -top-10 h-45 w-45"
            style={{
              background: 'radial-gradient(closest-side,rgba(255,210,63,.4),transparent)',
            }}
          />
          <div className="relative">
            <h3 className="font-arcade text-[clamp(28px,3.6vw,42px)] font-bold text-cream">
              Ready to enter the arena?
            </h3>
            <p className="mt-2 font-bold text-haze-3">
              Free to play. Open a room with a code, or enter a challenge that is
              already running.
            </p>
          </div>
          <ChunkyButton asChild tone="aqua" size="lg" className="relative">
            <Link href="/register">Enter the arena →</Link>
          </ChunkyButton>
        </div>
      </section>
    </div>
  );
}

function FeatureCard({
  surface,
  iconBg,
  icon,
  title,
  titleClass,
  body,
  bodyClass,
}: {
  surface: string;
  iconBg: string;
  icon: React.ReactNode;
  title: string;
  titleClass: string;
  body: string;
  bodyClass: string;
}) {
  return (
    <ChunkyCard className={`${surface} p-7 transition-transform hover:-translate-y-1.5`}>
      <div
        className={`flex h-16 w-16 items-center justify-center rounded-2xl border-4 border-ink ${iconBg}`}
        style={{ boxShadow: '0 5px 0 var(--color-ink)' }}
      >
        {icon}
      </div>
      <h3 className={`mb-2 mt-5 font-arcade text-2xl font-bold ${titleClass}`}>{title}</h3>
      <p className={`text-[15px] font-bold leading-relaxed ${bodyClass}`}>{body}</p>
    </ChunkyCard>
  );
}
