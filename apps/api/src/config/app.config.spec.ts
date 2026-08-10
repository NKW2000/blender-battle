import { describe, expect, it } from 'vitest';

import { AppConfig } from './app.config';

/**
 * Typed accessors over the environment.
 *
 * Mostly pass-through, and not worth testing as such. The exception is the SMTP
 * password, which is normalised — and normalisation that is wrong is worse than
 * none, because it fails somewhere far from where anyone would look.
 */
const configWith = (values: Record<string, unknown>) =>
  new AppConfig({ get: (key: string) => values[key] } as never);

describe('AppConfig.mail.smtp', () => {
  it('strips the spaces Google puts in an App Password', () => {
    /*
      Google shows an App Password as four groups of four — "abcd efgh ijkl
      mnop" — and it is copied that way more often than not. The spaces are
      presentation, not part of the secret, and leaving them in produces
      "Invalid login", which says nothing about spaces and sends people looking
      at their account settings instead.
    */
    const config = configWith({ SMTP_PASSWORD: 'abcd efgh ijkl mnop', SMTP_PORT: 465 });

    expect(config.mail.smtp.password).toBe('abcdefghijklmnop');
  });

  it('leaves a password with no spaces alone', () => {
    const config = configWith({ SMTP_PASSWORD: 'abcdefghijklmnop', SMTP_PORT: 465 });

    expect(config.mail.smtp.password).toBe('abcdefghijklmnop');
  });

  it('is undefined rather than an empty string when unset', () => {
    // The driver check at boot tests for absence; an empty string would pass it
    // and then fail at send time instead.
    expect(configWith({ SMTP_PORT: 465 }).mail.smtp.password).toBeUndefined();
  });
});
