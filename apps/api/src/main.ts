import 'reflect-metadata';

import { Logger } from '@nestjs/common';

import { createApp } from './bootstrap';
import { AppConfig } from './config/app.config';

/**
 * The long-running server.
 *
 * Used by any host that runs a process and gives it a port. The scheduled jobs
 * — the room and challenge sweeps, the metrics snapshot, the token prune — only
 * exist in this shape of deployment, because they need something that stays
 * awake between requests.
 */
async function bootstrap(): Promise<void> {
  const app = await createApp();
  const config = app.get(AppConfig);

  await app.listen(config.port, '0.0.0.0');
  Logger.log(`API listening on :${config.port} (${config.nodeEnv})`, 'Bootstrap');
}

void bootstrap();
