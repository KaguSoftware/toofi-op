import { defineConfig } from 'vitest/config';

// *.test.ts runs under node (pure logic); *.test.tsx under jsdom (components).
export default defineConfig({
  test: {
    include: ['src/**/*.test.{ts,tsx}'],
    environment: 'node',
    environmentMatchGlobs: [['src/**/*.test.tsx', 'jsdom']],
    setupFiles: ['./vitest.setup.ts'],
    restoreMocks: true,
  },
});
