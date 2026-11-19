import { base } from '@rop/config/eslint';

export default [
  ...base, // typescript-eslint recommended + the RTL logical-property guard
  {
    // supabase/.temp is the CLI's scratch space.
    ignores: ['dist/**', 'node_modules/**', 'eslint.config.mjs', 'vitest.config.ts', 'supabase/.temp/**'],
  },
];
