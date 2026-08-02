'use client';

import { useEffect, useState } from 'react';

import { ChunkyButton } from '@/components/arcade/chunky';
import { cn } from '@/lib/utils';

/**
 * The event Chromium fires when a site meets the install criteria. It is not in
 * the DOM lib because it is not a standard, which is also why iOS never fires
 * it — see the note on the manual path below.
 */
interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
}

const DISMISSED_KEY = 'bb.install.dismissed';

/** Standalone means it is already installed and running from the home screen. */
function isStandalone(): boolean {
  if (typeof window === 'undefined') return false;
  return (
    window.matchMedia('(display-mode: standalone)').matches ||
    // Safari's own flag, which predates the standard media query.
    (window.navigator as Navigator & { standalone?: boolean }).standalone === true
  );
}

function isIos(): boolean {
  if (typeof window === 'undefined') return false;
  return (
    /iphone|ipad|ipod/i.test(window.navigator.userAgent) ||
    // iPadOS reports itself as a Mac; the touch points give it away.
    (window.navigator.platform === 'MacIntel' && window.navigator.maxTouchPoints > 1)
  );
}

/**
 * Offers to install the app.
 *
 * Two routes, because the platforms genuinely differ rather than out of
 * defensiveness. Chromium fires `beforeinstallprompt` and lets a button call
 * `prompt()`. WebKit implements none of it: on iOS the only way in is Share →
 * Add to Home Screen, performed by hand, so there the button is replaced by
 * instructions. A single "Install" button on iOS would be a button that cannot
 * work.
 *
 * Nothing renders when the app is already installed, when the browser has not
 * said it is installable, or once the offer has been dismissed.
 */
export function InstallPrompt() {
  const [deferred, setDeferred] = useState<BeforeInstallPromptEvent | null>(null);
  const [showIosHelp, setShowIosHelp] = useState(false);
  const [dismissed, setDismissed] = useState(true);

  useEffect(() => {
    if (isStandalone()) return;
    if (localStorage.getItem(DISMISSED_KEY) === '1') return;

    setDismissed(false);

    // iOS never fires the event, so the manual path is offered on sight.
    if (isIos()) {
      setShowIosHelp(true);
      return;
    }

    const onBeforeInstall = (event: Event) => {
      // Suppress the browser's own mini-infobar so the offer appears where the
      // rest of the interface is, not in Chrome's chrome.
      event.preventDefault();
      setDeferred(event as BeforeInstallPromptEvent);
    };
    const onInstalled = () => {
      setDeferred(null);
      setDismissed(true);
    };

    window.addEventListener('beforeinstallprompt', onBeforeInstall);
    window.addEventListener('appinstalled', onInstalled);
    return () => {
      window.removeEventListener('beforeinstallprompt', onBeforeInstall);
      window.removeEventListener('appinstalled', onInstalled);
    };
  }, []);

  const close = () => {
    setDismissed(true);
    localStorage.setItem(DISMISSED_KEY, '1');
  };

  const install = async () => {
    if (!deferred) return;
    await deferred.prompt();
    await deferred.userChoice;
    // The event is single-use; a second prompt() on it throws.
    setDeferred(null);
    close();
  };

  if (dismissed) return null;
  if (!deferred && !showIosHelp) return null;

  return (
    <div
      className={cn(
        'fixed inset-x-3 bottom-3 z-[55] rounded-2xl border-[3px] border-ink bg-panel-raised p-4',
        'shadow-[0_6px_0_var(--color-ink)] sm:left-auto sm:right-4 sm:w-96',
      )}
      role="complementary"
      aria-label="Install Blender Battle"
    >
      <div className="flex items-start gap-3">
        {/* eslint-disable-next-line @next/next/no-img-element -- a static icon
            from /public at a fixed size; the optimiser adds a round trip and a
            transform for no benefit. */}
        <img
          src="/icon-192.png"
          alt=""
          width={44}
          height={44}
          className="h-11 w-11 shrink-0 rounded-xl border-2 border-ink"
        />

        <div className="min-w-0 flex-1">
          <p className="font-display text-sm font-bold text-cream">Install Blender Battle</p>
          <p className="mt-1 text-xs font-extrabold leading-relaxed text-bone-muted">
            {showIosHelp
              ? 'Tap Share, then “Add to Home Screen”.'
              : 'Add it to your home screen — full screen, no address bar.'}
          </p>

          <div className="mt-3 flex items-center gap-2">
            {deferred ? (
              <ChunkyButton size="sm" onClick={install}>
                Install
              </ChunkyButton>
            ) : null}
            <button
              type="button"
              onClick={close}
              className="arcade-focus rounded-xl px-3 py-2 text-xs font-extrabold text-bone-faint hover:text-bone"
            >
              {showIosHelp ? 'Got it' : 'Not now'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

/**
 * Registers the service worker.
 *
 * Split from the prompt because it has to run whether or not the offer is
 * shown: Chromium will not consider the site installable until a worker
 * controlling the scope is active.
 */
export function ServiceWorkerRegistrar() {
  useEffect(() => {
    if (!('serviceWorker' in navigator)) return;
    // Registration failing is not worth surfacing — the app works without it,
    // and the only cost is that the install offer never appears.
    navigator.serviceWorker.register('/sw.js').catch(() => {});
  }, []);

  return null;
}
