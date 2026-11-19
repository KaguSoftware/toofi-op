// Electron main + preload: CommonJS output, Node globals, no React or DOM.
import js from '@eslint/js';
import tseslint from 'typescript-eslint';

export default tseslint.config(
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    name: '@rop/operator-shell',
    rules: {
      eqeqeq: ['error', 'always'],
      '@typescript-eslint/consistent-type-imports': 'error',
      '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_' }],
      // A swallowed error in the main process is invisible on a kiosk: an empty
      // catch must carry a comment saying why.
      'no-empty': ['error', { allowEmptyCatch: false }],
    },
  },
  {
    ignores: ['dist/**', 'release/**', '*.config.mjs', '*.config.cjs', 'scripts/**'],
  },
);
