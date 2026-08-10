import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseEnumPipe,
  Post,
  Query,
  Req,
  Res,
} from '@nestjs/common';
import { UseGuards } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { InjectRepository } from '@nestjs/typeorm';
import {
  ApiErrorCode,
  OAuthProvider,
  type AuthSession,
  type AuthTokens,
  type LinkedAccount,
  type SelfUserProfile,
} from '@bb/shared';
import type { Request, Response } from 'express';
import { Repository } from 'typeorm';

import { CurrentUser, OptionalAuth, Public } from '@/common/decorators';
import { AppException } from '@/common/exceptions/app.exception';
import { AppConfig } from '@/config/app.config';
import { ResponseMessage } from '@/common/interceptors/response.interceptor';
import type { AuthenticatedUser } from '@/common/types/authenticated-user';
import { User } from '@/modules/users/entities/user.entity';
import { UserMapper } from '@/modules/users/users.mapper';

import { AuthService, type RequestContext } from './auth.service';
import {
  clearRefreshCookie,
  readRefreshCookie,
  setRefreshCookie,
} from './refresh-cookie';
import { SameSiteGuard } from './same-site.guard';
import { LoginDto } from './dto/login.dto';
import { OAuthExchangeDto } from './dto/oauth.dto';
import {
  ForgotPasswordDto,
  ResetPasswordDto,
  VerifyEmailDto,
} from './dto/recovery.dto';
import { RegisterDto } from './dto/register.dto';
import { AccountRecoveryService } from './services/account-recovery.service';
import { OAuthService } from './services/oauth.service';

/**
 * Thin by design: extract the request context, delegate, return data. No business
 * logic and no envelope construction — the interceptor handles the latter.
 *
 * Auth endpoints carry tighter throttle limits than the global default because
 * they are the credential-stuffing surface.
 */
@Controller('auth')
export class AuthController {
  constructor(
    private readonly auth: AuthService,
    @InjectRepository(User) private readonly users: Repository<User>,
    private readonly oauth: OAuthService,
    private readonly recovery: AccountRecoveryService,
    private readonly config: AppConfig,
  ) {}

  @Public()
  @Post('register')
  @Throttle({ default: { limit: 5, ttl: 60_000 } })
  @ResponseMessage('Account created')
  async register(
    @Body() dto: RegisterDto,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ): Promise<AuthSession> {
    return this.issue(res, await this.auth.register(dto, this.contextOf(req)));
  }

  @Public()
  @Post('login')
  @HttpCode(HttpStatus.OK)
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  @ResponseMessage('Signed in')
  async login(
    @Body() dto: LoginDto,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ): Promise<AuthSession> {
    return this.issue(res, await this.auth.login(dto, this.contextOf(req)));
  }

  /**
   * Rotate the session.
   *
   * Public because the access token is expected to be expired by the time this
   * is called — that is the whole reason the client is here. The credential
   * being verified is the refresh cookie, which the browser attaches on its own
   * and which JavaScript cannot read.
   *
   * `SameSiteGuard` is what stops any other site from triggering a rotation
   * with the victim's cookie attached; see the guard for why a header is
   * sufficient.
   */
  @Public()
  @UseGuards(SameSiteGuard)
  @Post('refresh')
  @HttpCode(HttpStatus.OK)
  @Throttle({ default: { limit: 30, ttl: 60_000 } })
  async refresh(
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ): Promise<AuthTokens> {
    const presented = readRefreshCookie(req);

    if (!presented) {
      // No cookie at all: a first visit, a cleared browser, or an expired
      // cookie the browser has already dropped. Reported as an ordinary expiry
      // so the client treats it as "not signed in" rather than as theft.
      throw AppException.unauthorized(
        ApiErrorCode.TOKEN_EXPIRED,
        'No session to refresh',
      );
    }

    try {
      return this.issue(res, await this.auth.refresh(presented, this.contextOf(req)));
    } catch (error) {
      // The cookie is dead — expired, revoked, or reused. Clearing it stops the
      // browser replaying it on every subsequent page load, which for the reuse
      // path would keep re-triggering a security alert on an already-dead family.
      clearRefreshCookie(res, this.config);
      throw error;
    }
  }

  @UseGuards(SameSiteGuard)
  @Post('logout')
  @HttpCode(HttpStatus.NO_CONTENT)
  async logout(
    @CurrentUser() user: AuthenticatedUser,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ): Promise<void> {
    const presented = readRefreshCookie(req);

    // Cleared first and unconditionally. Logout must leave the browser without
    // a credential even if the server-side revocation fails, or a failed logout
    // looks successful and leaves the session live.
    clearRefreshCookie(res, this.config);

    if (presented) {
      await this.auth.logout(presented, user.id, user.jti, user.exp, this.contextOf(req));
    }
  }

  // --- Account recovery -----------------------------------------------------

  /**
   * Ask for a reset link.
   *
   * Always 204, whether or not the address belongs to an account. Answering
   * differently would turn this into a membership oracle, and this app puts
   * usernames on public profiles — confirming the address behind one is a real
   * disclosure, not a theoretical one.
   *
   * Throttled hard. It is the one unauthenticated endpoint that causes an email
   * to be sent, which makes it the obvious lever for using the service to spam
   * a third party.
   */
  @Public()
  @Post('password/forgot')
  @HttpCode(HttpStatus.NO_CONTENT)
  @Throttle({ default: { limit: 3, ttl: 15 * 60_000 } })
  async forgotPassword(@Body() dto: ForgotPasswordDto, @Req() req: Request): Promise<void> {
    await this.recovery.requestPasswordReset(dto.email, this.contextOf(req));
  }

