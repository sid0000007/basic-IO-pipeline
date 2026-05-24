// @ts-check
import js from '@eslint/js';
import tseslint from 'typescript-eslint';
import prettier from 'eslint-config-prettier';

export default tseslint.config(
  {
    ignores: [
      '**/node_modules/**',
      '**/dist/**',
      '**/.next/**',
      '**/build/**',
      '**/coverage/**',
      '**/.turbo/**',
      'pnpm-lock.yaml',
      '.git/**',
      '**/*.config.{js,mjs,cjs}',
      'apps/api/prisma/migrations/**',
    ],
  },
  js.configs.recommended,
  ...tseslint.configs.recommendedTypeChecked,
  {
    languageOptions: {
      parserOptions: {
        projectService: true,
        tsconfigRootDir: import.meta.dirname,
      },
    },
    rules: {
      // User's binding global rule: ban every form of type assertion.
      // Forces honest types instead of cast-papering. Lives in CLAUDE.md.
      '@typescript-eslint/consistent-type-assertions': ['error', { assertionStyle: 'never' }],
    },
  },
  {
    // Apps must consume Zod schemas + inferred types from @olives/types.
    // packages/types is the single home for Zod schemas (user's global rule).
    // This excludes the test directory — specs can need raw zod for fixtures.
    files: ['apps/api/src/**/*.ts'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          paths: [
            {
              name: 'zod',
              message:
                'Import schemas + inferred types from @olives/types. New Zod schemas must be authored in packages/types and re-exported.',
            },
          ],
        },
      ],
    },
  },
  prettier,
);
