import { createHash, randomBytes } from 'node:crypto';

import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { ActivityAction, ApiErrorCode, PASSWORD_MIN_LENGTH } from '@bb/shared';
import { IsNull, Repository } from 'typeorm';

import { AppException } from '@/common/exceptions/app.exception';
import { ActivityLogService } from '@/modules/activity-log/activity-log.service';
import { MailService } from '@/modules/mail/mail.service';
import { User } from '@/modules/users/entities/user.entity';

import { AccountToken, AccountTokenPurpose } from '../entities/account-token.entity';
import { TokenFamilyRevokeReason } from '../entities/refresh-token-family.entity';
import { PasswordService } from './password.service';
import { TokenService } from './token.service';

/** How long a link is good for, by purpose. */
const TTL_MINUTES: Record<AccountTokenPurpose, number> = {
  /*
    Short. A reset link is a bearer credential for a whole account sitting in an
    inbox, and an inbox is exactly what gets left open on a shared machine. An
    hour is enough to read an email and act on it.
  */
  [AccountTokenPurpose.PASSWORD_RESET]: 60,
  /*
    Long. Verification is not a credential — the worst a stolen one does is
    confirm an address the thief already controls — and expiring it overnight
    strands anyone who registered before a weekend.
  */
  [AccountTokenPurpose.EMAIL_VERIFICATION]: 60 * 24 * 3,
};

/**
 * Password reset and email verification.
 *
 * Two rules run through all of it:
 *
 *  - **Never confirm whether an address is registered.** Every entry point
 *    answers identically for a known and an unknown address. An endpoint that
 *    said "no such account" would be a free membership oracle, and this app
 *    puts usernames on public profiles, so confirming the email behind one is
 *    a real disclosure.
 *  - **The token is a secret, so only its hash is stored.** Same reasoning as
 *    refresh tokens: a database dump must not be replayable.
 */
@Injectable()
export class AccountRecoveryService {
  private readonly logger = new Logger(AccountRecoveryService.name);

  constructor(
    @InjectRepository(User) private readonly users: Repository<User>,
    @InjectRepository(AccountToken) private readonly tokens: Repository<AccountToken>,
    private readonly mail: MailService,
    private readonly passwords: PasswordService,
    private readonly sessions: TokenService,
    private readonly activity: ActivityLogService,
  ) {}

  // --- Issuing ---------------------------------------------------------------

  /**
   * Emails a reset link, if the address belongs to an account.
   *
   * Returns nothing either way, and the controller answers 204 either way.
   */
  async requestPasswordReset(email: string, context: { ipAddress?: string | null }): Promise<void> {
    /*
      `passwordHash` is asked for explicitly.

      The column is `select: false` on the entity, so an ordinary `findOne`
      returns it as undefined — which made the "this account has no password"
      branch below true for *every* account, including ones that very much had
      one. Every reset request answered with the OAuth-only email and no token
      was ever minted. Nothing threw, the endpoint still returned 204, and the
      unit tests passed because a hand-written fake returns whatever it is told
      to; only running the flow showed it.
    */
    const user = await this.users.findOne({
      where: { email },
      select: { id: true, email: true, passwordHash: true, emailVerifiedAt: true },
    });

    /*
      Deliberately silent.

      No error, no log at warn level, no different timing worth measuring — the
      caller cannot distinguish this from a delivered email, which is the whole
      point.
    */
    if (!user) return;

    /*
      An OAuth-only account has no password to reset.

      Sending a reset link would let someone set a password on an account they
      reached through Discord, which is a legitimate feature — but it is a
      different one, and doing it silently through the *forgot* flow means an
      attacker who knows the address can turn a provider-only account into a
      password account. So this stops here, and says so in an email to the
      owner rather than in the response.
    */
    if (!user.passwordHash) {
      await this.mail.send({
        to: user.email,
        subject: 'Blender Battle password reset',
        text:
          `Somebody asked to reset the password for this address.\n\n` +
          `This account signs in with Discord or Google and has no password, ` +
          `so there is nothing to reset — sign in with the provider you used.\n\n` +
          `If that was not you, you can ignore this.`,
      });
      return;
    }

    const token = await this.issue(user, AccountTokenPurpose.PASSWORD_RESET);

    await this.mail.send({
      to: user.email,
      subject: 'Reset your Blender Battle password',
      text:
        `Open this link to choose a new password:\n\n` +
        `${this.mail.link(`/reset-password?token=${token}`)}\n\n` +
        `It stops working in an hour, and can only be used once.\n\n` +
        `If you did not ask for this, ignore it — nothing has changed.`,
    });

    await this.activity.record({
      action: ActivityAction.SECURITY_PASSWORD_RESET_REQUESTED,
      actorId: user.id,
      entityType: 'user',
      entityId: user.id,
      ipAddress: context.ipAddress ?? null,
      userAgent: null,
      metadata: {},
    });
  }

  /** Emails a fresh verification link. No-op for an already-verified address. */
  async requestEmailVerification(user: User): Promise<void> {
    if (user.emailVerifiedAt) return;

    const token = await this.issue(user, AccountTokenPurpose.EMAIL_VERIFICATION);

    await this.mail.send({
      to: user.email,
      subject: 'Confirm your Blender Battle address',
      text:
        `Confirm this address to finish setting up your account:\n\n` +
        `${this.mail.link(`/verify-email?token=${token}`)}\n\n` +
        `The link is good for three days.`,
    });
  }