  /** Redeem a reset link. Signs every existing session out. */
  @Public()
  @Post('password/reset')
  @HttpCode(HttpStatus.NO_CONTENT)
  @Throttle({ default: { limit: 5, ttl: 15 * 60_000 } })
  async resetPassword(@Body() dto: ResetPasswordDto, @Req() req: Request): Promise<void> {
    await this.recovery.resetPassword(dto.token, dto.password, this.contextOf(req));
  }

  /** Confirm an address from an emailed link. */
  @Public()
  @Post('email/verify')
  @HttpCode(HttpStatus.NO_CONTENT)
  @Throttle({ default: { limit: 10, ttl: 15 * 60_000 } })
  async verifyEmail(@Body() dto: VerifyEmailDto): Promise<void> {
    await this.recovery.verifyEmail(dto.token);
  }

  /** Send another verification link to the signed-in user's own address. */
  @Post('email/verify/resend')
  @HttpCode(HttpStatus.NO_CONTENT)
  @Throttle({ default: { limit: 3, ttl: 15 * 60_000 } })
  async resendVerification(@CurrentUser() user: AuthenticatedUser): Promise<void> {
    await this.auth.resendVerification(user.id);
  }

  // --- OAuth ----------------------------------------------------------------

  /** Which providers this deployment actually has credentials for. */
  @Public()
  @Get('oauth/providers')
  providers(): { providers: OAuthProvider[] } {
    return {
      providers: Object.values(OAuthProvider).filter((provider) =>
        this.oauth.isEnabled(provider),
      ),
    };
  }

  /**
   * Declared before the :provider route below — Nest matches in declaration
   * order, so "linked" would otherwise be parsed as a provider name and
   * rejected by ParseEnumPipe.
   */
  @Get('oauth/linked')
  async linkedAccounts(@CurrentUser('id') userId: string): Promise<LinkedAccount[]> {
    return this.oauth.listLinked(userId);
  }

  /**
   * Starts the flow. Redirects the browser to the provider's consent screen.
   *
   * `link` is set when a signed-in user is connecting an additional provider;
   * the caller's id is taken from their token, never from the query string.
   */
  @OptionalAuth()
  @Get('oauth/:provider')
  @Throttle({ default: { limit: 20, ttl: 60_000 } })
  async startOAuth(
    @Param('provider', new ParseEnumPipe(OAuthProvider)) provider: OAuthProvider,
    @Req() req: Request,
    @Res() res: Response,
  ): Promise<void> {
    const linkUserId = (req as Request & { user?: AuthenticatedUser }).user?.id;
    res.redirect(await this.oauth.authorizeUrl(provider, linkUserId));
  }

  /**
   * The provider's redirect target.
   *
   * Ends by sending the browser to the frontend with a single-use code — never
   * with tokens, which would be written into browser history and the Referer
   * header of the next request.
   */
  @Public()
  @Get('oauth/:provider/callback')
  async oauthCallback(
    @Param('provider', new ParseEnumPipe(OAuthProvider)) provider: OAuthProvider,
    @Query('code') code: string,
    @Query('state') state: string,
    @Req() req: Request,
    @Res() res: Response,
  ): Promise<void> {
    const frontend = this.config.oauth.frontendUrl;

    if (!code || !state) {
      res.redirect(`${frontend}/login?error=oauth_cancelled`);
      return;
    }

    try {
      const exchangeCode = await this.oauth.handleCallback(code, state, this.contextOf(req));
      res.redirect(`${frontend}/auth/callback?code=${encodeURIComponent(exchangeCode)}`);
    } catch (error) {
      // The provider redirect is a browser navigation, so a failure has to land
      // the user somewhere useful rather than rendering a JSON error page.
      const message =
        error instanceof AppException ? error.code : ApiErrorCode.INTERNAL_ERROR;
      res.redirect(`${frontend}/login?error=${encodeURIComponent(message)}`);
    }
  }

  /** Trades the single-use code for the real session. */
  @Public()
  @Post('oauth/exchange')
  @HttpCode(HttpStatus.OK)
  @Throttle({ default: { limit: 20, ttl: 60_000 } })
  @ResponseMessage('Signed in')
  async oauthExchange(
    @Body() dto: OAuthExchangeDto,
    @Res({ passthrough: true }) res: Response,
  ): Promise<AuthSession> {
    return this.issue(res, await this.oauth.exchange(dto.code));
  }

  @Delete('oauth/:provider')
  @HttpCode(HttpStatus.NO_CONTENT)
  async unlinkProvider(
    @Param('provider', new ParseEnumPipe(OAuthProvider)) provider: OAuthProvider,
    @CurrentUser('id') userId: string,
  ): Promise<void> {
    await this.oauth.unlink(userId, provider);
  }

  @Get('me')
  async me(@CurrentUser('id') userId: string): Promise<SelfUserProfile> {
    const user = await this.users.findOneOrFail({ where: { id: userId } });
    return UserMapper.toSelf(user);
  }

  /**
   * Moves the refresh token out of the response body and into the cookie.
   *
   * The single place that happens. Every endpoint that starts or rotates a
   * session goes through here, so there is one implementation of the cookie's
   * attributes and no way to add a session endpoint that accidentally returns
   * the token as JSON — the public `AuthSession` type has nowhere to put it.
   */
  private issue<T extends { refreshToken: string }>(
    res: Response,
    issued: T,
  ): Omit<T, 'refreshToken'> {
    const { refreshToken, ...body } = issued;
    setRefreshCookie(res, refreshToken, this.config);
    return body;
  }

  /** Records who and from where, for the audit trail and token-family metadata. */
  private contextOf(req: Request): RequestContext {
    return {
      ipAddress: req.ip ?? null,
      userAgent: req.headers['user-agent'] ?? null,
    };
  }
}
