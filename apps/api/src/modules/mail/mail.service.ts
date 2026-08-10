import { Injectable, Logger } from '@nestjs/common';
import { createTransport, type Transporter } from 'nodemailer';

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
 * ## HTTP first, SMTP as the escape hatch
 *
 * The hosted providers are one HTTPS POST and no SDK, which is the right shape
 * for sending two links. SMTP was deliberately avoided at first for that
 * reason, and because an SMTP socket rules out hosts with no outbound TCP.
 *
 * It is here anyway because every hosted provider gates sending behind a signup
 * that can simply refuse you — Resend needs a verified domain to reach anyone
 * but the account holder, and SendGrid turns away a good share of new accounts.
 * A mail driver nobody can obtain credentials for is not a mail driver. An SMTP
 * mailbox someone already owns has no such gate, so `smtp` is the option that
 * cannot be taken away.
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

  /**
   * Built once, on first use.
   *
   * Nodemailer pools and reuses connections, so one transporter across the
   * process is both faster and better mannered than opening a TLS session per
   * message — Gmail in particular throttles connection churn. Lazy rather than
   * constructed up front so a deployment on any other driver never opens a
   * socket it will not use.
   */
  private transporter: Transporter | null = null;

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

    if (driver === 'smtp') return this.sendViaSmtp(mail, from);

    try {
      const response = await this.dispatch(mail, driver, apiKey, from);

      if (!response.ok) {
        /*
          The body carries the provider's reason, and it is usually the actual
          answer — an unverified domain, an unverified single sender, a bad key.
          Logged without the recipient's address, which is not needed to fix any
          of those and is the one part worth not writing down.
        */
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

  /**
   * Plain SMTP.
   *
   * Separate from `dispatch` because it is not an HTTP request at all — sharing
   * a code path with the three fetch-based providers would mean a wrapper that
   * exists only to make two unlike things look alike.
   *
   * Honours the same contract as everything else here: never throws, returns
   * whether the message went, and logs the reason when it did not. Nodemailer's
   * errors are unusually good — "Invalid login" for a normal password used
   * where an App Password is required, and it says so.
   */
  private async sendViaSmtp(mail: OutgoingMail, from: string): Promise<boolean> {
    const { host, port, user, password } = this.config.mail.smtp;

    try {
      this.transporter ??= createTransport({
        host,
        port,
        // 465 is implicit TLS; 587 upgrades with STARTTLS after connecting.
        // Deriving it from the port rather than adding a variable nobody would
        // know how to set.
        secure: port === 465,
        auth: { user: user ?? '', pass: password ?? '' },
      });

      await this.transporter.sendMail({
        from,
        to: mail.to,
        subject: mail.subject,
        text: mail.text,
      });

      return true;
    } catch (error) {
      /*
        The transporter is discarded on failure.

        A pooled connection that has gone bad stays bad, and keeping it would
        turn one network blip into every subsequent send failing. The next call
        builds a fresh one.
      */
      this.transporter = null;
      this.logger.error(`SMTP send failed: ${(error as Error).message}`);
      return false;
    }
  }

  /**
   * The provider call. One request, three shapes.
   *
   * Each is a single authenticated POST of the same four values, so the split
   * is a URL, a header and a body rather than an abstraction. Nothing above
   * this method knows which provider is in use, which is what makes switching
   * an environment variable instead of a deployment.
   *
   * SendGrid and Brevo exist here for one reason: both verify a *single sender
   * address* rather than a domain, so a deployment with no domain of its own
   * can still email arbitrary recipients. Resend cannot do that — without a
   * verified domain it delivers only to the account holder's own address, which
   * is correct of them and useless for a real signup flow.
   *
   * Two of them rather than one because signing up is itself a failure mode:
   * SendGrid rejects a good share of new accounts outright, and a mail driver
   * nobody can obtain credentials for is not a mail driver. Brevo is the easier
   * door, and having both costs a dozen lines.
   *
   * The trade is deliverability. Mail from a shared sender with no DKIM or SPF
   * on a domain you control is filtered harder, and some of it lands in spam.
   * That is a fair price for a stopgap and a bad basis for a product, so
   * `resend` with a verified domain stays the recommended configuration.
   */
  private dispatch(
    mail: OutgoingMail,
    driver: 'resend' | 'sendgrid' | 'brevo',
    apiKey: string | undefined,
    from: string,
  ): Promise<Response> {
    const json = { 'Content-Type': 'application/json' };
    const bearer = { ...json, Authorization: `Bearer ${apiKey}` };

    if (driver === 'sendgrid') {
      return fetch('https://api.sendgrid.com/v3/mail/send', {
        method: 'POST',
        headers: bearer,
        body: JSON.stringify({
          personalizations: [{ to: [{ email: mail.to }] }],
          from: parseAddress(from),
          subject: mail.subject,
          content: [{ type: 'text/plain', value: mail.text }],
        }),
      });
    }

    if (driver === 'brevo') {
      return fetch('https://api.brevo.com/v3/smtp/email', {
        method: 'POST',
        // Brevo authenticates with its own header, not a bearer token. The one
        // place the three providers differ beyond the body shape.
        headers: { ...json, accept: 'application/json', 'api-key': apiKey ?? '' },
        body: JSON.stringify({
          sender: parseAddress(from),
          to: [{ email: mail.to }],
          subject: mail.subject,
          textContent: mail.text,
        }),
      });
    }

    return fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: bearer,
      body: JSON.stringify({
        from,
        to: [mail.to],
        subject: mail.subject,
        text: mail.text,
      }),
    });
  }

  /** Absolute link into the web app, not the API. */
  link(path: string): string {
    return new URL(path, this.config.mail.frontendUrl).toString();
  }
}

/**
 * `Name <a@b.co>` into its parts, for providers that want them separately.
 *
 * A bare `a@b.co` is equally valid and yields no name, which both SendGrid and
 * Brevo accept — they simply show the address. Anything unparseable is passed
 * through as the address so the provider can reject it with a message worth
 * reading, rather than this throwing somewhere far from the cause.
 */
function parseAddress(value: string): { email: string; name?: string } {
  const match = /^\s*(.*?)\s*<([^>]+)>\s*$/.exec(value);
  if (!match) return { email: value.trim() };

  const name = match[1]?.replace(/^"|"$/g, '').trim();
  return name ? { email: match[2]!.trim(), name } : { email: match[2]!.trim() };
}
