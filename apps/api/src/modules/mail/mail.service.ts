import { Injectable, Logger } from '@nestjs/common';

import { AppConfig } from '@/config/app.config';

export interface OutgoingMail {
  to: string;
  subject: string;
  /** Plain text. Every message this app sends is a sentence and a link. */
  text: string;
}

/**
 * Transactional email.
 *
 * The platform had none at all — no dependency, no provider, no tokens table —
 * which meant a forgotten password destroyed an account permanently. That is
 * the kind of thing a real user hits once and never comes back from.
 *
 * ## Why an HTTP API and not SMTP
 *
 * No `nodemailer`, no SMTP socket. The only two things this needs to send are a
 * reset link and a verification link, and an HTTPS POST does that with a
 * dependency the runtime already has. It also keeps the API deployable to
 * environments with no outbound TCP, which an SMTP client would rule out.
 *
 * ## Why plain text
 *
 * A password reset that arrives as an HTML email with a styled button is the
 * exact shape of a phishing message, and it renders badly in half of the
 * clients that matter. One sentence and a visible URL is more trustworthy and
 * cannot be misread.
 */
@Injectable()
export class MailService {
  private readonly logger = new Logger(MailService.name);

  constructor(private readonly config: AppConfig) {}

  /**
   * Sends, or logs. Returns whether it actually went.
   *
   * Never throws — several callers are flows whose response must not depend on
   * the outcome. `forgot password` answers the same way whether or not the
   * address exists, and it would defeat that if a provider outage produced a
   * different status code for a real address than for an unknown one.
   *
   * It returns a boolean rather than nothing so a caller that *is* entitled to
   * care can act on it. Resending your own verification link is authenticated
   * and targets your own address: there is nothing to leak there, and reporting
   * "sent" when the provider refused only leaves someone waiting for mail that
   * never left the building.
   */
  async send(mail: OutgoingMail): Promise<boolean> {
    const { driver, apiKey, from } = this.config.mail;

    if (driver === 'log') {
      /*
        The whole message, including the link.

        This is a development convenience and it is important that it is
        obvious: anyone reading the log can use the token. The environment
        schema refuses to boot a production process with this driver and no
        provider key, so this branch cannot be reached in production by
        accident.
      */
      this.logger.log(
        `[mail:log] to=${mail.to} subject="${mail.subject}"\n${mail.text}`,
      );
      // Written somewhere a developer can read it, which counts as delivered
      // for this driver's purposes.
      return true;
    }

    try {
      const response = await fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${apiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          from,
          to: [mail.to],
          subject: mail.subject,
          text: mail.text,
        }),
      });

      if (!response.ok) {
        // The body carries the provider's reason (unverified domain, bad key).
        // Logged without the recipient's address, which is not needed to fix it.
        this.logger.error(
          `Mail send failed (${response.status}): ${await response.text()}`,
        );
        return false;
      }

      return true;
    } catch (error) {
      this.logger.error(`Mail send threw: ${(error as Error).message}`);
      return false;
    }
  }

  /** Absolute link into the web app, not the API. */
  link(path: string): string {
    return new URL(path, this.config.mail.frontendUrl).toString();
  }
}
