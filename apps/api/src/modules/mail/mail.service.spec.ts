import { afterEach, describe, expect, it, vi } from 'vitest';

import type { AppConfig } from '@/config/app.config';

import { MailService } from './mail.service';

/**
 * Three providers, one message.
 *
 * The failure worth guarding is quiet: a wrong request body gets a 4xx that the
 * service logs and swallows — by design, because the callers are auth flows
 * whose response must not depend on delivery. So a malformed payload does not
 * throw, does not fail a request, and shows up only as mail nobody receives.
 */
const config = (
  driver: 'log' | 'resend' | 'sendgrid' | 'brevo',
  from = 'Blender Battle <no-reply@bb.test>',
) =>
  ({
    mail: { driver, apiKey: 'key-123', from, frontendUrl: 'https://app.test' },
  }) as AppConfig;

const mail = { to: 'ada@example.com', subject: 'Confirm', text: 'link: https://app.test/x' };

afterEach(() => vi.unstubAllGlobals());

/** Captures the outgoing request instead of making one. */
function captureFetch(ok = true, status = 200) {
  const calls: Array<{ url: string; body: Record<string, unknown>; headers: Record<string, string> }> = [];

  vi.stubGlobal('fetch', async (url: string, init: RequestInit) => {
    calls.push({
      url,
      body: JSON.parse(String(init.body)),
      headers: init.headers as Record<string, string>,
    });
    return { ok, status, text: async () => 'provider said no' } as Response;
  });

  return calls;
}

describe('MailService — log driver', () => {
  it('sends nothing and reports success', async () => {
    const calls = captureFetch();

    await expect(new MailService(config('log')).send(mail)).resolves.toBe(true);
    expect(calls).toHaveLength(0);
  });
});

describe('MailService — resend', () => {
  it('posts the RFC 5322 from-string unchanged', async () => {
    // Resend takes one string. Splitting it here would be work that breaks it.
    const calls = captureFetch();
    await new MailService(config('resend')).send(mail);

    expect(calls[0]!.url).toBe('https://api.resend.com/emails');
    expect(calls[0]!.body).toMatchObject({
      from: 'Blender Battle <no-reply@bb.test>',
      to: ['ada@example.com'],
      subject: 'Confirm',
      text: mail.text,
    });
  });
});

describe('MailService — sendgrid', () => {
  it('posts SendGrid\'s nested shape, with the address split out', async () => {
    /*
      The providers disagree about `from`: Resend wants `Name <a@b.co>`,
      SendGrid and Brevo want `{ name, email }`. `MAIL_FROM` keeps the one
      format whichever driver is selected, so switching is an environment
      change and not a re-education about what that variable means.
    */
    const calls = captureFetch();
    await new MailService(config('sendgrid')).send(mail);

    expect(calls[0]!.url).toBe('https://api.sendgrid.com/v3/mail/send');
    expect(calls[0]!.body).toMatchObject({
      personalizations: [{ to: [{ email: 'ada@example.com' }] }],
      from: { email: 'no-reply@bb.test', name: 'Blender Battle' },
      subject: 'Confirm',
      content: [{ type: 'text/plain', value: mail.text }],
    });
  });

  it('accepts a bare address with no display name', async () => {
    const calls = captureFetch();
    await new MailService(config('sendgrid', 'no-reply@bb.test')).send(mail);

    expect(calls[0]!.body.from).toEqual({ email: 'no-reply@bb.test' });
  });

  it('strips quotes from a quoted display name', async () => {
    // `"Blender Battle" <a@b>` is legal and common from copy-paste; passing the
    // quotes through would put them in the recipient's inbox.
    const calls = captureFetch();
    await new MailService(config('sendgrid', '"Blender Battle" <no-reply@bb.test>')).send(mail);

    expect(calls[0]!.body.from).toEqual({ email: 'no-reply@bb.test', name: 'Blender Battle' });
  });
});

describe('MailService — brevo', () => {
  it("posts Brevo's shape and authenticates with its own header", async () => {
    /*
      Brevo is the one provider here that does not take a bearer token — it
      wants `api-key`. Sending `Authorization` instead earns a 401 that the
      service logs and swallows, so the symptom would be mail that silently
      never arrives.
    */
    const calls = captureFetch();
    await new MailService(config('brevo')).send(mail);

    expect(calls[0]!.url).toBe('https://api.brevo.com/v3/smtp/email');
    expect(calls[0]!.headers['api-key']).toBe('key-123');
    expect(calls[0]!.headers.Authorization).toBeUndefined();
    expect(calls[0]!.body).toMatchObject({
      sender: { email: 'no-reply@bb.test', name: 'Blender Battle' },
      to: [{ email: 'ada@example.com' }],
      subject: 'Confirm',
      textContent: mail.text,
    });
  });
});

describe('MailService — failure', () => {
  it('reports a refusal rather than throwing', async () => {
    /*
      Never throws: `forgot-password` must answer identically for a registered
      and an unregistered address, and a provider outage must not become a
      different status code for a real one. The boolean is how the one caller
      entitled to know — resending your own verification link — finds out.
    */
    captureFetch(false, 403);

    await expect(new MailService(config('sendgrid')).send(mail)).resolves.toBe(false);
  });

  it('reports a network failure rather than throwing', async () => {
    vi.stubGlobal('fetch', async () => {
      throw new Error('getaddrinfo ENOTFOUND');
    });

    await expect(new MailService(config('resend')).send(mail)).resolves.toBe(false);
  });
});
