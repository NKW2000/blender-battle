import 'reflect-metadata';

import type { IncomingMessage, ServerResponse } from 'node:http';

import { createApp } from '../src/bootstrap';

/**
 * The serverless entry point.
 *
 * Vercel invokes a function per request rather than running a process, so this
 * builds the Nest application once and reuses it for every request the same
 * warm instance handles. Rebuilding per request would re-run env validation,
 * re-open a Postgres pool and a Redis connection, and re-scan the module graph
 * — hundreds of milliseconds of work, for an application that is identical each
 * time.
 *
 * ## The promise is cached, not the app
 *
 * Two requests can arrive on a cold instance before the first has finished
 * booting. Caching the resolved app would let both start their own bootstrap
 * and leave one of them orphaned, holding database connections nothing will
 * close. Caching the promise means the second waits on the first.
 *
 * ## What this shape does not do
 *
 * The scheduled jobs do not run here. There is no process between requests to
 * run them in, so `@Interval` and `@Cron` never fire on a serverless
 * deployment. Room and challenge phases are derived from their stored dates and
 * advance when they are read, which is what makes that survivable — but the
 * jobs that are *not* read-driven need a cron trigger instead. See
 * `vercel.json`.
 */
let app: Promise<{ getHttpAdapter: () => { getInstance: () => unknown } }> | null = null;

async function instance() {
  app ??= createApp().then(async (created) => {
    // `init` rather than `listen`: the module graph, guards and pipes are all
    // wired, but nothing binds a port — the platform owns the socket.
    await created.init();
    return created;
  });

  return app;
}

export default async function handler(
  request: IncomingMessage,
  response: ServerResponse,
): Promise<void> {
  const nest = await instance();
  const express = nest.getHttpAdapter().getInstance() as (
    req: IncomingMessage,
    res: ServerResponse,
  ) => void;

  express(request, response);
}
