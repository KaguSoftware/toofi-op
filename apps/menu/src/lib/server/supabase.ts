import 'server-only';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';

/**
 * The guest site's one Supabase client: server-side, anon key, schema `app`. The URL and key
 * are server-only env names (no NEXT_PUBLIC_), so neither reaches the browser bundle. No
 * auth session: a guest is identified by the table session id, not by Supabase sign-in.
 */
export function serverEnv(): { url: string; anonKey: string } {
  const url = process.env.SUPABASE_URL;
  const anonKey = process.env.SUPABASE_ANON_KEY;
  if (!url || !anonKey) throw new Error('SUPABASE_URL and SUPABASE_ANON_KEY must be set for the guest site');
  return { url, anonKey };
}

let client: SupabaseClient | null = null;

export function guestSupabase(): SupabaseClient {
  if (!client) {
    const { url, anonKey } = serverEnv();
    client = createClient(url, anonKey, {
      auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
    });
  }
  return client;
}
