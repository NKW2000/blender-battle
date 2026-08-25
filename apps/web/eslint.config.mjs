import { FlatCompat } from '@eslint/eslintrc';

/**
 * Lint config for the web app.
 *
 * `next lint` was deprecated and, with no config present, dropped into an
 * interactive setup prompt — which meant the workspace `pnpm lint` hung and then
 * failed rather than linting anything. The script now calls ESLint directly.
 *
 * `eslint-config-next` still ships as eslintrc-style, so it is bridged through
 * FlatCompat rather than rewritten; that keeps the Next rules (hooks correctness,
 * the `next/image` and font guidance) intact instead of dropping them for the
 * sake of a nicer-looking config.
 */
const compat = new FlatCompat({ baseDirectory: import.meta.dirname });

const config = [
  {
    ignores: [
      '.next/**',
      'node_modules/**',
      'out/**',
      'coverage/**',
      'next-env.d.ts',
    ],
  },
  ...compat.extends('next/core-web-vitals', 'next/typescript'),
  {
    rules: {
      '@typescript-eslint/no-unused-vars': [
        'error',
        { argsIgnorePattern: '^_', varsIgnorePattern: '^_' },
      ],
      '@typescript-eslint/no-explicit-any': 'warn',
    },
  },
];

export default config;