  // --- Redeeming -------------------------------------------------------------

  /**
   * Sets a new password and signs every session out.
   *
   * The sign-out is the point rather than a courtesy. A reset is what someone
   * does when they believe their account is compromised, and leaving the
   * attacker's existing refresh token working would make the whole flow
   * theatre.
   */
  async resetPassword(
    presentedToken: string,
    newPassword: string,
    context: { ipAddress?: string | null },
  ): Promise<void> {
    if (newPassword.length < PASSWORD_MIN_LENGTH) {
      throw new AppException(
        ApiErrorCode.VALIDATION_FAILED,
        `Password must be at least ${PASSWORD_MIN_LENGTH} characters`,
        400,
      );
    }

    const record = await this.redeem(presentedToken, AccountTokenPurpose.PASSWORD_RESET);
    const user = await this.users.findOne({ where: { id: record.userId } });
    if (!user) throw AppException.notFound('User');

    await this.users.update(
      { id: user.id },
      { passwordHash: await this.passwords.hash(newPassword) },
    );

    await this.sessions.revokeAllForUser(user.id, TokenFamilyRevokeReason.PASSWORD_CHANGED);

    /*
      A completed reset proves control of the inbox, which is exactly what
      verification asks for. Marking it verified here saves sending a second
      email to an address the user has just demonstrably read.
    */
    if (!user.emailVerifiedAt) {
      await this.users.update({ id: user.id }, { emailVerifiedAt: new Date() });
    }

    await this.activity.record({
      action: ActivityAction.SECURITY_PASSWORD_RESET_COMPLETED,
      actorId: user.id,
      entityType: 'user',
      entityId: user.id,
      ipAddress: context.ipAddress ?? null,
      userAgent: null,
      metadata: {},
    });

    // Told after the fact, to the address on file. If the reset was not theirs,
    // this is the message that lets them find out.
    await this.mail.send({
      to: user.email,
      subject: 'Your Blender Battle password was changed',
      text:
        `The password for this account has just been changed, and every signed-in ` +
        `device has been signed out.\n\n` +
        `If that was not you, reset it again immediately from the sign-in page.`,
    });
  }

  async verifyEmail(presentedToken: string): Promise<void> {
    const record = await this.redeem(presentedToken, AccountTokenPurpose.EMAIL_VERIFICATION);
    await this.users.update({ id: record.userId }, { emailVerifiedAt: new Date() });
  }

  // --- Internals -------------------------------------------------------------

  /**
   * Mints a token, retiring any outstanding one for the same purpose.
   *
   * Retiring matters: without it, asking for a second link because the first
   * did not arrive would leave two live tokens, and the older one — the one
   * more likely to have leaked — would keep working.
   */
  private async issue(user: User, purpose: AccountTokenPurpose): Promise<string> {
    await this.tokens.update(
      { userId: user.id, purpose, usedAt: IsNull() },
      { usedAt: new Date() },
    );

    // 32 bytes of CSPRNG output. base64url so it survives being pasted out of
    // an email client that decided to linkify the surrounding text.
    const token = randomBytes(32).toString('base64url');

    await this.tokens.insert({
      userId: user.id,
      purpose,
      tokenHash: this.hash(token),
      expiresAt: new Date(Date.now() + TTL_MINUTES[purpose] * 60_000),
    });

    return token;
  }

  /**
   * Validates and spends a token.
   *
   * Every failure mode returns the same message. A caller trying tokens must
   * not be able to tell "expired" from "already used" from "never existed" —
   * the first two confirm that an address was in the system.
   */
  private async redeem(
    presentedToken: string,
    purpose: AccountTokenPurpose,
  ): Promise<AccountToken> {
    const invalid = () =>
      new AppException(
        ApiErrorCode.VALIDATION_FAILED,
        'This link is invalid or has expired. Request a new one.',
        400,
      );

    const record = await this.tokens.findOne({
      where: { tokenHash: this.hash(presentedToken), purpose },
    });

    if (!record || record.usedAt || record.isExpired) throw invalid();

    /*
      Conditional spend.

      Two requests carrying the same token — a double-clicked link, or a mail
      client that prefetches URLs — must not both succeed. Only the update that
      still sees a null `used_at` wins; the loser is reported as invalid, which
      is the truth by the time it is read.
    */
    const claimed = await this.tokens
      .createQueryBuilder()
      .update(AccountToken)
      .set({ usedAt: new Date() })
      .where('id = :id AND used_at IS NULL', { id: record.id })
      .execute();

    if (!claimed.affected) throw invalid();

    return record;
  }

  /**
   * SHA-256, not bcrypt.
   *
   * The input is 256 bits of CSPRNG output, so there is nothing to brute-force,
   * and the lookup has to be a single indexed equality match rather than a scan
   * that bcrypt-compares every row.
   */
  private hash(token: string): string {
    return createHash('sha256').update(token).digest('hex');
  }
}
