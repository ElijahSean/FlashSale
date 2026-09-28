// Lint rules for the whole repo. Prettier handles formatting, so those ESLint rules are off.
import js from '@eslint/js';
import tseslint from 'typescript-eslint';
import prettier from 'eslint-config-prettier';
import globals from 'globals';
import reactHooks from 'eslint-plugin-react-hooks';

export default tseslint.config(
  { ignores: ['**/node_modules/**', '**/dist/**', '**/coverage/**', '**/src/generated/**'] },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    ignores: ['apps/web/**'],
    languageOptions: { globals: { ...globals.node, ...globals.jest } },
  },
  // Web app: browser globals, plus React hooks rules that catch mistakes types don't.
  {
    files: ['apps/web/**/*.{ts,tsx}'],
    ...reactHooks.configs.flat.recommended,
    languageOptions: { globals: globals.browser },
  },
  // k6 scripts: k6 provides __ENV.
  {
    files: ['stress/**/*.js'],
    languageOptions: { globals: { __ENV: 'readonly' } },
  },
  prettier,
);
