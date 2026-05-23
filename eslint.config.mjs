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
  prettier,
);
