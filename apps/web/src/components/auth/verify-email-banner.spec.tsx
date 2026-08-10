import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { VerifyEmailBanner } from './verify-email-banner';

/**
 * The banner is the only thing telling an unverified account why the ballot
 * refuses it, so "renders nothing" and "overflows the phone" are both failures
 * that would go unnoticed — one is invisible by definition and the other only
 * shows at a width nobody develops at.
 */
const session = vi.hoisted(() => ({ user: null as unknown }));

vi.mock('@/features/auth/use-session', () => ({
  useSession: () => session,
}));
const resend = vi.hoisted(() => ({
  mutate: vi.fn(),
  isPending: false,
  isSuccess: false,
  data: undefined as { result: string } | undefined,
}));

vi.mock('@/features/auth/use-recovery', () => ({
  useResendVerification: () => resend,
}));

const asUser = (overrides: Record<string, unknown> = {}) => {
  session.user = { email: 'ada@example.com', emailVerifiedAt: null, ...overrides };
  resend.isSuccess = false;
  resend.data = undefined;
};

describe('VerifyEmailBanner', () => {
  it('says nothing to a confirmed account', () => {
    asUser({ emailVerifiedAt: '2026-01-01T00:00:00.000Z' });
    const { container } = render(<VerifyEmailBanner />);

    expect(container).toBeEmptyDOMElement();
  });

  it('says nothing to a signed-out visitor', () => {
    session.user = null;
    const { container } = render(<VerifyEmailBanner />);

    expect(container).toBeEmptyDOMElement();
  });

  it('names the address it sent to, and offers a resend', () => {
    asUser();
    render(<VerifyEmailBanner />);

    expect(screen.getByText('ada@example.com')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Send again' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Dismiss' })).toBeInTheDocument();
  });

  it('lets a long address break instead of widening the page', () => {
    /*
      An email is a single unbroken token to the browser. On a 360px screen an
      address like this one pushes the banner past the viewport and makes the
      whole page scroll sideways — the failure only appears at a width nobody
      develops at, which is exactly why it is asserted rather than eyeballed.
    */
    asUser({ email: 'an.extremely.long.address.someone.actually.uses@a-very-long-domain.example.com' });
    render(<VerifyEmailBanner />);

    expect(screen.getByText(/an\.extremely\.long/)).toHaveClass('break-all');
  });

  it('says so when the provider refused, rather than claiming success', async () => {
    /*
      The failure this exists for. On a testing sender the provider will only
      accept one address, so "Sent" is a lie that leaves the user waiting for a
      message that was rejected before it left. The offer to retry stays.
    */
    asUser();
    resend.isSuccess = true;
    resend.data = { result: 'send-failed' };
    render(<VerifyEmailBanner />);

    expect(screen.getByText(/could not send/i)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Try again' })).toBeInTheDocument();
  });

  it('confirms a real send', async () => {
    asUser();
    resend.isSuccess = true;
    resend.data = { result: 'sent' };
    render(<VerifyEmailBanner />);

    expect(screen.getByText(/Sent again to/i)).toBeInTheDocument();
  });

  it('disappears when dismissed', async () => {
    const { default: userEvent } = await import('@testing-library/user-event');
    asUser();
    const { container } = render(<VerifyEmailBanner />);

    await userEvent.click(screen.getByRole('button', { name: 'Dismiss' }));

    expect(container).toBeEmptyDOMElement();
  });
});
