import { createClient } from '@supabase/supabase-js';
import type { Database } from '@rop/db';

const LOCAL_URL = 'http://127.0.0.1:55421';

/** A production build must not guess a backend; dev falls back to the local stack. */
export function resolveSupabaseEnv(env: {
  VITE_SUPABASE_URL?: string;
  VITE_SUPABASE_ANON_KEY?: string;
  DEV?: boolean;
}): { url: string; anonKey: string } {
  const url = env.VITE_SUPABASE_URL?.trim();
  const anonKey = env.VITE_SUPABASE_ANON_KEY?.trim();
  if (url && anonKey) return { url, anonKey };
  if (env.DEV) return { url: url || LOCAL_URL, anonKey: anonKey || 'missing-anon-key' };
  const missing = [!url && 'VITE_SUPABASE_URL', !anonKey && 'VITE_SUPABASE_ANON_KEY']
    .filter(Boolean)
    .join(' and ');
  throw new Error(`Operator build is missing ${missing}. Set it at build time.`);
}

const resolved = resolveSupabaseEnv(import.meta.env);

export const supabase = createClient<Database>(resolved.url, resolved.anonKey);
