import js from '@eslint/js';
import tseslint from 'typescript-eslint';

/**
 * Lint config for the API.
 *
 * The package declared a `lint` script long before it had a linter or a config,
 * so `pnpm lint` failed at the workspace root every time it was run. This is the
 * missing half.
 *
 * Type-aware rules are deliberately left off: they require a second full
 * type-check pass, and `pnpm typecheck` already runs `tsc` over the same files.
 * Paying for the program twice would make the lint step several times slower for
 * findings the compiler already reports.
 */
export default tseslint.config(
  { ignores: ['dist/**', 'node_modules/**', 'coverage/**'] },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    files: ['**/*.ts'],
    languageOptions: {
      parserOptions: { sourceType: 'module', ecmaVersion: 2023 },
    },
    rules: {
      /*
        Decorator metadata means Nest constructs these; an interface-only import
        would be erased and break DI. The compiler covers unused-variable safety.
      */
      '@typescript-eslint/no-explicit-any': 'warn',
      '@typescript-eslint/no-unused-vars': [
        'error',
        { argsIgnorePattern: '^_', varsIgnorePattern: '^_' },
      ],
    },
  },
);
