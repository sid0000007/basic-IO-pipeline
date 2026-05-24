import { defineConfig, globalIgnores } from 'eslint/config';
import nextVitals from 'eslint-config-next/core-web-vitals';
import nextTs from 'eslint-config-next/typescript';

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  {
    rules: {
      // Mirror the root project rule banning every type-assertion form.
      // Source: ~/.claude/CLAUDE.md "do not every use any casting".
      '@typescript-eslint/consistent-type-assertions': ['error', { assertionStyle: 'never' }],
      // Web must consume Zod schemas + inferred types from @olives/types.
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
  globalIgnores(['.next/**', 'out/**', 'build/**', 'next-env.d.ts']),
]);

export default eslintConfig;
