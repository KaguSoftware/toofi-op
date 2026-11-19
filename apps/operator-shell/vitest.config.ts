import { readFileSync } from 'node:fs';
import { defineConfig } from 'vitest/config';

const brand = JSON.parse(readFileSync(new URL('../../brand.config.json', import.meta.url), 'utf8'));

export default defineConfig({
  define: {
    __BRAND__: JSON.stringify(brand),
    __SUPABASE_URL__: JSON.stringify(''),
  },
  test: {
    include: ['src/**/*.test.ts'],
    environment: 'node',
    restoreMocks: true,
  },
});
