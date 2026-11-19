/**
 * True when a failed write may still have been committed: timeout, network error, 5xx,
 * anything that is not a clean server refusal (a raised error code).
 */
export function isUnclearFailure(err: unknown): boolean {
  const o = (typeof err === 'object' && err !== null ? err : {}) as { name?: unknown; code?: unknown };
  const refused = o.name === 'AppRpcError' && typeof o.code === 'string' && o.code !== 'UNKNOWN';
  return !refused;
}
