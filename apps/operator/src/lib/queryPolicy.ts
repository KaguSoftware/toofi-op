// The QueryClient's retry policy: retry a transport failure once; never a business refusal.
import { isRetryableError } from '@rop/core';

export const QUERY_RETRY_LIMIT = 1;

export function queryRetry(failureCount: number, error: unknown): boolean {
  return failureCount < QUERY_RETRY_LIMIT && isRetryableError(error);
}

/** Mutations never retry by themselves: a repeat is only safe with the same idempotency key. */
export const MUTATION_RETRY = false;

export const STALE_TIME_MS = 10_000;

/** Only these query areas may be written to localStorage; analytics, staff, settings, till and audit never. */
const PERSISTED_AREAS: ReadonlySet<unknown> = new Set(['floor', 'tab', 'menu']);

export function shouldPersistQuery(query: { queryKey: readonly unknown[]; state: { status: string } }): boolean {
  return query.state.status === 'success' && PERSISTED_AREAS.has(query.queryKey[0]);
}
