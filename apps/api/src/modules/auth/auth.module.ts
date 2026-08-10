import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { PassportModule } from '@nestjs/passport';
import { TypeOrmModule } from '@nestjs/typeorm';

import { User } from '@/modules/users/entities/user.entity';

import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import { AccountToken } from './entities/account-token.entity';
import { RefreshTokenFamily } from './entities/refresh-token-family.entity';
import { OAuthIdentity } from './entities/oauth-identity.entity';
import { RefreshToken } from './entities/refresh-token.entity';
import { AccountRecoveryService } from './services/account-recovery.service';
import { OAuthService } from './services/oauth.service';
import { TokenCleanupService } from './services/token-cleanup.service';
import { PasswordService } from './services/password.service';
import { TokenService } from './services/token.service';
import { JwtStrategy } from './strategies/jwt.strategy';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      User,
      RefreshTokenFamily,
      RefreshToken,
      OAuthIdentity,
      AccountToken,
    ]),
    PassportModule.register({ defaultStrategy: 'jwt', session: false }),
    // Secrets are passed per-signing call, not registered here: access and refresh
    // tokens use different secrets, and a module-level default invites signing a
    // refresh token with the access secret by accident.
    JwtModule.register({}),
  ],
  controllers: [AuthController],
  providers: [
    AuthService,
    AccountRecoveryService,
    TokenService,
    TokenCleanupService,
    PasswordService,
    OAuthService,
    JwtStrategy,
  ],
  exports: [TokenService, OAuthService],
})
export class AuthModule {}
