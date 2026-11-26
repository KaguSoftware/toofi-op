import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vitest/config';

// *.test.ts runs under node (logic and route handlers); *.test.tsx under jsdom (components).
// tsconfig says jsx: preserve (Next compiles JSX), so esbuild is told to emit it here.
export default defineConfig({
  esbuild: { jsx: 'automatic' },
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
      // `server-only` throws outside a React Server bundle; tests import server modules directly.
      'server-only': fileURLToPath(new URL('./src/test/server-only.ts', import.meta.url)),
    },
  },
  test: {
    include: ['src/**/*.test.{ts,tsx}', 'app/**/*.test.{ts,tsx}'],
    environment: 'node',
    environmentMatchGlobs: [['**/*.test.tsx', 'jsdom']],
    restoreMocks: true,
  },
});
