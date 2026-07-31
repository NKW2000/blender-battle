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
import { LoginDto } from './dto/login.dto';
import { RefreshDto } from './dto/refresh.dto';
import { OAuthExchangeDto } from './dto/oauth.dto';
import { RegisterDto } from './dto/register.dto';
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
    private readonly config: AppConfig,
  ) {}

  @Public()
  @Post('register')
  @Throttle({ default: { limit: 5, ttl: 60_000 } })
  @ResponseMessage('Account created')
  async register(@Body() dto: RegisterDto, @Req() req: Request): Promise<AuthSession> {
    return this.auth.register(dto, this.contextOf(req));
  }

  @Public()
  @Post('login')
  @HttpCode(HttpStatus.OK)
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  @ResponseMessage('Signed in')
  async login(@Body() dto: LoginDto, @Req() req: Request): Promise<AuthSession> {
    return this.auth.login(dto, this.contextOf(req));
  }

  /**
   * Public because the access token is expected to be expired at this point —
   * that is the whole reason the client is calling. The refresh token in the body
   * is the credential being verified.
   */
  @Public()
  @Post('refresh')
  @HttpCode(HttpStatus.OK)
  @Throttle({ default: { limit: 30, ttl: 60_000 } })
  async refresh(@Body() dto: RefreshDto, @Req() req: Request): Promise<AuthTokens> {
    return this.auth.refresh(dto.refreshToken, this.contextOf(req));
  }

  @Post('logout')
  @HttpCode(HttpStatus.NO_CONTENT)
  async logout(
    @Body() dto: RefreshDto,
    @CurrentUser() user: AuthenticatedUser,
    @Req() req: Request,
  ): Promise<void> {
    await this.auth.logout(
      dto.refreshToken,
      user.id,
      user.jti,
      user.exp,
      this.contextOf(req),
    );
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
  async oauthExchange(@Body() dto: OAuthExchangeDto): Promise<AuthSession> {
    return this.oauth.exchange(dto.code);
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

  /** Records who and from where, for the audit trail and token-family metadata. */
  private contextOf(req: Request): RequestContext {
    return {
      ipAddress: req.ip ?? null,
      userAgent: req.headers['user-agent'] ?? null,
    };
  }
}
