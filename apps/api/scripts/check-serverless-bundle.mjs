/**
 * Proves the serverless entry point can be bundled and loaded.
 *
 * Four deployments failed on faults this catches, and none of them were visible
 * to typecheck, lint, tests or the build — every one of those passed while the
 * deployed function died before running a line of application code. The symptom
 * at the other end is `FUNCTION_INVOCATION_FAILED`: a generic crash page naming
 * nothing, because a function that fails to *load* has no chance to answer.
 *
 * Two distinct causes, both reproduced here:
 *
 *   1. A native `.node` binary anywhere in the dependency graph. esbuild has no
 *      loader for one, so the bundle cannot even be produced. `@node-rs/bcrypt`
 *      was the offender; `bcryptjs` replaced it.
 *
 *   2. A module-scope throw. Nest validates the environment while `AppModule`
 *      is being defined, so a missing variable throws during evaluation — and a
 *      static import in the entry point put that throw before any handler code.
 *      The import is deferred now, which is what makes the difference between a
 *      crash page and a 500 that names the variable.
 *
 * So this asserts both: the bundle builds, and requiring it does not throw. It
 * deliberately runs with no environment set, since that is the state a
 * half-configured deployment is in and the one that has to stay diagnosable.
 */

import { execFileSync } from 'node:child_process';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import * as esbuild from 'esbuild';

// This lives in the API package rather than the repository's `scripts/`, because
// esbuild is the API's devDependency and pnpm does not hoist it to the root.
const api = resolve(fileURLToPath(new URL('..', import.meta.url)));

/*
  Bare imports Nest probes inside try/catch for adapters this application does
  not use — microservices, other ORMs. Vercel's builder leaves them external;
  the reproduction has to as well, or it reports failures that cannot happen
  there and this check becomes noise everyone learns to ignore.
*/
const optionalPeers = [
  '@nestjs/microservices',
  '@nestjs/microservices/microservices-module',
  '@nestjs/websockets/socket-module',
  '@nestjs/mongoose',
  '@nestjs/sequelize',
  '@nestjs/sequelize/dist/common/sequelize.utils',
  '@mikro-orm/core',
  'class-transformer/storage',
];

const out = join(mkdtempSync(join(tmpdir(), 'bb-serverless-')), 'index.js');


try {
  await esbuild.build({
    entryPoints: ['api/index.ts'],
    bundle: true,
    platform: 'node',
    format: 'cjs',
    target: 'node22',
    outfile: out,
    logLevel: 'silent',
    external: optionalPeers,
    /*
      Stated rather than inherited. esbuild fixes its working directory when it
      starts its worker, not when `build` is called, so a `chdir` here would be
      too late — and the script has to give the same answer from CI, a hook, or
      a shell sitting in a subdirectory.
    */
    absWorkingDir: api,
  });
} catch (error) {
  console.error('The serverless entry point cannot be bundled.\n');
  for (const problem of error.errors ?? []) console.error('  *', problem.text);
  console.error(
    '\nA `.node` file here means a native dependency crept in. Native binaries' +
      '\ncannot be bundled, and the deployment fails at load with no message.',
  );
  process.exit(1);
}

/*
  Loaded in a child process, from a real file rather than `node -e`.

  `app-root-path` — which TypeORM pulls in — reads `require.main.filename`, and
  under `node -e` there is no main module, so it throws a confusing path error
  that has nothing to do with this application and does not happen on Vercel.
  A launcher file reproduces how the platform actually requires the function.
*/
const launchDir = mkdtempSync(join(tmpdir(), 'bb-launch-'));
const launcher = join(launchDir, 'launch.cjs');
writeFileSync(
  launcher,
  `const mod = require(${JSON.stringify(out)});\n` +
    `if (typeof mod.default !== 'function') {\n` +
    `  console.error('The entry point does not export a handler.');\n` +
    `  process.exit(1);\n` +
    `}\n`,
);

try {
  execFileSync(process.execPath, [launcher], {
    // Empty, on purpose: a deployment missing a variable must still load and
    // report, rather than dying where nothing can describe what went wrong.
    env: { PATH: process.env.PATH ?? '' },
    /*
      Run from a temporary directory, so no `.env` is in reach.

      `ConfigModule` searches for one relative to the working directory, and the
      repository root has a real one for local development. Inheriting that cwd
      handed the child a fully configured environment and the check passed on a
      build that could not possibly boot on the platform — it was measuring this
      machine, not the deployment.
    */
    cwd: launchDir,
    stdio: 'pipe',
  });
} catch (error) {
  console.error('The serverless entry point bundles, but throws while loading.\n');
  console.error(String(error.stderr ?? error.message).split('\n').slice(0, 12).join('\n'));
  console.error(
    '\nWork done at module scope cannot be caught by the request handler. Move' +
      '\nit behind the deferred import in apps/api/api/index.ts.',
  );
  process.exit(1);
}

console.log('Serverless entry point: bundles clean, loads without throwing.');
