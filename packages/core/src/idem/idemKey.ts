/**
 * Idempotency keys: "{station}:{type}:{ulid}" (CLAUDE.md backend rule 5).
 *
 * Every write that creates a row or moves money sends one as `p_idempotency_key`; the
 * server claims it with `app.claim_replay`, so a retry returns the first result instead
 * of doing the work twice. Make a fresh key per user action and reuse it for that
 * action's retries.
 */
import { ulid } from 'ulid';

/** A station id: upper-case letters, digits and dashes (e.g. TILL-01). */
const STATION_RE = /^[A-Z0-9][A-Z0-9-]{0,31}$/;
/** A mutation type: the snake_case name of the RPC or action (e.g. settle_tab). */
const TYPE_RE = /^[a-z][a-z0-9_]{0,63}$/;

export const IDEM_KEY_RE = /^[A-Z0-9][A-Z0-9-]{0,31}:[a-z][a-z0-9_]{0,63}:[0-9A-HJKMNP-TV-Z]{26}$/;

/** Build "{station}:{type}:{ulid}" with a fresh ULID. */
export function idemKey(station: string, type: string): string {
  if (!STATION_RE.test(station)) {
    throw new RangeError(`station must match ${STATION_RE}, got '${station}'`);
  }
  if (!TYPE_RE.test(type)) {
    throw new RangeError(`type must match ${TYPE_RE}, got '${type}'`);
  }
  return `${station}:${type}:${ulid()}`;
}
