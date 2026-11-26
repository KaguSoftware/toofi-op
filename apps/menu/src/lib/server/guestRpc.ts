import 'server-only';
import { withRequestTimeout } from '@rop/core';
import { guestSupabase } from './supabase';

/** The five functions granted to `anon` (packages/db/fixtures/rpc-public.json). Nothing else. */
export type GuestFunction = 'guest_menu' | 'open_table_session' | 'raise_waiter_call' | 'send_guest_order' | 'guest_status';

/** `code` is the database's upper-snake code; null when the database never answered. */
export type RpcAnswer = { ok: true; data: unknown } | { ok: false; code: string | null };

const CODE_RE = /^[A-Z][A-Z0-9_]*$/;
const TIMEOUT_MS = 8_000;

type Answer = { data: unknown; error: { message?: string; code?: string | null } | null };

/**
 * Call app.<fn>(args) as the anon role. Never throws. Logs the function name and the failure
 * only: the arguments hold the table token or the session id, which must never be logged.
 */
export async function guestRpc(fn: GuestFunction, args: Record<string, unknown> = {}): Promise<RpcAnswer> {
  try {
    const rpcClient = guestSupabase().schema('app') as unknown as {
      rpc: (f: string, a: Record<string, unknown>) => PromiseLike<Answer>;
    };
    const answer = await withRequestTimeout(TIMEOUT_MS, () => Promise.resolve(rpcClient.rpc(fn, args)), { what: fn });
    if (!answer.error) return { ok: true, data: answer.data };
    const message = answer.error.message ?? '';
    if (CODE_RE.test(message)) return { ok: false, code: message };
    console.error(`[guestRpc] ${fn} refused without a code (${answer.error.code ?? 'no sqlstate'})`);
    return { ok: false, code: null };
  } catch (e) {
    console.error(`[guestRpc] ${fn} failed: ${e instanceof Error ? e.name : 'unknown'}`);
    return { ok: false, code: null };
  }
}
