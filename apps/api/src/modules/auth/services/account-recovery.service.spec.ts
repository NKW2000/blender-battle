import { createHash } from 'node:crypto';

import { beforeEach, describe, expect, it } from 'vitest';

import { AccountTokenPurpose } from '../entities/account-token.entity';
import { TokenFamilyRevokeReason } from '../entities/refresh-token-family.entity';
import { AccountRecoveryService } from './account-recovery.service';

/**
 * Password reset.
 *
 * The flow with the worst failure modes in the application: it can hand an
 * account to whoever asks, or confirm to a stranger which email addresses are
 * registered, and both look like a working feature from the outside.
 *
 * Four properties are checked here — the token is never stored in the clear,
 * it works exactly once, a reset kills every existing session, and an unknown
 * address is indistinguishable from a known one.
 */

interface TokenRow {
  id: string;
  userId: string;
  purpose: AccountTokenPurpose;
  tokenHash: string;
  expiresAt: Date;
  usedAt: Date | null;
  isExpired: boolean;
}

const sha256 = (value: string) => createHash('sha256').update(value).digest('hex');

function createFakes(options: { userExists?: boolean; oauthOnly?: boolean } = {}) {
  const user = {
    id: 'user-1',
    email: 'ada@example.com',
    passwordHash: options.oauthOnly ? null : 'old-hash',
    emailVerifiedAt: null as Date | null,
  };

  const rows: TokenRow[] = [];
  const sent: Array<{ to: string; subject: string; text: string }> = [];
  const revoked: Array<{ userId: string; reason: string }> = [];
  const updates: Array<Record<string, unknown>> = [];

  const service = new AccountRecoveryService(
    {
      findOne: async () => (options.userExists === false ? null : user),
      update: async (_where: unknown, values: Record<string, unknown>) => {
        Object.assign(user, values);
        updates.push(values);
        return { affected: 1 };
      },
    } as never,
    {
      insert: async (values: Omit<TokenRow, 'id' | 'usedAt' | 'isExpired'>) => {
        rows.push({
          id: `token-${rows.length + 1}`,
          usedAt: null,
          get isExpired() {
            return this.expiresAt.getTime() <= Date.now();
          },
          ...values,
        } as TokenRow);
        return { identifiers: [] };
      },
      findOne: async (query: { where: { tokenHash: string; purpose: AccountTokenPurpose } }) =>
        rows.find(
          (row) =>
            row.tokenHash === query.where.tokenHash && row.purpose === query.where.purpose,
        ) ?? null,
      update: async (where: { userId: string; purpose: AccountTokenPurpose }) => {
        // The "retire outstanding tokens of the same purpose" call.
        for (const row of rows) {
          if (row.userId === where.userId && row.purpose === where.purpose && !row.usedAt) {
            row.usedAt = new Date();
          }
        }
        return { affected: 1 };
      },
      createQueryBuilder: () => {
        let id = '';
        const builder = {
          update: () => builder,
          set: () => builder,
          where: (_sql: string, params: { id: string }) => {
            id = params.id;
            return builder;
          },
          // Conditional spend, atomic within the call.
          execute: async () => {
            const row = rows.find((entry) => entry.id === id);
            if (!row || row.usedAt) return { affected: 0 };
            row.usedAt = new Date();
            return { affected: 1 };
          },
        };
        return builder;
      },
    } as never,
    {
      send: async (mail: { to: string; subject: string; text: string }) => {
        sent.push(mail);
      },
      link: (path: string) => `https://app.test${path}`,
    } as never,
    { hash: async (plain: string) => `hashed:${plain}` } as never,
    {
      revokeAllForUser: async (userId: string, reason: string) => {
        revoked.push({ userId, reason });
      },
    } as never,
    { record: async () => undefined } as never,
  );

  /** The token as it appears in the emailed link. */
  const tokenFromLastEmail = () =>
    sent.map((mail) => /token=([\w-]+)/.exec(mail.text)?.[1]).filter(Boolean).at(-1) ?? '';

  return { service, user, rows, sent, revoked, updates, tokenFromLastEmail };
}

