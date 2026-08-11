import { createHmac, randomBytes, randomUUID, timingSafeEqual } from 'node:crypto';

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

    const state = this.signState(provider, linkUserId ?? null);

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
    const { provider, linkUserId } = this.verifyState(state);

    /*
      Replay protection, best effort.

      The state is already unforgeable and time-limited on its own, and the
      provider's authorization code is single-use at the provider — so a replay
      has to win a race against Discord or Google refusing the code a second
      time. This closes that race when Redis is available and does not fail the
      sign-in when it is not, which is the whole reason the state stopped living
      there.
    */
    try {
      const fresh = await this.redis.client.set(
        `oauth:state:used:${state.slice(-32)}`,
        '1',
        'EX',
        OAuthService.STATE_TTL_SECONDS,
        'NX',
      );

      if (fresh === null) {
        throw new AppException(
          ApiErrorCode.UNAUTHORIZED,
          'That sign-in link has already been used. Start again.',
          HttpStatus.UNAUTHORIZED,
        );
      }
    } catch (error) {
      if (error instanceof AppException) throw error;
      this.logger.warn(
        `OAuth replay guard unavailable, continuing on the signed state alone: ${(error as Error).message}`,
      );
    }

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

    /*
      The address is already somebody's.

      Reached when a provider reports an email it has *not* verified — an
      unverified claim is not allowed to match an existing account above,
      because anyone able to set that address on a third-party service could
      otherwise take over the account here. So the flow arrives at signup with
      an email the users table already holds, and the insert below dies on
      `uq_users_email`: a 500, logged as a database error, presented to the
      reader as "that sign-in did not complete".

      Refused here instead, with the way out. Signing in with the password and
      linking the provider from settings proves ownership of both sides, which
      is exactly what the unverified email failed to prove.
    */
    const clash = await this.users.findOne({
      where: { email: profile.email },
      select: { id: true },
    });

    if (clash) {
      throw new AppException(
        ApiErrorCode.CONFLICT,
        `An account already uses that email address. Sign in with your password, then connect ${provider} from settings.`,
        HttpStatus.CONFLICT,
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
  /**
   * The CSRF state, carried in the URL rather than held on the server.
   *
   * It used to be a random value written to Redis and looked up on the way
   * back, which makes a successful sign-in depend on that row still being there
   * several seconds later. When it was not — an eviction, a reconnect, a
   * restart, a Redis that was never reachable in the first place — the flow
   * failed with "this sign-in link has expired", which is true of a missing key
   * and says nothing about why it was missing.
   *
   * A signed state needs no storage. The payload carries what the callback has
   * to know, an HMAC over it proves this server issued it, and an expiry bounds
   * how long it is good for. Nothing can lose it, so the only ways it fails are
   * the ones that should: tampered, or too old.
   *
   * Keyed on the refresh secret rather than a new variable, so an existing
   * deployment gains this without another environment change to get wrong.
   */
  private signState(provider: OAuthProvider, linkUserId: string | null): string {
    const payload = JSON.stringify({
      p: provider,
      l: linkUserId,
      // Distinguishes two states issued in the same second, so the replay guard
      // has something unique to key on.
      n: randomBytes(9).toString('base64url'),
      e: Date.now() + OAuthService.STATE_TTL_SECONDS * 1000,
    });

    const body = Buffer.from(payload).toString('base64url');
    return `${body}.${this.stateSignature(body)}`;
  }

  private stateSignature(body: string): string {
    return createHmac('sha256', this.config.jwt.refreshSecret).update(body).digest('base64url');
  }

  /** Rejects anything this server did not issue, or issued too long ago. */
  private verifyState(state: string): { provider: OAuthProvider; linkUserId: string | null } {
    const expired = () =>
      new AppException(
        ApiErrorCode.UNAUTHORIZED,
        'That sign-in link has expired. Start again.',
        HttpStatus.UNAUTHORIZED,
      );

    const [body, signature] = state.split('.');
    if (!body || !signature) throw expired();

    /*
      Constant-time, and length-checked first.

      `timingSafeEqual` throws on a length mismatch rather than returning false,
      so an attacker could otherwise tell a wrong-length signature from a
      wrong-value one by the shape of the failure.
    */
    const expectedSignature = Buffer.from(this.stateSignature(body));
    const received = Buffer.from(signature);
    if (
      received.length !== expectedSignature.length ||
      !timingSafeEqual(received, expectedSignature)
    ) {
      this.logger.warn('OAuth state failed signature check');
      throw expired();
    }

    try {
      const { p, l, e } = JSON.parse(Buffer.from(body, 'base64url').toString()) as {
        p: OAuthProvider;
        l: string | null;
        e: number;
      };

      if (typeof e !== 'number' || Date.now() > e) throw expired();
      return { provider: p, linkUserId: l ?? null };
    } catch (error) {
      if (error instanceof AppException) throw error;
      throw expired();
    }
  }

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
