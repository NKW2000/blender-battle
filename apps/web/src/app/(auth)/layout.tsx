/**
 * Pass-through.
 *
 * The auth screens each own their full-bleed composition — the login and
 * register pages carry their own split panel, and the OAuth callback is a
 * centred status screen. A shared chrome here would fight all three.
 */
export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
