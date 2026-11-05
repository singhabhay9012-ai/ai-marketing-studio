// ESLint flat config for the whole monorepo. Each package's `lint` script runs `eslint .`,
// which picks up this file from the workspace root.
import js from '@eslint/js';
import nextPlugin from '@next/eslint-plugin-next';
import reactHooks from 'eslint-plugin-react-hooks';
import globals from 'globals';
import tseslint from 'typescript-eslint';

export default tseslint.config(
  {
    ignores: [
      '**/node_modules/**',
      '**/dist/**',
      '**/.next/**',
      '**/coverage/**',
      '**/.storage/**',
      '**/next-env.d.ts',
      '**/*.tsbuildinfo',
    ],
  },

  js.configs.recommended,
  ...tseslint.configs.recommendedTypeChecked,
  {
    languageOptions: {
      ecmaVersion: 2023,
      sourceType: 'module',
      globals: { ...globals.node },
      parserOptions: {
        // seed.ts is run with tsx and sits outside the database package's tsconfig. playwright.config.ts sits at the root, which has no tsconfig.json.
        projectService: {
          allowDefaultProject: ['*.mjs', '*.js', 'server/database/prisma/seed.ts', 'playwright.config.ts'],
          defaultProject: 'server/database/tsconfig.json',
        },
        tsconfigRootDir: import.meta.dirname,
      },
    },
  },

  {
    rules: {
      // `_`-prefixed names and rest siblings are the codebase's "omit this field" idiom.
      '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_', varsIgnorePattern: '^_', ignoreRestSiblings: true }],
      // Some async methods have no await because they implement Promise-returning interfaces.
      '@typescript-eslint/require-await': 'off',
    },
  },

  // Plain JS config files are not type-checked.
  { files: ['**/*.{js,mjs,cjs}'], ...tseslint.configs.disableTypeChecked },

  // Next.js frontend.
  {
    files: ['client/**/*.{ts,tsx}'],
    plugins: { '@next/next': nextPlugin, 'react-hooks': reactHooks },
    languageOptions: { globals: { ...globals.browser } },
    settings: { next: { rootDir: 'client' } },
    rules: {
      ...nextPlugin.configs.recommended.rules,
      ...nextPlugin.configs['core-web-vitals'].rules,
      'react-hooks/rules-of-hooks': 'error',
      'react-hooks/exhaustive-deps': 'warn',
      // Async event handlers in JSX attributes (onSubmit={async …}) are intended.
      '@typescript-eslint/no-misused-promises': ['error', { checksVoidReturn: { attributes: false } }],
    },
  },

  // Tests use Jest globals and loosely typed Supertest responses.
  {
    files: ['**/test/**/*.ts', '**/*.test.ts', '**/*.spec.ts'],
    languageOptions: { globals: { ...globals.jest } },
    rules: {
      // Supertest response bodies are `any`; asserting on them is the point of the tests.
      '@typescript-eslint/no-unsafe-argument': 'off',
      '@typescript-eslint/no-unsafe-assignment': 'off',
      '@typescript-eslint/no-unsafe-call': 'off',
      '@typescript-eslint/no-unsafe-member-access': 'off',
      '@typescript-eslint/no-unsafe-return': 'off',
      // node:test's test() returns a promise the runner tracks.
      '@typescript-eslint/no-floating-promises': 'off',
    },
  },
);
