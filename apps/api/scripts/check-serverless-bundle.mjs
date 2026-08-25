/**
 * Proves the serverless entry point can be bundled, loaded, and wired.
 *
 * Several deployments failed on faults nothing else in this repository could
 * see. Typecheck, lint, the tests and both builds all passed while the deployed
 * API answered every route with `FUNCTION_INVOCATION_FAILED` — a crash page
 * naming nothing, because a function that dies during startup has no chance to
 * describe what went wrong.
 *
 * Three distinct causes, all reproduced here:
 *
 *   1. A native `.node` binary in the dependency graph. esbuild has no loader
 *      for one, so the bundle cannot be produced at all. `@node-rs/bcrypt` was
 *      the offender; `bcryptjs` replaced it.
 *
 *   2. A module-scope throw. Nest validates the environment while `AppModule`
 *      is being defined, so a missing variable throws during evaluation — and a
 *      static import in the entry point put that throw before any handler code
 *      existed to catch it.
 *
 *   3. A package resolved by runtime name. `@nestjs/terminus` looked up
 *      `typeorm` through `checkPackages([...])`, which a bundler cannot follow,
 *      and answered the miss by exiting the process.
 *
 * The first two are visible when the bundle is built and required. The third is
 * not: it only happens once Nest starts constructing providers. So this runs in
 * stages, and the last one is what makes the check worth its runtime.
 */

import { execFileSync, spawnSync } from 'node:child_process';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import * as esbuild from 'esbuild';

// This lives in the API package rather than the repository's `scripts/`,
// because esbuild is the API's devDependency and pnpm does not hoist it.
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

// ---------------------------------------------------------------- the bundle

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
  Run from a real file rather than `node -e`.

  `app-root-path` — which TypeORM pulls in — reads `require.main.filename`, and
  under `node -e` there is no main module, so it throws a confusing path error
  that has nothing to do with this application and does not happen on Vercel.
  A launcher file reproduces how the platform actually requires the function.
*/
const launchDir = mkdtempSync(join(tmpdir(), 'bb-launch-'));
const launcher = join(launchDir, 'launch.cjs');

writeFileSync(
  launcher,
  [
    'const mod = require(' + JSON.stringify(out) + ');',
    "if (typeof mod.default !== 'function') {",
    "  console.error('The entry point does not export a handler.');",
    '  process.exit(1);',
    '}',
    // Loading stops here, which is all that is needed to prove the module is
    // sound. WIRE=1 goes further and actually builds the application, because
    // that is when a provider resolving a package by name discovers it cannot.
    "if (process.env.WIRE === '1') {",
    '  const response = { statusCode: 200, setHeader() {}, end() {} };',
    "  mod.default({ url: '/health', method: 'GET', headers: {} }, response)",
    '    .catch((error) => { console.error(String(error && error.message)); });',
    '}',
  ].join('\n'),
);

// ----------------------------------------------------------- loading it cold

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

// ------------------------------------------------------------- wiring it up

/*
  Instantiate the application, not just load it.

  Loading proves the module graph is sound. It does not prove the graph can be
  *built*, and the difference is where a whole class of bundling failure lives:
  a library that resolves a package by name only does so when the provider that
  needs it is constructed, long after `require` has returned.

  Detecting that statically is not workable — the bundle is full of dynamic
  `require` calls in library internals that never execute, and failing on those
  would make this check noise. So it is detected by running it.

  The environment below is complete but fake, and the database deliberately
  points nowhere. That is fine: this failure happens while Nest is constructing
  providers, before any connection is attempted, so the child is given a few
  seconds and judged on what it printed rather than on whether it finished.
*/
const wiring = spawnSync(process.execPath, [launcher], {
  env: {
    PATH: process.env.PATH ?? '',
    WIRE: '1',
    NODE_ENV: 'production',
    // Nowhere, on purpose. A reachable database is not needed to construct the
    // providers, and this check must not depend on one existing.
    DATABASE_URL: 'postgresql://check:check@127.0.0.1:1/check',
    REDIS_URL: 'redis://127.0.0.1:1',
    JWT_ACCESS_SECRET: 'serverless-check-access-secret-not-a-real-one',
    JWT_REFRESH_SECRET: 'serverless-check-refresh-secret-not-a-real-one',
    CLOUDINARY_CLOUD_NAME: 'check',
    CLOUDINARY_API_KEY: 'check',
    CLOUDINARY_API_SECRET: 'check',
  },
  cwd: launchDir,
  timeout: 20_000,
  encoding: 'utf8',
});

const printed = `${wiring.stdout ?? ''}${wiring.stderr ?? ''}`;

/*
  Singular and plural both, because Nest phrases the two cases differently —
  `The "typeorm" package is missing` against `The "@nestjs/typeorm", "typeorm"
  packages are missing`. Matching only the singular form made this check pass on
  a build that failed in exactly the way it exists to catch.
*/
const missing = /The ((?:"[^"]+"(?:, )?)+) packages? (?:is|are) missing/.exec(printed);

if (missing) {
  console.error(`Wiring the application cannot resolve ${missing[1]} at runtime.\n`);
  console.error(
    'A bundler cannot follow a package name held in a variable, and the lookup' +
      '\nfailing exits the process — so the deployed function is killed during' +
      '\nstartup and answers every route with an unexplained crash.\n' +
      '\nInject the dependency instead of letting a library look it up by name.',
  );
  process.exit(1);
}

console.log('Serverless entry point: bundles clean, loads, and wires without exiting.');
