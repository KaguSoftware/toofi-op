/**
 * Database error codes, turned into results the guest UI can act on, and into diner wording.
 *
 *   expired     the table session is gone (or there never was one): ask for a scan
 *   closed      no open business day: service is closed
 *   off         calls or ordering are switched off
 *   too-soon    a waiter was called under two minutes ago
 *   limit       too many pending orders, lines, of one dish, or attempts
 *   stale-menu  a dish or option changed since the menu loaded: refresh and mark the line
 *   error       anything else, including a failed connection to the database
 */
import { errorMessageKey, type ErrorCode, type ErrorOverrides, type MessageKey } from '@rop/i18n';

export const GUEST_RESULTS = ['expired', 'closed', 'off', 'too-soon', 'limit', 'stale-menu', 'error'] as const;
export type GuestResult = (typeof GUEST_RESULTS)[number];

const RESULT_BY_CODE: Readonly<Partial<Record<ErrorCode, GuestResult>>> = {
  SESSION_EXPIRED: 'expired',
  TABLE_LINK_INVALID: 'expired',
  DAY_NOT_OPEN: 'closed',
  GUEST_CALLS_OFF: 'off',
  GUEST_ORDERS_OFF: 'off',
  CALL_TOO_SOON: 'too-soon',
  TOO_MANY_PENDING_ORDERS: 'limit',
  TOO_MANY_ITEMS: 'limit',
  INVALID_QTY: 'limit',
  ITEMS_REQUIRED: 'limit',
  TOO_MANY_REQUESTS: 'limit',
  ITEM_NOT_AVAILABLE: 'stale-menu',
  MODIFIER_NOT_ALLOWED: 'stale-menu',
  MODIFIER_SELECTION_INVALID: 'stale-menu',
  INVALID_PRICE: 'stale-menu',
};

/** The codes the guest site maps to a result: the ones whose wording the screen carries. */
export const GUEST_CODES = Object.keys(RESULT_BY_CODE);

/** The result for a code; an unknown code or none at all is `error`. */
export function guestResultOf(code: string | null | undefined): GuestResult {
  if (!code) return 'error';
  return (RESULT_BY_CODE as Record<string, GuestResult | undefined>)[code] ?? 'error';
}

/** The HTTP status a route answers a refusal with. */
export function httpStatusOf(result: GuestResult, code: string | null | undefined): number {
  if (code === 'TOO_MANY_REQUESTS') return 429;
  switch (result) {
    case 'expired':
      return 401;
    case 'error':
      return code ? 400 : 502;
    default:
      return 409;
  }
}

/**
 * Diner wording for the codes whose catalogue line was written for staff (spec.md, "Reused
 * codes with staff wording"). A guest never reads about managers, menu setup or app updates.
 */
export const GUEST_ERROR_OVERRIDES: ErrorOverrides = {
  DAY_NOT_OPEN: 'guest.errors.closed',
  INVALID_QTY: 'guest.errors.tooManyOfOne',
  ITEM_NOT_AVAILABLE: 'guest.errors.itemNotAvailable',
  MODIFIER_NOT_ALLOWED: 'guest.errors.optionNotAvailable',
  MODIFIER_SELECTION_INVALID: 'guest.errors.chooseOptions',
  INVALID_PRICE: 'guest.errors.itemNotAvailable',
  IDEMPOTENCY_KEY_REQUIRED: 'guest.errors.generic',
  INVALID_ARGUMENT: 'guest.errors.generic',
};

/** The catalog key for what a guest reads when a call or an order is refused. */
export function guestErrorMessageKey(code: string | null | undefined): MessageKey {
  if (!code) return 'guest.errors.generic';
  const key = errorMessageKey({ code }, { overrides: GUEST_ERROR_OVERRIDES });
  return key === 'errors.generic' ? 'guest.errors.generic' : key;
}
