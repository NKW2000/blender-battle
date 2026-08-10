import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vitest/config';

/**
 * Front-end tests.
 *
 * These exist for the two hand-built controls — `Select` and `DateTimeField`.
 * Rebuilding a combobox and a date picker means owning their keyboard and
 * screen-reader behaviour, and that behaviour is invisible to anyone testing
 * with a mouse: the first audit found `aria-activedescendant` on an element
 * that never receives focus, so the highlight moved and nothing was announced.
 *
 * `passWithNoTests` stays on so the repo-wide `pnpm test` reports real failures
 * rather than exiting 1 for a workspace that happens to have no specs.
 */
const here = (path: string) => fileURLToPath(new URL(path, import.meta.url));

const SHARED_SRC = here('../../packages/shared/src');

/**
 * `packages/shared` writes relative imports as `./enums.js`, which is correct
 * for the ESM it emits but does not exist under `src`. Resolving the tests
 * against source rather than `dist` means a fresh checkout can run them without
 * building an unrelated package first, so the extension is mapped back here.
 * Mirrors the same plugin in `apps/api/vitest.config.ts`.
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
    // A DOM, because these are components. The API suite stays on `node`.
    environment: 'jsdom',
    include: ['src/**/*.spec.{ts,tsx}'],
    setupFiles: ['./vitest.setup.ts'],
    passWithNoTests: true,
  },
  /*
    The automatic JSX runtime, stated explicitly.

    `tsconfig.json` sets `jsx: "preserve"` because Next runs its own transform,
    and Vitest's esbuild reads that and falls back to the classic runtime — which
    expects `React` to be in scope and fails with "React is not defined" in every
    component test.

    This is also why there is no `@vitejs/plugin-react` here. The plugin exists
    for Fast Refresh, which a test run has no use for, and installing it pulled
    in a second major version of Vite alongside the one Vitest uses — two sets
    of incompatible plugin types, for a transform esbuild already does.
  */
  esbuild: { jsx: 'automatic' },
  resolve: {
    alias: {
      '@bb/shared': here('../../packages/shared/src/index.ts'),
      '@': here('./src'),
    },
  },
});
