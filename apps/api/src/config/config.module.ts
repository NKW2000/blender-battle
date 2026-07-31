import { join } from 'node:path';

import { Global, Module } from '@nestjs/common';
import { ConfigModule as NestConfigModule } from '@nestjs/config';

import { AppConfig } from './app.config';
import { validateEnv } from './env.schema';

/**
 * Global so no feature module has to re-import it to read configuration.
 * `validateEnv` runs during module initialisation — misconfiguration fails the
 * boot, not the first request.
 */
@Global()
@Module({
  imports: [
    NestConfigModule.forRoot({
      isGlobal: true,
      cache: true,
      validate: validateEnv,
      // The API runs from apps/api but .env lives at the monorepo root, so both
      // locations are searched. Earlier entries win, which keeps a per-app
      // override possible without moving the shared file.
      envFilePath: [
        '.env.local',
        '.env',
        join(__dirname, '../../../../.env.local'),
        join(__dirname, '../../../../.env'),
      ],
    }),
  ],
  providers: [AppConfig],
  exports: [AppConfig],
})
export class ConfigModule {}
