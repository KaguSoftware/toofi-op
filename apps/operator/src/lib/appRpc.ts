// Every write and every app.* read goes through appRpc(). Functions live in schema
// `app`; a raised `raise exception 'CODE'` arrives as error.message === 'CODE'.
import type { Database } from '@rop/db';
import { DEFAULT_REQUEST_TIMEOUT_MS, withRequestTimeout } from '@rop/core';
import { supabase } from './supabase';

export type AppFunctionName = keyof Database['app']['Functions'] & string;

export class AppRpcError extends Error {
  /** Upper-snake server code ('TAB_NOT_OPEN', ...) or 'UNKNOWN'. */
  readonly code: string;
  /** PostgREST's code: the SQLSTATE ('P0001' for a raised code). */
  readonly sqlState?: string;
  constructor(code: string, message: string, sqlState?: string) {
    super(message);
    this.name = 'AppRpcError';
    this.code = code;
    this.sqlState = sqlState;
  }
}

const CODE_RE = /^[A-Z][A-Z0-9_]*$/;

export function toAppRpcError(error: { message?: string; code?: string | null }): AppRpcError {
  const message = error.message ?? 'unknown error';
  return new AppRpcError(CODE_RE.test(message) ? message : 'UNKNOWN', message, error.code || undefined);
}

type Answer = { data: unknown; error: { message?: string; code?: string | null } | null };

/**
 * Call app.<fn>(args) with a 15 s deadline. Resolves to the function's result,
 * rejects with AppRpcError (server refusal) or RequestTimeoutError / a transport error.
 */
export async function appRpc<T = unknown>(
  fn: AppFunctionName,
  args: Record<string, unknown> = {},
  opts: { timeoutMs?: number | null } = {},
): Promise<T> {
  const timeout = opts.timeoutMs === undefined ? DEFAULT_REQUEST_TIMEOUT_MS : opts.timeoutMs;
  // Loose cast: generated arg unions fight optional parameters; SQL is the source of truth.
  // Keep the call on the schema client: a detached rpc method loses its this and throws in the browser.
  const client = supabase.schema('app') as unknown as {
    rpc: (f: string, a: Record<string, unknown>) => PromiseLike<Answer>;
  };
  const answer = await withRequestTimeout(timeout, () => Promise.resolve(client.rpc(fn, args)), { what: fn });
  if (answer.error) throw toAppRpcError(answer.error);
  return answer.data as T;
}
