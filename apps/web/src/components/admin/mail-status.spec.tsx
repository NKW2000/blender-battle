import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * The mail panel.
 *
 * Verification and reset failures are swallowed on purpose — `forgot password`
 * has to answer identically for a registered and an unknown address — so a
 * broken mail setup is invisible everywhere else in the product. This panel is
 * the only thing that says otherwise, which makes "it reports the truth" the
 * property worth holding.
 *
 * The distinction it exists for: configured is not working. A wrong app password
 * satisfies every configuration check and still refuses every send.
 */

const mutate = vi.fn();
let state: {
  data?: { ok: boolean; detail: string };
  isPending: boolean;
  isError: boolean;
  error?: { message: string };
} = { isPending: false, isError: false };

vi.mock('@/features/analytics/use-analytics', () => ({
  useMailCheck: () => ({ ...state, mutate }),
}));

const { MailStatus } = await import('./mail-status');

describe('the mail panel', () => {
  beforeEach(() => {
    state = { isPending: false, isError: false };
    mutate.mockClear();
  });

  it('says plainly when nothing is being delivered', () => {
    render(<MailStatus driver="log" canSend={false} />);

    expect(screen.getByText(/not being delivered/i)).toBeInTheDocument();
    expect(screen.getByText(/written to the server log and never sent/i)).toBeInTheDocument();
  });

  it('does not call configured credentials working', () => {
    /*
      The reason the button exists. `canSend` only reports that the variables are
      present, and a wrong password looks exactly like a right one from here — so
      this must not read as an all-clear.
    */
    render(<MailStatus driver="smtp" canSend />);

    expect(screen.getByText(/not the same as working/i)).toBeInTheDocument();
  });

  it('only runs the live check when asked', async () => {
    // It authenticates against a third party, so a render or a refetch must not
    // trigger it.
    render(<MailStatus driver="smtp" canSend />);
    expect(mutate).not.toHaveBeenCalled();

    await userEvent.click(screen.getByRole('button', { name: /test the connection/i }));

    await waitFor(() => expect(mutate).toHaveBeenCalledTimes(1));
  });

  it('reports the provider’s own refusal, word for word', () => {
    /*
      Not paraphrased. The server's message names the missing variable or quotes
      what the provider said — "535 Username and Password not accepted" is the
      difference between fixing it in a minute and guessing for an hour.
    */
    state = {
      isPending: false,
      isError: false,
      data: { ok: false, detail: '535 Username and Password not accepted' },
    };

    render(<MailStatus driver="smtp" canSend />);

    expect(screen.getByText('535 Username and Password not accepted')).toBeInTheDocument();
  });

  it('turns the panel to a warning when the live check fails a configured driver', () => {
    // Credentials present, handshake refused: the panel has to stop looking calm.
    state = { isPending: false, isError: false, data: { ok: false, detail: 'refused' } };

    render(<MailStatus driver="smtp" canSend />);

    expect(screen.getByText(/not being delivered/i)).toBeInTheDocument();
  });

  it('confirms success without overclaiming', () => {
    state = {
      isPending: false,
      isError: false,
      data: { ok: true, detail: 'SMTP accepted the connection and the credentials.' },
    };

    render(<MailStatus driver="smtp" canSend />);

    expect(screen.getByText(/SMTP accepted the connection/i)).toBeInTheDocument();
    expect(screen.queryByText(/not being delivered/i)).not.toBeInTheDocument();
  });

  it('says so when the check itself could not run', () => {
    // A failed request is not a failed mail server, and reporting one as the
    // other sends the reader to fix the wrong thing.
    state = { isPending: false, isError: true, error: { message: 'Network error' } };

    render(<MailStatus driver="smtp" canSend />);

    expect(screen.getByText(/could not run: Network error/i)).toBeInTheDocument();
  });

  it('does not let the button be pressed twice while it is working', () => {
    state = { isPending: true, isError: false };

    render(<MailStatus driver="smtp" canSend />);

    expect(screen.getByRole('button', { name: /testing/i })).toBeDisabled();
  });
});
