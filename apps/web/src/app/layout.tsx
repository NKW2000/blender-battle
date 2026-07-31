import type { Metadata } from 'next';
import { Fredoka, Nunito } from 'next/font/google';

import { Providers } from './providers';

import './globals.css';

/**
 * The two faces the design actually uses.
 *
 * Archivo, IBM Plex Sans and IBM Plex Mono were also being loaded here — five
 * families and thirteen weight files on every page — but every font token in
 * `globals.css` resolves to Fredoka or Nunito, so none of the other three were
 * ever painted. They were pure download cost on first render, on the critical
 * path, for glyphs nothing referenced.
 *
 * Fredoka carries the display voice — rounded and loud — with Nunito underneath
 * it at heavy weights for body copy, which is what keeps the playful register
 * from collapsing into illegibility at small sizes.
 *
 * `preload` is on (the default) because both are used above the fold on every
 * route, and `display: swap` means text paints immediately in the fallback
 * rather than sitting invisible while the webfont arrives.
 */
const fredoka = Fredoka({
  subsets: ['latin'],
  weight: ['500', '600', '700'],
  variable: '--font-fredoka',
  display: 'swap',
});

const nunito = Nunito({
  subsets: ['latin'],
  // All four are genuinely used: font-semibold (600) 12x, font-bold (700) 76x,
  // font-extrabold (800) 35x, font-black (900) 7x. Dropping any would leave the
  // browser synthesising it from a neighbour, which smears the letterforms.
  weight: ['600', '700', '800', '900'],
  variable: '--font-nunito',
  display: 'swap',
});

export const metadata: Metadata = {
  title: 'Blender Battle',
  description: 'Live modelling duels for Blender artists. Draw a challenge, build, get judged.',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html
      lang="en"
      className={`${fredoka.variable} ${nunito.variable}`}
    >
      <body>
        <Providers>
          <div className="relative z-10">{children}</div>
        </Providers>
      </body>
    </html>
  );
}