describe('requestPasswordReset', () => {
  let fakes: ReturnType<typeof createFakes>;

  beforeEach(() => {
    fakes = createFakes();
  });

  it('emails a single-use link', async () => {
    await fakes.service.requestPasswordReset('ada@example.com', {});

    expect(fakes.sent).toHaveLength(1);
    expect(fakes.sent[0]!.to).toBe('ada@example.com');
    expect(fakes.tokenFromLastEmail()).not.toBe('');
  });

  it('stores only the hash of the token', async () => {
    /*
      A database dump must not be replayable against the reset endpoint. This
      is the same rule refresh tokens follow, and the one that is easiest to
      get wrong by storing the token "just for debugging".
    */
    await fakes.service.requestPasswordReset('ada@example.com', {});

    const token = fakes.tokenFromLastEmail();
    expect(fakes.rows).toHaveLength(1);
    expect(fakes.rows[0]!.tokenHash).toBe(sha256(token));
    expect(fakes.rows[0]!.tokenHash).not.toContain(token);
  });

  it('says nothing at all about an address that is not registered', async () => {
    // No error, no email, no distinguishable behaviour. The endpoint answers
    // 204 either way, so this must not be the thing that gives it away.
    const unknown = createFakes({ userExists: false });

    await expect(
      unknown.service.requestPasswordReset('nobody@example.com', {}),
    ).resolves.toBeUndefined();
    expect(unknown.sent).toHaveLength(0);
    expect(unknown.rows).toHaveLength(0);
  });

  it('refuses to mint a reset token for an account with no password', async () => {
    /*
      An OAuth-only account. Issuing a reset here would let anyone who knows the
      address convert a Discord-only account into a password account — the
      email explains the situation instead, and no token exists to redeem.
    */
    const oauth = createFakes({ oauthOnly: true });

    await oauth.service.requestPasswordReset('ada@example.com', {});

    expect(oauth.rows).toHaveLength(0);
    expect(oauth.sent).toHaveLength(1);
    expect(oauth.sent[0]!.text).toContain('no password');
  });

  it('retires an earlier link when a second is requested', async () => {
    // Otherwise the older token — the one likelier to have leaked — keeps
    // working alongside the new one.
    await fakes.service.requestPasswordReset('ada@example.com', {});
    const first = fakes.tokenFromLastEmail();

    await fakes.service.requestPasswordReset('ada@example.com', {});

    await expect(fakes.service.resetPassword(first, 'a-long-new-password', {})).rejects.toThrow();
  });
});

describe('resetPassword', () => {
  let fakes: ReturnType<typeof createFakes>;

  beforeEach(async () => {
    fakes = createFakes();
    await fakes.service.requestPasswordReset('ada@example.com', {});
  });

  it('sets the new password', async () => {
    await fakes.service.resetPassword(fakes.tokenFromLastEmail(), 'a-long-new-password', {});

    expect(fakes.user.passwordHash).toBe('hashed:a-long-new-password');
  });

  it('signs every existing session out', async () => {
    /*
      The point of the whole flow, not a courtesy. Someone resetting a password
      usually believes their account is compromised; leaving the attacker's
      refresh token working would make the reset theatre.
    */
    await fakes.service.resetPassword(fakes.tokenFromLastEmail(), 'a-long-new-password', {});

    expect(fakes.revoked).toEqual([
      { userId: 'user-1', reason: TokenFamilyRevokeReason.PASSWORD_CHANGED },
    ]);
  });

  it('works exactly once', async () => {
    const token = fakes.tokenFromLastEmail();
    await fakes.service.resetPassword(token, 'a-long-new-password', {});

    await expect(fakes.service.resetPassword(token, 'another-long-password', {})).rejects.toThrow();
  });

  it('spends the token once when the link is opened twice at the same moment', async () => {
    // A double-clicked link, or a mail client that prefetches URLs. Only the
    // update that still sees a null `used_at` may proceed.
    const token = fakes.tokenFromLastEmail();

    const results = await Promise.allSettled([
      fakes.service.resetPassword(token, 'a-long-new-password', {}),
      fakes.service.resetPassword(token, 'a-different-password', {}),
    ]);

    expect(results.filter((result) => result.status === 'fulfilled')).toHaveLength(1);
  });

  it('rejects an unknown token', async () => {
    await expect(
      fakes.service.resetPassword('not-a-real-token', 'a-long-new-password', {}),
    ).rejects.toThrow();
  });

  it('gives the same message for unknown, spent and expired tokens', async () => {
    /*
      Distinguishing them would confirm that an address is registered: "this
      link has expired" is only ever true for a token that was really issued.
    */
    const token = fakes.tokenFromLastEmail();
    await fakes.service.resetPassword(token, 'a-long-new-password', {});

    const spent = await fakes.service
      .resetPassword(token, 'another-long-password', {})
      .catch((error: Error) => error.message);
    const unknown = await fakes.service
      .resetPassword('never-existed', 'another-long-password', {})
      .catch((error: Error) => error.message);

    expect(spent).toBe(unknown);
  });

  it('refuses a password shorter than the shared minimum', async () => {
    await expect(fakes.service.resetPassword(fakes.tokenFromLastEmail(), 'short', {})).rejects.toThrow();
    expect(fakes.user.passwordHash).toBe('old-hash');
  });

  it('treats a completed reset as proof the address works', async () => {
    // The user demonstrably read an email at that address, which is exactly
    // what verification asks for — so it does not ask again.
    await fakes.service.resetPassword(fakes.tokenFromLastEmail(), 'a-long-new-password', {});

    expect(fakes.user.emailVerifiedAt).toBeInstanceOf(Date);
  });

  it('tells the account holder afterwards', async () => {
    // The message that lets someone find out their account was taken.
    await fakes.service.resetPassword(fakes.tokenFromLastEmail(), 'a-long-new-password', {});

    expect(fakes.sent.at(-1)!.subject).toContain('password was changed');
  });
});
