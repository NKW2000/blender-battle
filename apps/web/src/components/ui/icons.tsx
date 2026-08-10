'use client';

/**
 * The icon set.
 *
 * These replace the raw emoji that were standing in for reactions, sound and
 * notifications. Emoji were never really part of this design language: they are
 * rendered by the operating system, so they carry another vendor's palette,
 * weight and corner radius, and they look different on every machine. These are
 * drawn from the same vocabulary as everything else — flat fills, ink outlines,
 * chunky geometry — so they sit with the buttons and cards rather than on top of
 * them, and they animate.
 *
 * `currentColor` is deliberately avoided for fills: these are polychrome marks,
 * and the outline is always ink so they read against both the saturated fills
 * and the dark ground.
 */

const INK = '#0E0B2B';

type IconProps = {
  /** Pixel size; the viewBox is square so one number is enough. */
  size?: number;
  className?: string;
  /** Plays the icon's own motion, e.g. while its button is hovered or active. */
  animate?: boolean;
};

function Svg({
  size = 22,
  className,
  children,
}: IconProps & { children: React.ReactNode }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      aria-hidden="true"
      focusable="false"
      className={className}
      style={{ display: 'block', overflow: 'visible' }}
    >
      {children}
    </svg>
  );
}

/** Reaction: fire. Two flame bodies so the inner one can flicker independently. */
export function FireIcon({ animate, ...rest }: IconProps) {
  return (
    <Svg {...rest}>
      <g style={animate ? { animation: 'bbFlicker .5s ease-in-out infinite' } : undefined}>
        <path
          d="M12 2.5c2.6 3 1.2 4.9 2.6 6.1 1 .9 2-.2 2-1.6 2.2 2 3.4 4 3.4 6.6A8 8 0 1 1 4 13.6c0-3.5 2.3-5.6 4.2-7.7C9.9 4.1 11.4 3.6 12 2.5Z"
          fill="#FFD23F"
          stroke={INK}
          strokeWidth="2"
          strokeLinejoin="round"
        />
        <path
          d="M12 21a4 4 0 0 1-4-4c0-2 1.6-3.2 2.6-4.4.6-.7 1.1-1.5 1.4-2.6.9 1.6 4 3.2 4 7a4 4 0 0 1-4 4Z"
          fill="#FFD23F"
          stroke={INK}
          strokeWidth="1.6"
          strokeLinejoin="round"
        />
      </g>
    </Svg>
  );
}

/** Sound on. The two arcs pulse outward. */
export function SoundOnIcon({ animate, ...rest }: IconProps) {
  return (
    <Svg {...rest}>
      <path
        d="M4 9.5h3.2L11.5 6v12L7.2 14.5H4a1 1 0 0 1-1-1v-3a1 1 0 0 1 1-1Z"
        fill="#FFD23F"
        stroke={INK}
        strokeWidth="2"
        strokeLinejoin="round"
      />
      <path
        d="M15 9.2a4 4 0 0 1 0 5.6"
        stroke={INK}
        strokeWidth="2"
        strokeLinecap="round"
        style={animate ? { animation: 'bbWave .9s ease-in-out infinite' } : undefined}
      />
      <path
        d="M17.8 6.8a7.6 7.6 0 0 1 0 10.4"
        stroke={INK}
        strokeWidth="2"
        strokeLinecap="round"
        style={animate ? { animation: 'bbWave .9s .15s ease-in-out infinite' } : undefined}
      />
    </Svg>
  );
}

/** Sound off. Same speaker body, so toggling reads as one object changing state. */
export function SoundOffIcon(props: IconProps) {
  return (
    <Svg {...props}>
      <path
        d="M4 9.5h3.2L11.5 6v12L7.2 14.5H4a1 1 0 0 1-1-1v-3a1 1 0 0 1 1-1Z"
        fill="#6E67A0"
        stroke={INK}
        strokeWidth="2"
        strokeLinejoin="round"
      />
      <path d="M15.4 9.6 20.2 14.4" stroke={INK} strokeWidth="2" strokeLinecap="round" />
      <path d="M20.2 9.6 15.4 14.4" stroke={INK} strokeWidth="2" strokeLinecap="round" />
    </Svg>
  );
}

/** Notifications. The bell swings and the clapper trails it. */
export function BellIcon({ animate, ...rest }: IconProps) {
  return (
    <Svg {...rest}>
      <g
        style={
          animate
            ? { animation: 'bbRing .7s ease-in-out infinite', transformOrigin: '12px 4px' }
            : undefined
        }
      >
        <path
          d="M12 3a6 6 0 0 1 6 6v3.4l1.5 2.6a1 1 0 0 1-.9 1.5H5.4a1 1 0 0 1-.9-1.5L6 12.4V9a6 6 0 0 1 6-6Z"
          fill="#FFD23F"
          stroke={INK}
          strokeWidth="2"
          strokeLinejoin="round"
        />
        <path
          d="M9.8 19a2.2 2.2 0 0 0 4.4 0"
          stroke={INK}
          strokeWidth="2"
          strokeLinecap="round"
          fill="none"
        />
      </g>
    </Svg>
  );
}

/**
 * Directional chevrons, drawn rather than typed.
 *
 * The glyph characters they replace could not be centred reliably. Flexbox
 * centres the line box, which is laid out from the font's ascent and descent,
 * while the mark itself sits on the baseline — and in Fredoka the ink of `‹`
 * centres 4px above the baseline where a full-height `M` centres 6px above. The
 * arrow therefore painted about 2px low inside every button that held one, and
 * at button sizes that reads as sitting on the floor rather than in the middle.
 *
 * A path has no baseline and no side bearings: it is centred by its viewBox, so
 * it lands where the box says it does at any size.
 *
 * `currentColor` here, unlike the polychrome marks above, because these are UI
 * furniture that must take the colour of whatever control they sit in.
 */
export function ChevronIcon({
  direction = 'right',
  size = 18,
  className,
}: {
  direction?: 'up' | 'down' | 'left' | 'right';
  size?: number;
  className?: string;
}) {
  const rotation = { right: 0, down: 90, left: 180, up: 270 }[direction];

  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      aria-hidden="true"
      focusable="false"
      className={className}
      style={{ display: 'block', transform: `rotate(${rotation}deg)` }}
    >
      <path
        d="M9 5l7 7-7 7"
        stroke="currentColor"
        strokeWidth="3"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}
