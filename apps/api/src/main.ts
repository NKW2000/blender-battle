import 'reflect-metadata';

import { Logger, RequestMethod, ValidationPipe, VersioningType } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { API_PREFIX } from '@bb/shared';
import { WINSTON_MODULE_NEST_PROVIDER } from 'nest-winston';
import helmet from 'helmet';

import { AppModule } from './app.module';
import { AppConfig } from './config/app.config';

async function bootstrap(): Promise<void> {
  // Env validation runs inside ConfigModule during this call — a misconfigured
  // container dies here, loudly, instead of failing on its first real request.
  const app = await NestFactory.create<NestExpressApplication>(AppModule, {
    bufferLogs: true,
  });

  const config = app.get(AppConfig);
  app.useLogger(app.get(WINSTON_MODULE_NEST_PROVIDER));

  /*
    Health probes sit outside the versioned prefix: orchestrators poll a fixed
    path, and a future /api/v2 must not move the URL the probe was configured
    with.

    The prefix is taken from the shared `API_PREFIX` so the front end's base URL
    and the server's routing table cannot disagree. Nest wants the base and the
    version separately, hence the split.
  */
  app.setGlobalPrefix(API_PREFIX.split('/')[0]!, {
    exclude: [
      { path: 'health', method: RequestMethod.GET },
      { path: 'health/ready', method: RequestMethod.GET },
    ],
  });
  app.enableVersioning({ type: VersioningType.URI, defaultVersion: '1' });

  app.use(helmet({ crossOriginResourcePolicy: { policy: 'cross-origin' } }));

  /*
    Explicit origin allowlist, with credentials.

    `credentials: true` is required now that the refresh token is an httpOnly
    cookie: the web app is on a different site from the API in production, so
    without it the browser would neither send the cookie nor accept the
    `Set-Cookie` that creates it.

    This is exactly why the origin list must stay explicit. The CORS spec
    forbids pairing `Access-Control-Allow-Credentials: true` with a wildcard
    origin, and for good reason — it would let any site on the internet make
    authenticated requests as the user. `config.corsOrigins` is parsed from a
    comma-separated environment variable and is never `*`.

    `x-bb-client` is allowlisted because `SameSiteGuard` requires it on the
    cookie-authenticated endpoints; a header that CORS refuses would make those
    endpoints unreachable from the app itself.
  */
  app.enableCors({
    origin: config.corsOrigins,
    methods: ['GET', 'POST', 'PATCH', 'PUT', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'X-Request-Id', 'x-bb-client'],
    credentials: true,
    maxAge: 86_400,
  });

  app.useGlobalPipes(
    new ValidationPipe({
      // Strips properties absent from the DTO, so a request cannot smuggle in
      // fields a service might later read.
      whitelist: true,
      // ...and rejects them outright rather than silently dropping, which turns a
      // client bug into a visible 400 instead of a mysterious no-op.
      forbidNonWhitelisted: true,
      transform: true,
      transformOptions: { enableImplicitConversion: false },
    }),
  );

  // Behind a load balancer or ingress; without this req.ip is the proxy's address
  // and every rate limit becomes global rather than per-client.
  app.set('trust proxy', 1);

  app.enableShutdownHooks();

  await app.listen(config.port, '0.0.0.0');
  Logger.log(`API listening on :${config.port} (${config.nodeEnv})`, 'Bootstrap');
}

void bootstrap();
