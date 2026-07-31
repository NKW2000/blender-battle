import { createHash, randomUUID } from 'node:crypto';

import { Injectable, Logger } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { InjectRepository } from '@nestjs/typeorm';
import { ActivityAction, ApiErrorCode, type AuthTokens } from '@bb/shared';
import { DataSource, LessThan, Repository } from 'typeorm';

import { AppConfig } from '@/config/app.config';
import { AppException } from '@/common/exceptions/app.exception';
import type {
  AccessTokenPayload,
  RefreshTokenPayload,
} from '@/common/types/authenticated-user';
import { ActivityLogService } from '@/modules/activity-log/activity-log.service';
import { RedisService } from '@/modules/redis/redis.service';
import { User } from '@/modules/users/entities/user.entity';

import {
  RefreshTokenFamily,
  TokenFamilyRevokeReason,
} from '../entities/refresh-token-family.entity';
import { RefreshToken } from '../entities/refresh-token.entity';

interface IssueContext {
  ipAddress?: string | null;
  userAgent?: string | null;
}

/**
 * Internal signal, never leaves this file. Carries the family that must be
 * revoked out of a transaction that is about to roll back.
 */
class TokenReuseDetected extends Error {
  constructor(
    readonly familyId: string,
    readonly userId: string,
  ) {
    super('Refresh token reuse detected');
  }
}

/**
 * Owns the entire token lifecycle: issue, rotate, detect reuse, revoke.
 *
 * Threat model this implements: a refresh token is a long-lived bearer credential,
 * so it must be assumed stealable. Rotation limits the useful lifetime of a stolen
 * copy; reuse detection turns theft into an observable event, because the thief
 * and the legitimate client will eventually both present the same token, and
 * whichever arrives second proves the compromise.
 */
@Injectable()
export class TokenService {
  private readonly logger = new Logger(TokenService.name);
  /** Redis key for the access-token revocation denylist. */
  private static readonly DENYLIST_PREFIX = 'auth:denylist:jti:';

  constructor(
    private readonly jwt: JwtService,
    private readonly config: AppConfig,
    private readonly redis: RedisService,
    private readonly activity: ActivityLogService,
    private readonly dataSource: DataSource,
    @InjectRepository(RefreshTokenFamily)
    private readonly families: Repository<RefreshTokenFamily>,
    @InjectRepository(RefreshToken)
    private readonly tokens: Repository<RefreshToken>,
  ) {}

  /** Starts a new session: one family, one first-generation refresh token. */
  async issueForNewSession(user: User, context: IssueContext): Promise<AuthTokens> {
    const family = await this.families.save(
      this.families.create({
        userId: user.id,
        ipAddress: context.ipAddress ?? null,
        userAgent: context.userAgent ?? null,
      }),
    );

    return this.issuePair(user, family.id, context);
  }

  /**
   * Exchanges a refresh token for a new pair.
   *
   * Runs in a SERIALIZABLE transaction: two tabs refreshing at the same instant
   * must not both succeed in marking the same row used, which at READ COMMITTED
   * would let one legitimate rotation look like theft (or worse, let both through).
   */
  async rotate(
    presentedToken: string,
    context: IssueContext,
  ): Promise<{ tokens: AuthTokens; userId: string }> {
    try {
      return await this.rotateInTransaction(presentedToken, context);
    } catch (error) {
      if (error instanceof TokenReuseDetected) {
        // Runs after the rotation transaction has rolled back, so this UPDATE
        // commits on its own and the whole lineage — including any token the
        // thief already holds — is genuinely dead.
        await this.families.update(
          { id: error.familyId },
          {
            revokedAt: new Date(),
            revokedReason: TokenFamilyRevokeReason.REUSE_DETECTED,
          },
        );

        this.logger.warn(
          `Refresh token reuse detected; family ${error.familyId} revoked for user ${error.userId}`,
        );

        // The application log is for operators watching a stream; this is the
        // durable, queryable record an incident review reads months later. Token
        // theft is exactly the event that must survive log rotation.
        await this.activity.record({
          action: ActivityAction.SECURITY_TOKEN_REUSE_DETECTED,
          actorId: error.userId,
          entityType: 'refresh_token_family',
          entityId: error.familyId,
          metadata: { revokedReason: TokenFamilyRevokeReason.REUSE_DETECTED },
          ipAddress: context.ipAddress ?? null,
          userAgent: context.userAgent ?? null,
        });

        throw new AppException(
          ApiErrorCode.TOKEN_REUSED,
          'Session invalidated for security reasons. Please sign in again.',
          401,
        );
      }

      throw error;
    }
  }

