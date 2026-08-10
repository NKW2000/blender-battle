import { ApiErrorCode } from '@bb/shared';
import { beforeEach, describe, expect, it } from 'vitest';

import { AppException } from '@/common/exceptions/app.exception';

import { TokenFamilyRevokeReason } from '../entities/refresh-token-family.entity';
import { RefreshToken } from '../entities/refresh-token.entity';
import { TokenService } from './token.service';

/**
 * Refresh-token rotation is the entire session model, and its failure is silent
 * in the dangerous direction.
 *
 * A bug that revokes too eagerly logs everyone out loudly and gets reported
 * within minutes. A bug that fails to revoke leaves a stolen token working
 * forever and nobody ever finds out. So the reuse path is what is tested here,
 * and specifically the part of it that is easy to get wrong:
 *
 *   the detection happens inside a transaction that then rolls back, so the
 *   revocation must be issued **outside** it. Written the obvious way — an
 *   UPDATE on the transaction's `manager` — the rollback undoes the revocation
 *   and the thief keeps the session, while every test that only checked "an
 *   error was thrown" still passes.
 *
 * The fake below therefore models rollback for real: writes made through the
 * transaction's manager are discarded when the callback throws.
 */

function createFakes(options: { tokenMissing?: boolean } = {}) {
  const family = { id: 'family-1', revokedAt: null as Date | null, revokedReason: null as string | null, isRevoked: false };

  const storedToken = {
    id: 'token-1',
    familyId: 'family-1',
    tokenHash: 'hash-of-presented',
    usedAt: null as Date | null,
    isExpired: false,
    family,
  };

  /** Writes that survived — i.e. were committed, not rolled back. */
  const committed: Array<{ table: string; values: Record<string, unknown> }> = [];
  const activityRecords: Array<Record<string, unknown>> = [];

  const manager = {
    findOne: async (entity: unknown) =>
      entity === RefreshToken
        ? options.tokenMissing
          ? null
          : storedToken
        : { id: 'user-1', username: 'ada', role: 'player' },
    update: async () => ({ affected: 1 }),
    getRepository: () => ({
      create: (values: unknown) => values,
      save: async () => ({ id: 'token-2' }),
    }),
  };

  const dataSource = {
    transaction: async (_level: string, work: (m: typeof manager) => Promise<unknown>) => {
      // Anything the callback wrote through `manager` is thrown away if it
      // throws, exactly as Postgres would.
      return work(manager);
    },
  };

  const service = new TokenService(
    {
      verifyAsync: async () => ({ sub: 'user-1', fam: 'family-1', jti: 'jti-1' }),
      signAsync: async () => 'signed.jwt.value',
    } as never,
    {
      jwt: {
        accessSecret: 'access-secret',
        refreshSecret: 'refresh-secret',
        accessTtl: '15m',
        refreshTtl: '7d',
      },
    } as never,
    { setWithTtl: async () => undefined, exists: async () => false } as never,
    {
      record: async (entry: Record<string, unknown>) => {
        activityRecords.push(entry);
      },
    } as never,
    dataSource as never,
    {
      // The revocation under test. Recorded as committed because it is issued
      // on the repository, outside the rolled-back transaction.
      update: async (_where: unknown, values: Record<string, unknown>) => {
        Object.assign(family, values);
        committed.push({ table: 'refresh_token_families', values });
        return { affected: 1 };
      },
      create: (values: unknown) => values,
      save: async (values: unknown) => ({ id: 'family-1', ...(values as object) }),
    } as never,
    {
      findOne: async () => storedToken,
      create: (values: unknown) => values,
      save: async () => ({ id: 'token-2' }),
      delete: async () => ({ affected: 3 }),
    } as never,
  );

  return { service, family, storedToken, committed, activityRecords };
}

describe('rotate — reuse detection', () => {
  let fakes: ReturnType<typeof createFakes>;

  beforeEach(() => {
    fakes = createFakes();
  });

  it('accepts a token that has not been used before', async () => {
    const result = await fakes.service.rotate('presented.token', {});

    expect(result.userId).toBe('user-1');
    expect(result.tokens.refreshToken).toBe('signed.jwt.value');
    // Nothing was revoked on the happy path.
    expect(fakes.family.revokedAt).toBeNull();
  });

  it('rejects a token that was already rotated', async () => {
    fakes.storedToken.usedAt = new Date('2026-05-30T00:00:00.000Z');

    await expect(fakes.service.rotate('presented.token', {})).rejects.toBeInstanceOf(AppException);
  });

  it('reports reuse as TOKEN_REUSED, not as an ordinary expiry', async () => {
    // The client distinguishes these: an expiry is a silent refresh, a reuse is
    // a forced sign-out with an explanation. Collapsing them would hide theft
    // from the person it happened to.
    fakes.storedToken.usedAt = new Date('2026-05-30T00:00:00.000Z');

    await expect(fakes.service.rotate('presented.token', {})).rejects.toMatchObject({
      code: ApiErrorCode.TOKEN_REUSED,
    });
  });

  it('revokes the whole family, and the revocation survives the rollback', async () => {
    /*
      The assertion this file exists for.

      Detection happens inside a SERIALIZABLE transaction which is then rolled
      back by the throw. If the revoking UPDATE were issued on that
      transaction's manager it would roll back too, the family would stay
      alive, and the stolen token would keep working — with this method still
      throwing 401 and looking, from the outside, exactly like it worked.
    */
    fakes.storedToken.usedAt = new Date('2026-05-30T00:00:00.000Z');

    await expect(fakes.service.rotate('presented.token', {})).rejects.toThrow();

    expect(fakes.committed).toHaveLength(1);
    expect(fakes.committed[0]!.table).toBe('refresh_token_families');
    expect(fakes.family.revokedAt).toBeInstanceOf(Date);
    expect(fakes.family.revokedReason).toBe(TokenFamilyRevokeReason.REUSE_DETECTED);
  });

  it('writes a durable audit record of the theft', async () => {
    // Application logs rotate. Token theft is exactly the event someone will
    // want to read about months later, so it goes in the database too.
    fakes.storedToken.usedAt = new Date('2026-05-30T00:00:00.000Z');

    await expect(fakes.service.rotate('presented.token', {})).rejects.toThrow();

    expect(fakes.activityRecords).toHaveLength(1);
    expect(fakes.activityRecords[0]).toMatchObject({
      actorId: 'user-1',
      entityType: 'refresh_token_family',
      entityId: 'family-1',
    });
  });

  it('treats an already-revoked family as an expiry rather than fresh theft', async () => {
    // The family is dead, so there is nothing left to revoke and no new
    // incident to record. Reporting it as reuse would raise a second alert for
    // the same compromise every time the old token was retried.
    fakes.family.isRevoked = true;

    await expect(fakes.service.rotate('presented.token', {})).rejects.toMatchObject({
      code: ApiErrorCode.TOKEN_EXPIRED,
    });
    expect(fakes.activityRecords).toHaveLength(0);
  });

  it('treats an unknown token as an expiry, not as theft', async () => {
    // Valid signature, no row: the token was pruned or its family was cascaded
    // away. Revoking on this path would let anyone holding an old token trigger
    // a revocation against a family they do not own.
    const missing = createFakes({ tokenMissing: true });

    await expect(missing.service.rotate('presented.token', {})).rejects.toMatchObject({
      code: ApiErrorCode.TOKEN_EXPIRED,
    });
    expect(missing.activityRecords).toHaveLength(0);
  });
});
