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
    },
  },
  globalIgnores(['.next/**', 'out/**', 'build/**', 'next-env.d.ts']),
]);

export default eslintConfig;
