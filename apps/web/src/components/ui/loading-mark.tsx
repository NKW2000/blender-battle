/**
 * The loading lockup: the mark spinning into place, the wordmark, and the dots.
 *
 * Shared by the navigation cover and by the `loading.tsx` fallback so the two
 * cannot drift. They are reached by different routes — one when you click a
 * link, one when you land on a URL cold — and a product that showed two
 * different loading screens depending on how you arrived would look broken.
 *
 * The colours are the design's own literal values rather than the app's tokens.
 * They are close cousins (#FFC93C against the product's #FFD23F sun) but not
 * the same, and this panel was signed off at these.
 */
export function LoadingMark() {
  return (
    /*
      The design was drawn at desktop width, where its 34px wordmark and the
      tracked-out label fit comfortably. On a phone they overran the viewport and
      were clipped at both ends — "DERBATTLE", "DING". Everything below scales
      with the viewport and settles at exactly the design's sizes once there is
      room for them.
    */
    <div className="relative flex max-w-full flex-col items-center gap-[clamp(16px,5vw,26px)] px-6">
      {/*
        The mark arrives spinning: a half-turn plus 45 degrees, overshooting to
        1.12 before settling. `both` holds the final frame, so it does not snap
        back to its 0% state once the animation ends.
      */}
      <div
        className="flex h-[clamp(68px,20vw,96px)] w-[clamp(68px,20vw,96px)] items-center justify-center rounded-[22px] border-[5px] border-[#0E0B2B]"
        style={{
          background: 'linear-gradient(135deg,#FF9E2C,#FF7A18)',
          boxShadow: '0 9px 0 #2E2578',
          animation: 'bbMarkSpin .7s cubic-bezier(.22,1,.36,1) both',
        }}
      >
        <div className="h-[31%] w-[31%] rounded-[7px] bg-[#0E0B2B]" />
      </div>

      {/*
        `font-display` rather than a literal "Fredoka": `next/font` rewrites the
        family to a generated name, so naming the face directly here would
        quietly fall through to a system sans.
      */}
      <div className="whitespace-nowrap font-display text-[clamp(24px,7.4vw,34px)] font-bold tracking-[1px] text-[#0E0B2B]">
        BLENDER<span className="text-[#4B2FBF]">BATTLE</span>
      </div>

      <div className="flex items-center gap-2.5 whitespace-nowrap font-display text-[clamp(15px,4.4vw,19px)] font-bold uppercase tracking-[2.5px] text-[#2E2578]">
        <span>Loading</span>
        {/* Three dots hopping in sequence, one per brand colour. */}
        <span className="flex gap-1.5 pb-0.5" aria-hidden="true">
          {[
            { background: '#4B2FBF', delay: '0s' },
            { background: '#FF7A18', delay: '.15s' },
            { background: '#2E2578', delay: '.3s' },
          ].map((dot) => (
            <span
              key={dot.background}
              className="h-[9px] w-[9px] rounded-full"
              style={{
                background: dot.background,
                animation: `bbDot .9s ease-in-out ${dot.delay} infinite`,
              }}
            />
          ))}
        </span>
      </div>
    </div>
  );
}

/** The dotted field the panel sits on, at the design's own spacing. */
export const LOADING_DOTS_BACKDROP = {
  backgroundImage: 'radial-gradient(rgba(14,11,43,.09) 1.6px, transparent 1.7px)',
  backgroundSize: '34px 34px',
} as const;

/** The panel's ground, shared by the cover and the fallback. */
export const LOADING_PANEL_BACKGROUND = '#FFC93C';
