import 'reflect-metadata';

import type { IncomingMessage, ServerResponse } from 'node:http';

/*
  The compiled output, not the source.

  Vercel builds this file with esbuild, which does not read `tsconfig` `paths`
  — so importing `../src/bootstrap` would pull in a tree where every `@/…`
  import fails to resolve, and the failure arrives at deploy time rather than
  here. `nest build` plus `tsc-alias` has already rewritten those to relative
  paths, so `dist` is self-contained and needs nothing but a `require`.
*/
import { createApp } from '../dist/bootstrap';

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

  /*
    A failed boot is not cached.

    `??=` alone stores the rejected promise, so an instance that failed once —
    a database that was briefly unreachable, an environment variable fixed a
    minute later — keeps failing for its whole lifetime, and the next request
    replays a stale error rather than trying again. Clearing it on rejection
    means the retry is a real retry.
  */
  try {
    return await app;
  } catch (error) {
    app = null;
    throw error;
  }
}

/**
 * A boot failure, in words.
 *
 * Without this the reader gets Vercel's generic FUNCTION_INVOCATION_FAILED page
 * and has to go and find the log — and the log is exactly what someone
 * deploying for the first time has the most trouble reaching. Nearly every
 * failure here is a missing or malformed environment variable, and the
 * validation names the variable.
 *
 * The message is returned; the stack is only logged. And anything shaped like a
 * URL with credentials in it is redacted first — a connection error can quote
 * the string it failed to connect with, and that string holds a password.
 */
function describe(error: unknown): string {
  const message = error instanceof Error ? error.message : String(error);

  return message
    // Anything with a userinfo section: postgres://user:pass@host, rediss://…
    .replace(/([a-z][a-z0-9+.-]*:\/\/)[^\s@/]*@/gi, '$1***@')
    .slice(0, 600);
}

export default async function handler(
  request: IncomingMessage,
  response: ServerResponse,
): Promise<void> {
  let nest;

  try {
    nest = await instance();
  } catch (error) {
    // The whole thing, once, where the platform's log will keep it.
    console.error('API failed to start', error);

    response.statusCode = 500;
    response.setHeader('content-type', 'application/json');
    response.end(
      JSON.stringify({
        success: false,
        message: 'The API could not start.',
        error: { code: 'BOOT_FAILED', detail: describe(error) },
      }),
    );
    return;
  }

  const express = nest.getHttpAdapter().getInstance() as (
    req: IncomingMessage,
    res: ServerResponse,
  ) => void;

  express(request, response);
}
