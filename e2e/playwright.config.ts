import path from 'node:path';
import { defineConfig, devices } from '@playwright/test';

/**
 * Operator e2e: drives the real Vite SPA against the LOCAL Supabase stack
 * (ports in packages/db/supabase/config.toml). The dev server is started with
 * env overrides, so a stray apps/operator/.env.local can never point it at a hosted project.
 * Every spec resets the database first (support/db.ts), so specs run serially.
 */
const ROOT = path.resolve(__dirname, '..');

// The CLI's long-standing local demo anon key (local only, not a secret).
const LOCAL_ANON_KEY =
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6ImFub24iLCJleHAiOjE5ODM4MTI5OTZ9.CRXP1A7WOeoJeXxjNni43kdQwgnWNReilDMblYTn_I0';
export const SUPABASE_URL = process.env.SUPABASE_URL ?? 'http://127.0.0.1:55421';
export const OPERATOR_URL = 'http://localhost:5174';

export default defineConfig({
  testDir: './tests',
  fullyParallel: false,
  workers: 1,
  retries: 0,
  timeout: 60_000,
  expect: { timeout: 8_000 },
  reporter: [['list']],
  use: { baseURL: OPERATOR_URL, trace: 'retain-on-failure', screenshot: 'only-on-failure', viewport: { width: 1280, height: 800 } },
  projects: [
    {
      name: 'en',
      testIgnore: /\.ar\.spec\.ts/,
      use: { ...devices['Desktop Chrome'], viewport: { width: 1280, height: 800 }, locale: 'en-US' },
    },
    {
      name: 'ar',
      testMatch: [/\.ar\.spec\.ts/, /screenshots\.spec\.ts/],
      use: { ...devices['Desktop Chrome'], viewport: { width: 1280, height: 800 }, locale: 'ar-IQ' },
    },
  ],
  webServer: {
    command: 'pnpm --filter @rop/operator dev',
    url: OPERATOR_URL,
    cwd: ROOT,
    reuseExistingServer: !!process.env.E2E_REUSE_SERVER,
    timeout: 60_000,
    env: { VITE_SUPABASE_URL: SUPABASE_URL, VITE_SUPABASE_ANON_KEY: LOCAL_ANON_KEY },
  },
});
