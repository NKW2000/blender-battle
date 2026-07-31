import 'reflect-metadata';

import { Logger, RequestMethod, ValidationPipe, VersioningType } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { WINSTON_MODULE_NEST_PROVIDER } from 'nest-winston';
import helmet from 'helmet';

import { RedisIoAdapter } from './common/adapters/redis-io.adapter';
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

  // Health probes sit outside the versioned prefix: orchestrators poll a fixed
  // path, and a future /api/v2 must not move the URL Kubernetes was configured with.
  app.setGlobalPrefix('api', {
    exclude: [
      { path: 'health', method: RequestMethod.GET },
      { path: 'health/ready', method: RequestMethod.GET },
    ],
  });
  app.enableVersioning({ type: VersioningType.URI, defaultVersion: '1' });

  app.use(helmet({ crossOriginResourcePolicy: { policy: 'cross-origin' } }));

  // Explicit origin allowlist. `credentials` is false because authentication
  // travels in the Authorization header, not in cookies — nothing needs the
  // browser to attach credentials cross-origin.
  app.enableCors({
    origin: config.corsOrigins,
    methods: ['GET', 'POST', 'PATCH', 'PUT', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'X-Request-Id'],
    credentials: false,
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

  // Socket.IO over Redis pub/sub, so battle broadcasts reach spectators on every
  // instance rather than only the one that emitted them.
  const socketAdapter = new RedisIoAdapter(app);
  await socketAdapter.connectToRedis();
  app.useWebSocketAdapter(socketAdapter);

  app.enableShutdownHooks();

  await app.listen(config.port, '0.0.0.0');
  Logger.log(`API listening on :${config.port} (${config.nodeEnv})`, 'Bootstrap');
}

void bootstrap();
