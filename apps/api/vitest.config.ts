import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vitest/config';

/**
 * Unit tests for the API.
 *
 * Two deliberate choices here, both aimed at keeping the suite something that
 * actually gets run rather than something that needs a working environment
 * before it will start:
 *
 *  - **No Nest DI.** Every test constructs its subject with `new`, passing
 *    hand-written fakes. Nest's container needs `emitDecoratorMetadata`, which
 *    esbuild does not implement, so wiring the container would mean adding an
 *    SWC transform purely so the framework could hand us objects we already
 *    have. Constructing directly is faster, and it makes the collaborators a
 *    test depends on visible in the test itself.
 *
 *  - **`@bb/shared` resolves to source, not `dist`.** The package is built by a
 *    separate `tsc` run, so pointing at `dist` would mean a stale build could
 *    make the suite pass or fail for reasons that have nothing to do with the
 *    code under test — and a fresh checkout could not run tests at all until it
 *    had built an unrelated package first.
 */
const here = (path: string) => fileURLToPath(new URL(path, import.meta.url));

const SHARED_SRC = here('../../packages/shared/src');

/**
 * `packages/shared` writes its relative imports as `./enums.js`, which is what
 * TypeScript requires for a package that emits real ESM. Resolving that against
 * the *source* directory finds nothing, because on disk the file is `enums.ts`.
 * Node never sees this — it loads the built `dist` — but pointing the tests at
 * source means the test runner does, so the extension is mapped back here.
 */
const sharedSourceExtensions = {
  name: 'bb-shared-source-extensions',
  enforce: 'pre' as const,
  resolveId(source: string, importer?: string) {
    if (!importer?.startsWith(SHARED_SRC)) return null;
    if (!source.startsWith('.') || !source.endsWith('.js')) return null;
    return fileURLToPath(new URL(source.replace(/\.js$/, '.ts'), `file://${importer}`));
  },
};

export default defineConfig({
  plugins: [sharedSourceExtensions],
  test: {
    environment: 'node',
    include: ['src/**/*.spec.ts'],
    globals: false,
    // The suite is pure computation over fakes. Anything approaching this is a
    // test that has accidentally acquired a real connection.
    testTimeout: 10_000,
  },
  resolve: {
    alias: {
      '@bb/shared': here('../../packages/shared/src/index.ts'),
      '@': here('./src'),
    },
  },
  esbuild: {
    // TypeORM and Nest decorators are evaluated at import time. Only the
    // legacy decorator semantics are needed — no metadata is read, because
    // nothing here builds a schema or resolves a provider.
    target: 'es2022',
    tsconfigRaw: {
      compilerOptions: {
        experimentalDecorators: true,
        useDefineForClassFields: false,
      },
    },
  },
});
