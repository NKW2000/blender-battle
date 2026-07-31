import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import {
  ActivityAction,
  ApiErrorCode,
  Role,
  UserStatus,
  type AuthSession,
  type AuthTokens,
} from '@bb/shared';
import { Repository } from 'typeorm';

import { AppException } from '@/common/exceptions/app.exception';
import { ActivityLogService } from '@/modules/activity-log/activity-log.service';
import { User } from '@/modules/users/entities/user.entity';
import { UserMapper } from '@/modules/users/users.mapper';

import type { LoginDto } from './dto/login.dto';
import type { RegisterDto } from './dto/register.dto';
import { TokenFamilyRevokeReason } from './entities/refresh-token-family.entity';
import { PasswordService } from './services/password.service';
import { TokenService } from './services/token.service';

export interface RequestContext {
  ipAddress?: string | null;
  userAgent?: string | null;
}

@Injectable()
export class AuthService {
  constructor(
    @InjectRepository(User) private readonly users: Repository<User>,
    private readonly passwords: PasswordService,
    private readonly tokens: TokenService,
    private readonly activity: ActivityLogService,
  ) {}

  async register(dto: RegisterDto, context: RequestContext): Promise<AuthSession> {
    // Pre-check for a friendly field-level error. The unique constraints in the
    // database remain the real guarantee — this check races, and losing the race
    // surfaces as a 409 from the exception filter, which is correct.
    const existing = await this.users.findOne({
      where: [{ email: dto.email }, { username: dto.username }],
      select: { id: true, email: true, username: true },
    });

    if (existing) {
      const field = existing.email.toLowerCase() === dto.email.toLowerCase()
        ? 'email'
        : 'username';
      throw AppException.conflict(`That ${field} is already registered`, {
        [field]: [`This ${field} is already in use`],
      });
    }

    const user = await this.users.save(
      this.users.create({
        username: dto.username,
        email: dto.email,
        passwordHash: await this.passwords.hash(dto.password),
        // Role is fixed server-side. Elevation happens only through an admin
        // action on a dedicated endpoint, never through self-registration.
        role: Role.PLAYER,
        status: UserStatus.ACTIVE,
      }),
    );

    const tokens = await this.tokens.issueForNewSession(user, context);

    await this.activity.record({
      action: ActivityAction.USER_REGISTERED,
      actorId: user.id,
      entityType: 'user',
      entityId: user.id,
      ...context,
    });

    return { ...tokens, user: UserMapper.toSelf(user) };
  }

  async login(dto: LoginDto, context: RequestContext): Promise<AuthSession> {
    const user = await this.users.findOne({
      where: { email: dto.email },
      // passwordHash carries select:false on the entity, so it must be asked for.
      select: {
        id: true,
        username: true,
        email: true,
        passwordHash: true,
        role: true,
        status: true,
        suspendedUntil: true,
      },
    });

    if (!user) {
      // Spend the same time as a real verification would, then fail identically.
      // Otherwise response latency answers "does this account exist?".
      await this.passwords.burnTimingBudget();
      await this.activity.record({
        action: ActivityAction.SECURITY_LOGIN_FAILED,
        metadata: { reason: 'unknown_email' },
        ...context,
      });
      throw AppException.invalidCredentials();
    }

    if (!user.passwordHash) {
      // An OAuth-only account. Burn the same time budget and return the same
      // error as a wrong password — saying "this account uses Discord" would
      // confirm the address is registered and reveal how its owner signs in.
      await this.passwords.burnTimingBudget();
      await this.activity.record({
        action: ActivityAction.SECURITY_LOGIN_FAILED,
        actorId: user.id,
        metadata: { reason: 'no_password_set' },
        ...context,
      });
      throw AppException.invalidCredentials();
    }

    const passwordValid = await this.passwords.verify(dto.password, user.passwordHash);
    if (!passwordValid) {
      await this.activity.record({
        action: ActivityAction.SECURITY_LOGIN_FAILED,
        actorId: user.id,
        metadata: { reason: 'bad_password' },
        ...context,
      });
      throw AppException.invalidCredentials();
    }

    this.assertAccountUsable(user);

    // Re-read in full: the login query selected only what authentication needs,
    // and the response returns the complete profile.
    const full = await this.users.findOneOrFail({ where: { id: user.id } });
    const tokens = await this.tokens.issueForNewSession(full, context);

    await this.users.update({ id: full.id }, { lastSeenAt: new Date() });
    await this.activity.record({
      action: ActivityAction.USER_LOGGED_IN,
      actorId: full.id,
      ...context,
    });

    return { ...tokens, user: UserMapper.toSelf(full) };
  }

  async refresh(refreshToken: string, context: RequestContext): Promise<AuthTokens> {
    const { tokens } = await this.tokens.rotate(refreshToken, context);
    return tokens;
  }

  async logout(
    refreshToken: string,
    actorId: string,
    accessJti: string,
    accessExp: number,
    context: RequestContext,
  ): Promise<void> {
    await this.tokens.revokeFamilyByToken(refreshToken, TokenFamilyRevokeReason.LOGOUT);
    // The access token stays cryptographically valid until it expires, so it is
    // denylisted for the remainder of its lifetime. Without this, "log out" would
    // leave a working credential in the wild for up to 15 minutes.
    await this.tokens.denylistAccessToken(accessJti, accessExp);

    await this.activity.record({
      action: ActivityAction.USER_LOGGED_OUT,
      actorId,
      ...context,
    });
  }

  /** Blocks banned and currently-suspended accounts at the point of login. */
  private assertAccountUsable(user: User): void {
    if (user.status === UserStatus.BANNED) {
      throw new AppException(
        ApiErrorCode.ACCOUNT_BANNED,
        'This account has been banned',
        403,
      );
    }

    if (user.status === UserStatus.DELETED) {
      // Same response as an unknown account: confirming a deleted account existed
      // is itself a disclosure.
      throw AppException.invalidCredentials();
    }

    if (user.status === UserStatus.SUSPENDED) {
      const stillSuspended =
        !user.suspendedUntil || user.suspendedUntil.getTime() > Date.now();

      if (stillSuspended) {
        throw new AppException(
          ApiErrorCode.ACCOUNT_SUSPENDED,
          user.suspendedUntil
            ? `This account is suspended until ${user.suspendedUntil.toISOString()}`
            : 'This account is suspended',
          403,
        );
      }
    }
  }
}
