/**
 * Vitest globalSetup: right after `supabase start` the containers answer before
 * every service is ready, so the first suite run used to fail while PostgREST,
 * GoTrue or the edge runtime were still booting. Wait (up to 120 s) until
 *   - REST answers 200 on /rest/v1/,
 *   - auth answers 200 on /auth/v1/health,
 *   - /functions/v1/staff-admin answers anything but 404 or a 5xx (the function is served).
 * Stack down: with ROP_REQUIRE_STACK=1 that is a failure; otherwise the suites
 * skip themselves (stackAvailable() prints the SKIPPED line).
 */
import 'dotenv/config';
import { ANON_KEY, SUPABASE_URL } from './helpers';

const TIMEOUT_MS = 120_000;

async function status(url: string, init: RequestInit = {}): Promise<number | string> {
  try {
    const res = await fetch(url, { ...init, signal: AbortSignal.timeout(5_000) });
    await res.body?.cancel();
    return res.status;
  } catch (e) {
    return e instanceof Error ? e.message : String(e);
  }
}

const probes: { name: string; ready: () => Promise<[boolean, number | string]> }[] = [
  {
    name: 'rest',
    ready: async () => {
      const s = await status(`${SUPABASE_URL}/rest/v1/`, { headers: { apikey: ANON_KEY } });
      return [s === 200, s];
    },
  },
  {
    name: 'auth',
    ready: async () => {
      const s = await status(`${SUPABASE_URL}/auth/v1/health`, { headers: { apikey: ANON_KEY } });
      return [s === 200, s];
    },
  },
  {
    name: 'functions/staff-admin',
    ready: async () => {
      const s = await status(`${SUPABASE_URL}/functions/v1/staff-admin`, {
        method: 'POST',
        headers: { apikey: ANON_KEY, Authorization: `Bearer ${ANON_KEY}`, 'Content-Type': 'application/json' },
        body: '{}',
      });
      return [typeof s === 'number' && s !== 404 && s < 500, s];
    },
  },
];

export default async function setup(): Promise<void> {
  const required = process.env.ROP_REQUIRE_STACK === '1';
  // Nothing listening at all and not required: let the suites skip without waiting.
  if (!required && typeof (await status(`${SUPABASE_URL}/auth/v1/health`)) === 'string') return;

  const deadline = Date.now() + TIMEOUT_MS;
  let last: string[] = [];
  for (;;) {
    const results = await Promise.all(probes.map(async (p) => ({ name: p.name, r: await p.ready() })));
    if (results.every((x) => x.r[0])) return;
    last = results.filter((x) => !x.r[0]).map((x) => `${x.name}: ${String(x.r[1])}`);
    if (Date.now() > deadline) break;
    await new Promise((r) => setTimeout(r, 1_000));
  }
  const message = `local Supabase stack at ${SUPABASE_URL} not ready after ${TIMEOUT_MS / 1000}s (${last.join('; ')})`;
  if (required) throw new Error(`ROP_REQUIRE_STACK=1 but the ${message}`);
  console.warn(`database tests may fail: ${message}`);
}
