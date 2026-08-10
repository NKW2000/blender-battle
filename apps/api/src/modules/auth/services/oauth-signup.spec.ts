import { ApiErrorCode, OAuthProvider } from '@bb/shared';
import { describe, expect, it, vi } from 'vitest';

import { AppException } from '@/common/exceptions/app.exception';

import { OAuthService } from './oauth.service';

/**
 * Signing in with a provider whose email already belongs to an account.
 *
 * The most likely way a real person meets this: they register with a password,
 * then press "Continue with Discord" using the same address. Discord reports
 * the address but not always as verified, and an *unverified* provider email is
 * deliberately not allowed to match an existing account — anyone who can set
 * that address on a third-party service could otherwise take over the account
 * here. So the flow falls through to signup carrying an email the users table
 * already holds.
 *
 * That used to reach the INSERT and die on `uq_users_email`: a 500, logged as a
 * database error, and shown to the reader as "that sign-in did not complete" —
 * a sentence that describes every possible failure and none of them.
 *
 * These reach `register` through the real `resolveSession`, so the path being
 * tested is the one a browser takes.
 */

/** Only the collaborators the collision path actually touches. */
function makeService(existingEmails: string[]) {
  const users = {
    findOne: vi.fn(async ({ where }: { where: { email?: string; id?: string } }) =>
      where.email && existingEmails.includes(where.email) ? { id: 'existing-user' } : null,
    ),
    findOneOrFail: vi.fn(),
    existsBy: vi.fn(async () => false),
  };

  const identities = { findOne: vi.fn(async () => null) };

  // A save reaching the database at all is the bug: the collision must be
  // refused before anything is written.
  const dataSource = {
    transaction: vi.fn(async () => {
      throw new Error('reached the INSERT — the collision was not refused');
    }),
  };

  const service = Object.create(OAuthService.prototype) as OAuthService;
  Object.assign(service, {
    users,
    identities,
    dataSource,
    activity: { record: vi.fn() },
    logger: { error: vi.fn(), warn: vi.fn(), log: vi.fn() },
  });

  return { service, users, dataSource };
}

const profile = (overrides: Partial<Record<string, unknown>> = {}) => ({
  providerAccountId: 'discord-123',
  email: 'taken@example.com',
  emailVerified: false,
  handle: 'blenkawa',
  ...overrides,
});

/** `resolveSession` is private; the browser reaches it, so the test does too. */
const resolve = (service: OAuthService, p: ReturnType<typeof profile>) =>
  (
    service as unknown as {
      resolveSession: (
        provider: OAuthProvider,
        profile: unknown,
        linkUserId: string | null,
        context: Record<string, unknown>,
      ) => Promise<unknown>;
    }
  ).resolveSession(OAuthProvider.DISCORD, p, null, {});

describe('provider sign-up onto a taken email', () => {
  it('refuses with a conflict rather than failing at the unique index', async () => {
    const { service, dataSource } = makeService(['taken@example.com']);

    await expect(resolve(service, profile())).rejects.toMatchObject({
      code: ApiErrorCode.CONFLICT,
    });

    // The refusal has to happen before the write, not as a caught database error.
    expect(dataSource.transaction).not.toHaveBeenCalled();
  });

  it('says how to get in, not just that it failed', async () => {
    const { service } = makeService(['taken@example.com']);

    const error = await resolve(service, profile()).catch((caught: AppException) => caught);

    // The way out is the whole point: sign in with the password, then link the
    // provider from settings — which proves both sides, and is exactly what the
    // unverified email failed to prove.
    expect((error as AppException).message).toMatch(/password/i);
    expect((error as AppException).message).toMatch(/settings/i);
  });

  it('still refuses a provider that shares no email at all', async () => {
    const { service } = makeService([]);

    await expect(resolve(service, profile({ email: null }))).rejects.toMatchObject({
      code: ApiErrorCode.VALIDATION_FAILED,
    });
  });

  it('does not treat a free email as a collision', async () => {
    // The guard must not refuse every signup — reaching the transaction is
    // correct here, and the stub throws to prove it got that far.
    const { service, dataSource } = makeService([]);

    await expect(resolve(service, profile({ email: 'new@example.com' }))).rejects.toThrow(
      /reached the INSERT/,
    );
    expect(dataSource.transaction).toHaveBeenCalled();
  });
});