  private async rotateInTransaction(
    presentedToken: string,
    context: IssueContext,
  ): Promise<{ tokens: AuthTokens; userId: string }> {
    const payload = await this.verifyRefreshSignature(presentedToken);
    const tokenHash = this.hash(presentedToken);

    return this.dataSource.transaction('SERIALIZABLE', async (manager) => {
      const stored = await manager.findOne(RefreshToken, {
        where: { tokenHash },
        relations: { family: true },
      });

      if (!stored) {
        // Valid signature, unknown row: the token was already pruned or the family
        // was cascaded away. Treat as expired, not as theft.
        throw AppException.unauthorized(
          ApiErrorCode.TOKEN_EXPIRED,
          'Refresh token is no longer valid',
        );
      }

      if (stored.family.isRevoked) {
        throw AppException.unauthorized(
          ApiErrorCode.TOKEN_EXPIRED,
          'Session has been revoked',
        );
      }

      // --- Reuse detection ---------------------------------------------------
      // A token that was already rotated is being presented again. Either an
      // attacker replayed a stolen copy, or the legitimate client replayed one it
      // should have discarded. Both cases mean a copy escaped: kill the lineage.
      //
      // The revocation must NOT happen here. Throwing rolls this transaction
      // back, and an UPDATE issued on `manager` would be rolled back with it —
      // leaving the family alive and the stolen session working. The signal is
      // raised instead, and the caller revokes in its own committed transaction.
      if (stored.usedAt !== null) {
        throw new TokenReuseDetected(stored.familyId, payload.sub);
      }

      if (stored.isExpired) {
        throw AppException.unauthorized(
          ApiErrorCode.TOKEN_EXPIRED,
          'Refresh token expired',
        );
      }

      const user = await manager.findOne(User, { where: { id: payload.sub } });

      if (!user) throw AppException.unauthorized();

      const next = await this.persistRefreshToken(
        manager.getRepository(RefreshToken),
        user,
        stored.familyId,
        context,
      );

      await manager.update(
        RefreshToken,
        { id: stored.id },
        { usedAt: new Date(), replacedById: next.entity.id },
      );

      const accessToken = await this.signAccessToken(user);

      return {
        userId: user.id,
        tokens: {
          accessToken,
          refreshToken: next.plaintext,
          expiresIn: this.accessTtlSeconds(),
        },
      };
    });
  }

  /** Ends one session. Other devices keep their own families and stay signed in. */
  async revokeFamilyByToken(
    presentedToken: string,
    reason: TokenFamilyRevokeReason,
  ): Promise<void> {
    const tokenHash = this.hash(presentedToken);
    const stored = await this.tokens.findOne({ where: { tokenHash } });
    if (!stored) return; // Already gone; logout is idempotent.

    await this.families.update(
      { id: stored.familyId, revokedAt: undefined },
      { revokedAt: new Date(), revokedReason: reason },
    );
  }

  /** Global sign-out, e.g. after a password change or an admin ban. */
  async revokeAllForUser(userId: string, reason: TokenFamilyRevokeReason): Promise<void> {
    await this.families
      .createQueryBuilder()
      .update(RefreshTokenFamily)
      .set({ revokedAt: new Date(), revokedReason: reason })
      .where('user_id = :userId AND revoked_at IS NULL', { userId })
      .execute();
  }

