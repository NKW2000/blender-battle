import { randomBytes, randomUUID } from 'node:crypto';

import { HttpStatus, Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import {
  ActivityAction,
  ApiErrorCode,
  OAuthProvider,
  Role,
  UserStatus,
  USERNAME_MAX_LENGTH,
  type LinkedAccount,
} from '@bb/shared';
import { DataSource, Repository } from 'typeorm';

import { AppException } from '@/common/exceptions/app.exception';
import { AppConfig } from '@/config/app.config';
import { ActivityLogService } from '@/modules/activity-log/activity-log.service';
import { RedisService } from '@/modules/redis/redis.service';
import { User } from '@/modules/users/entities/user.entity';
import { UserMapper } from '@/modules/users/users.mapper';

import { OAuthIdentity } from '../entities/oauth-identity.entity';
import { TokenService } from './token.service';
import type { IssuedSession } from '../auth.types';

interface ProviderProfile {
  providerAccountId: string;
  email: string | null;
  emailVerified: boolean;
  handle: string | null;
}

@Injectable()
export class OAuthService {
  private readonly logger = new Logger(OAuthService.name);

  /** CSRF state lives for one round trip only. */
  private static readonly STATE_TTL_SECONDS = 600;
  /** The one-time code the browser trades for real tokens. */
  private static readonly EXCHANGE_TTL_SECONDS = 60;

  constructor(
    @InjectRepository(User) private readonly users: Repository<User>,
    @InjectRepository(OAuthIdentity)
    private readonly identities: Repository<OAuthIdentity>,
    private readonly tokens: TokenService,
    private readonly activity: ActivityLogService,
    private readonly redis: RedisService,
    private readonly config: AppConfig,
    private readonly dataSource: DataSource,
  ) {}

  isEnabled(provider: OAuthProvider): boolean {
    const credentials =
      provider === OAuthProvider.DISCORD
        ? this.config.oauth.discord
        : this.config.oauth.google;

    return Boolean(credentials.clientId && credentials.clientSecret);
  }

  /**
   * Builds the provider's consent URL.
   *
   * `state` is a random value held in Redis and checked on the way back. Without
   * it an attacker can complete the callback with their own authorization code
   * and silently link their provider account to the victim's session.
   */
  async authorizeUrl(provider: OAuthProvider, linkUserId?: string): Promise<string> {
    this.assertEnabled(provider);

    const state = randomBytes(24).toString('base64url');
    await this.redis.setWithTtl(
      `oauth:state:${state}`,
      JSON.stringify({ provider, linkUserId: linkUserId ?? null }),
      OAuthService.STATE_TTL_SECONDS,
    );

    const redirectUri = this.redirectUri(provider);

    if (provider === OAuthProvider.DISCORD) {
      const params = new URLSearchParams({
        client_id: this.config.oauth.discord.clientId as string,
        redirect_uri: redirectUri,
        response_type: 'code',
        scope: 'identify email',
        state,
      });
      return `https://discord.com/api/oauth2/authorize?${params.toString()}`;
    }

    const params = new URLSearchParams({
      client_id: this.config.oauth.google.clientId as string,
      redirect_uri: redirectUri,
      response_type: 'code',
      scope: 'openid email profile',
      state,
      access_type: 'online',
      prompt: 'select_account',
    });
    return `https://accounts.google.com/o/oauth2/v2/auth?${params.toString()}`;
  }

  /**
   * Handles the provider redirect and returns a one-time code for the browser.
   *
   * Tokens are deliberately NOT put in the redirect URL. A URL lands in browser
   * history, in the Referer header of the next request, and in any proxy log on
   * the way — an access token there is a leaked credential. The browser receives
   * a short-lived single-use code instead and posts it back over HTTPS.
   */
  async handleCallback(
    code: string,
    state: string,
    context: { ipAddress?: string | null; userAgent?: string | null },
  ): Promise<string> {
    const raw = await this.redis.client.get(`oauth:state:${state}`);
    if (!raw) {
      throw new AppException(
        ApiErrorCode.UNAUTHORIZED,
        'This sign-in link has expired. Start again.',
        HttpStatus.UNAUTHORIZED,
      );
    }
    // Single use — a replayed state must not be accepted.
    await this.redis.client.del(`oauth:state:${state}`);

    const { provider, linkUserId } = JSON.parse(raw) as {
      provider: OAuthProvider;
      linkUserId: string | null;
    };

    const profile = await this.fetchProfile(provider, code);
    const session = await this.resolveSession(provider, profile, linkUserId, context);

    const exchangeCode = randomBytes(32).toString('base64url');
    await this.redis.setWithTtl(
      `oauth:exchange:${exchangeCode}`,
      JSON.stringify(session),
      OAuthService.EXCHANGE_TTL_SECONDS,
    );

    return exchangeCode;
  }

  /** Trades the one-time code for the real session. Consumed on first use. */
  async exchange(code: string): Promise<IssuedSession> {
    const key = `oauth:exchange:${code}`;
    const raw = await this.redis.client.get(key);

    if (!raw) {
      throw new AppException(
        ApiErrorCode.UNAUTHORIZED,
        'That sign-in code is no longer valid. Start again.',
        HttpStatus.UNAUTHORIZED,
      );
    }

    await this.redis.client.del(key);
    return JSON.parse(raw) as IssuedSession;
  }

  async listLinked(userId: string): Promise<LinkedAccount[]> {
    const identities = await this.identities.find({ where: { userId } });

    return identities.map((identity) => ({
      provider: identity.provider,
      handle: identity.handle,
      linkedAt: identity.createdAt.toISOString(),
    }));
  }

  /**
   * Unlinks a provider, refusing if it would leave the account unreachable —
   * an OAuth-only user who unlinks their last provider could never sign in again.
   */
  async unlink(userId: string, provider: OAuthProvider): Promise<void> {
    const user = await this.users.findOne({
      where: { id: userId },
      select: { id: true, passwordHash: true },
    });
    if (!user) throw AppException.notFound('User');

    const identities = await this.identities.find({ where: { userId } });
    const remaining = identities.filter((identity) => identity.provider !== provider);

    if (remaining.length === 0 && !user.passwordHash) {
      throw AppException.conflict(
        'Set a password before unlinking your only sign-in method.',
      );
    }

    await this.identities.delete({ userId, provider });
  }

  // --- internals -----------------------------------------------------------

  private async resolveSession(
    provider: OAuthProvider,
    profile: ProviderProfile,
    linkUserId: string | null,
    context: { ipAddress?: string | null; userAgent?: string | null },
  ): Promise<IssuedSession> {
    const existing = await this.identities.findOne({
      where: { provider, providerAccountId: profile.providerAccountId },
    });

    // 1. Already linked — straightforward sign-in.
    if (existing) {
      const user = await this.users.findOneOrFail({ where: { id: existing.userId } });
      this.assertUsable(user);
      return this.issue(user, context);
    }

    // 2. A signed-in user adding a provider to their account.
    if (linkUserId) {
      const user = await this.users.findOneOrFail({ where: { id: linkUserId } });
      await this.link(user.id, provider, profile);

      await this.activity.record({
        action: ActivityAction.OAUTH_LINKED,
        actorId: user.id,
        metadata: { provider },
        ...context,
      });

      return this.issue(user, context);
    }

    // 3. Match an existing local account by email — but only a VERIFIED one.
    //    An unverified provider email is an unproven claim, and trusting it
    //    would let anyone who can set that address on a third-party service take
    //    over the matching account here.
    if (profile.email && profile.emailVerified) {
      const byEmail = await this.users.findOne({ where: { email: profile.email } });

      if (byEmail) {
        this.assertUsable(byEmail);
        await this.link(byEmail.id, provider, profile);

        await this.activity.record({
          action: ActivityAction.OAUTH_LINKED,
          actorId: byEmail.id,
          metadata: { provider, via: 'verified_email' },
          ...context,
        });

        return this.issue(byEmail, context);
      }
    }

    // 4. Nobody matched — create an account.
    return this.register(provider, profile, context);
  }

  private async register(
    provider: OAuthProvider,
    profile: ProviderProfile,
    context: { ipAddress?: string | null; userAgent?: string | null },
  ): Promise<IssuedSession> {
    if (!profile.email) {
      throw new AppException(
        ApiErrorCode.VALIDATION_FAILED,
        `${provider} did not share an email address. Sign up with an email instead.`,
        HttpStatus.BAD_REQUEST,
      );
    }

    const user = await this.dataSource.transaction(async (manager) => {
      const created = await manager.save(
        manager.create(User, {
          username: await this.uniqueUsername(profile.handle ?? profile.email as string),
          email: profile.email as string,
          // No password: this account can only be reached through its provider
          // until the owner sets one.
          passwordHash: null,
          role: Role.PLAYER,
          status: UserStatus.ACTIVE,
        }),
      );

      await manager.save(
        manager.create(OAuthIdentity, {
          userId: created.id,
          provider,
          providerAccountId: profile.providerAccountId,
          handle: profile.handle,
          email: profile.email,
        }),
      );

      return created;
    });

    await this.activity.record({
      action: ActivityAction.OAUTH_SIGNUP,
      actorId: user.id,
      metadata: { provider },
      ...context,
    });

    return this.issue(user, context);
  }

  private async link(
    userId: string,
    provider: OAuthProvider,
    profile: ProviderProfile,
  ): Promise<void> {
    try {
      await this.identities.save(
        this.identities.create({
          userId,
          provider,
          providerAccountId: profile.providerAccountId,
          handle: profile.handle,
          email: profile.email,
        }),
      );
    } catch (error) {
      // The unique constraint fired: this provider account already belongs to a
      // different local account.
      if ((error as { driverError?: { code?: string } }).driverError?.code === '23505') {
        throw AppException.conflict(
          'That account is already connected to another Blender Battle profile.',
        );
      }
      throw error;
    }
  }

  private async issue(
    user: User,
    context: { ipAddress?: string | null; userAgent?: string | null },
  ): Promise<IssuedSession> {
    // The same rotating refresh-token session a password login produces — OAuth
    // changes how identity is proven, not how sessions work afterwards.
    const tokens = await this.tokens.issueForNewSession(user, context);
    await this.users.update({ id: user.id }, { lastSeenAt: new Date() });

    return { ...tokens, user: UserMapper.toSelf(user) };
  }

  private assertUsable(user: User): void {
    if (user.status === UserStatus.BANNED) {
      throw new AppException(
        ApiErrorCode.ACCOUNT_BANNED,
        'This account has been banned',
        HttpStatus.FORBIDDEN,
      );
    }
    if (user.status === UserStatus.DELETED) {
      throw AppException.invalidCredentials();
    }
  }

  private assertEnabled(provider: OAuthProvider): void {
    if (!this.isEnabled(provider)) {
      throw new AppException(
        ApiErrorCode.NOT_FOUND,
        `${provider} sign-in is not configured on this server`,
        HttpStatus.NOT_IMPLEMENTED,
      );
    }
  }

  private redirectUri(provider: OAuthProvider): string {
    return `${this.config.oauth.callbackBase}/api/v1/auth/oauth/${provider}/callback`;
  }

  /** Derives a free username from the provider handle. */
  private async uniqueUsername(seed: string): Promise<string> {
    const base =
      seed
        .split('@')[0]
        ?.toLowerCase()
        .replace(/[^a-z0-9_-]/g, '')
        .slice(0, USERNAME_MAX_LENGTH - 5) || 'artist';

    for (let attempt = 0; attempt < 20; attempt += 1) {
      const candidate = attempt === 0 ? base : `${base}${attempt + 1}`;
      const taken = await this.users.existsBy({ username: candidate });
      if (!taken) return candidate;
    }

    return `${base}${randomUUID().slice(0, 4)}`;
  }

  /** Exchanges the authorization code and reads the provider's profile. */
  private async fetchProfile(
    provider: OAuthProvider,
    code: string,
  ): Promise<ProviderProfile> {
    this.assertEnabled(provider);

    try {
      return provider === OAuthProvider.DISCORD
        ? await this.fetchDiscord(code)
        : await this.fetchGoogle(code);
    } catch (error) {
      if (error instanceof AppException) throw error;

      this.logger.error(`${provider} OAuth exchange failed: ${(error as Error).message}`);
      throw new AppException(
        ApiErrorCode.UNAUTHORIZED,
        `Could not complete ${provider} sign-in. Try again.`,
        HttpStatus.UNAUTHORIZED,
      );
    }
  }

  private async fetchDiscord(code: string): Promise<ProviderProfile> {
    const tokenResponse = await fetch('https://discord.com/api/oauth2/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        client_id: this.config.oauth.discord.clientId as string,
        client_secret: this.config.oauth.discord.clientSecret as string,
        grant_type: 'authorization_code',
        code,
        redirect_uri: this.redirectUri(OAuthProvider.DISCORD),
      }),
    });

    if (!tokenResponse.ok) throw new Error(`token endpoint ${tokenResponse.status}`);
    const { access_token } = (await tokenResponse.json()) as { access_token: string };

    const userResponse = await fetch('https://discord.com/api/users/@me', {
      headers: { Authorization: `Bearer ${access_token}` },
    });
    if (!userResponse.ok) throw new Error(`userinfo ${userResponse.status}`);

    const profile = (await userResponse.json()) as {
      id: string;
      username: string;
      email?: string;
      verified?: boolean;
    };

    return {
      providerAccountId: profile.id,
      email: profile.email ?? null,
      emailVerified: profile.verified === true,
      handle: profile.username ?? null,
    };
  }

  private async fetchGoogle(code: string): Promise<ProviderProfile> {
    const tokenResponse = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        client_id: this.config.oauth.google.clientId as string,
        client_secret: this.config.oauth.google.clientSecret as string,
        grant_type: 'authorization_code',
        code,
        redirect_uri: this.redirectUri(OAuthProvider.GOOGLE),
      }),
    });

    if (!tokenResponse.ok) throw new Error(`token endpoint ${tokenResponse.status}`);
    const { access_token } = (await tokenResponse.json()) as { access_token: string };

    const userResponse = await fetch(
      'https://www.googleapis.com/oauth2/v3/userinfo',
      { headers: { Authorization: `Bearer ${access_token}` } },
    );
    if (!userResponse.ok) throw new Error(`userinfo ${userResponse.status}`);

    const profile = (await userResponse.json()) as {
      sub: string;
      email?: string;
      email_verified?: boolean;
      name?: string;
    };

    return {
      providerAccountId: profile.sub,
      email: profile.email ?? null,
      emailVerified: profile.email_verified === true,
      handle: profile.name ?? null,
    };
  }
}
