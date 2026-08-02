import type { Metadata, Viewport } from 'next';

import { InstallPrompt, ServiceWorkerRegistrar } from '@/components/pwa/install-prompt';
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
  manifest: '/manifest.webmanifest',
  icons: {
    icon: [
      { url: '/icon-192.png', sizes: '192x192', type: 'image/png' },
      { url: '/icon-512.png', sizes: '512x512', type: 'image/png' },
    ],
    // iOS ignores the manifest's icons entirely and reads this instead.
    apple: '/apple-touch-icon.png',
  },
  appleWebApp: {
    capable: true,
    title: 'Blender Battle',
    // The app paints its own dark ground to the edges, so the status bar should
    // sit over it rather than reserving an opaque strip of its own.
    statusBarStyle: 'black-translucent',
  },
};

export const viewport: Viewport = {
  // Matches --color-arcade-deep, so the browser chrome and the page are one
  // surface instead of two.
  themeColor: '#14103A',
  // The app is a full-bleed dark canvas; letting it run under the notch and the
  // home indicator is what makes an installed copy look installed.
  viewportFit: 'cover',
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
          <ServiceWorkerRegistrar />
          <InstallPrompt />
        </Providers>
      </body>
    </html>
  );
}