  /**
   * Denylists a still-valid access token until its natural expiry.
   *
   * Redis is the right store here precisely because the data is disposable: if it
   * is lost, the worst case is that an access token remains usable for the
   * remainder of its short TTL. Refresh state, by contrast, lives in Postgres.
   */
  async denylistAccessToken(jti: string, expiresAtEpochSeconds: number): Promise<void> {
    const ttl = Math.max(1, expiresAtEpochSeconds - Math.floor(Date.now() / 1000));
    await this.redis.setWithTtl(`${TokenService.DENYLIST_PREFIX}${jti}`, '1', ttl);
  }

  async isAccessTokenDenylisted(jti: string): Promise<boolean> {
    return this.redis.exists(`${TokenService.DENYLIST_PREFIX}${jti}`);
  }

  /** Housekeeping for a scheduled job: drop expired, never-rotated tokens. */
  async pruneExpiredTokens(): Promise<number> {
    const result = await this.tokens.delete({
      expiresAt: LessThan(new Date()),
      usedAt: undefined,
    });
    return result.affected ?? 0;
  }

  // --- internals ------------------------------------------------------------

  private async issuePair(
    user: User,
    familyId: string,
    context: IssueContext,
  ): Promise<AuthTokens> {
    const refresh = await this.persistRefreshToken(this.tokens, user, familyId, context);
    const accessToken = await this.signAccessToken(user);

    return {
      accessToken,
      refreshToken: refresh.plaintext,
      expiresIn: this.accessTtlSeconds(),
    };
  }

  private async signAccessToken(user: User): Promise<string> {
    const payload: AccessTokenPayload = {
      sub: user.id,
      username: user.username,
      role: user.role,
      jti: randomUUID(),
    };

    return this.jwt.signAsync(payload, {
      secret: this.config.jwt.accessSecret,
      // Seconds rather than the "15m" string: one parse, in parseDuration, so the
      // token's stated lifetime and the client's refresh timer cannot disagree.
      expiresIn: this.accessTtlSeconds(),
    });
  }

  private async persistRefreshToken(
    repository: Repository<RefreshToken>,
    user: User,
    familyId: string,
    context: IssueContext,
  ): Promise<{ plaintext: string; entity: RefreshToken }> {
    const jti = randomUUID();
    const payload: RefreshTokenPayload = { sub: user.id, fam: familyId, jti };

    const plaintext = await this.jwt.signAsync(payload, {
      secret: this.config.jwt.refreshSecret,
      expiresIn: this.refreshTtlSeconds(),
    });

    const entity = await repository.save(
      repository.create({
        familyId,
        // Hash, never the token itself: a leaked database dump must not be
        // replayable against the API.
        tokenHash: this.hash(plaintext),
        expiresAt: new Date(Date.now() + this.refreshTtlSeconds() * 1000),
        ipAddress: context.ipAddress ?? null,
        userAgent: context.userAgent ?? null,
      }),
    );

    return { plaintext, entity };
  }

  private async verifyRefreshSignature(token: string): Promise<RefreshTokenPayload> {
    try {
      return await this.jwt.verifyAsync<RefreshTokenPayload>(token, {
        secret: this.config.jwt.refreshSecret,
      });
    } catch {
      throw AppException.unauthorized(
        ApiErrorCode.TOKEN_EXPIRED,
        'Refresh token is invalid or expired',
      );
    }
  }

  /**
   * SHA-256, not bcrypt. The input is a 200+ bit random JWT, not a low-entropy
   * human password, so there is nothing to brute-force and the lookup must be a
   * single indexed equality match rather than a scan-and-compare.
   */
  private hash(token: string): string {
    return createHash('sha256').update(token).digest('hex');
  }

  private accessTtlSeconds(): number {
    return this.parseDuration(this.config.jwt.accessTtl);
  }

  private refreshTtlSeconds(): number {
    return this.parseDuration(this.config.jwt.refreshTtl);
  }

  private parseDuration(value: string): number {
    const match = /^(\d+)([smhd])$/.exec(value);
    if (!match) throw new Error(`Unparseable duration: ${value}`);

    const amount = Number(match[1]);
    const multipliers: Record<string, number> = { s: 1, m: 60, h: 3600, d: 86400 };
    return amount * (multipliers[match[2] as string] ?? 1);
  }
}
