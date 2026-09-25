// Flat config for the whole monorepo. Prettier owns formatting, so eslint-config-prettier
// turns off every ESLint rule that would fight it.
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
  // The web app runs in the browser. The hooks rules catch the React mistakes that type checks
  // miss: missing effect dependencies, hooks called conditionally, state set during render.
  {
    files: ['apps/web/**/*.{ts,tsx}'],
    ...reactHooks.configs.flat.recommended,
    languageOptions: { globals: globals.browser },
  },
  prettier,
);
