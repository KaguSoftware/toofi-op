import 'dotenv/config'; // packages/db/.env, if present (SUPABASE_URL, keys, DB_URL)
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['tests/**/*.test.ts'],
    // Waits until REST, auth and the staff-admin edge function answer (a fresh `supabase start` is still booting).
    globalSetup: ['tests/global-setup.ts'],
    testTimeout: 60_000,
    hookTimeout: 120_000,
    // One file at a time: every suite shares one database.
    pool: 'forks',
    poolOptions: { forks: { singleFork: true } },
  },
});
