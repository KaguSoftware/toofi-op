import { describe, expect, it } from 'vitest';
import { t, ERROR_CODE_KEYS } from '@rop/i18n';
import { GUEST_ERROR_OVERRIDES, guestErrorMessageKey, guestResultOf, httpStatusOf } from './guestErrorLogic';

describe('guestResultOf', () => {
  it.each([
    ['SESSION_EXPIRED', 'expired'],
    ['TABLE_LINK_INVALID', 'expired'],
    ['DAY_NOT_OPEN', 'closed'],
    ['GUEST_CALLS_OFF', 'off'],
    ['GUEST_ORDERS_OFF', 'off'],
    ['CALL_TOO_SOON', 'too-soon'],
    ['TOO_MANY_PENDING_ORDERS', 'limit'],
    ['TOO_MANY_ITEMS', 'limit'],
    ['INVALID_QTY', 'limit'],
    ['ITEMS_REQUIRED', 'limit'],
    ['TOO_MANY_REQUESTS', 'limit'],
    ['ITEM_NOT_AVAILABLE', 'stale-menu'],
    ['MODIFIER_NOT_ALLOWED', 'stale-menu'],
    ['MODIFIER_SELECTION_INVALID', 'stale-menu'],
    ['INVALID_PRICE', 'stale-menu'],
    ['IDEMPOTENCY_KEY_REQUIRED', 'error'],
    ['INVALID_ARGUMENT', 'error'],
    ['FORBIDDEN', 'error'],
    ['NOT_A_CODE', 'error'],
    [null, 'error'],
  ] as const)('%s → %s', (code, result) => {
    expect(guestResultOf(code)).toBe(result);
  });
});

describe('httpStatusOf', () => {
  it('answers 401 for an expired session, 429 for rate limits, 409 for refusals', () => {
    expect(httpStatusOf('expired', 'SESSION_EXPIRED')).toBe(401);
    expect(httpStatusOf('limit', 'TOO_MANY_REQUESTS')).toBe(429);
    expect(httpStatusOf('limit', 'TOO_MANY_PENDING_ORDERS')).toBe(409);
    expect(httpStatusOf('closed', 'DAY_NOT_OPEN')).toBe(409);
  });

  it('answers 400 for a refused request and 502 when the database never answered', () => {
    expect(httpStatusOf('error', 'INVALID_ARGUMENT')).toBe(400);
    expect(httpStatusOf('error', null)).toBe(502);
  });
});

describe('guest wording', () => {
  const staffWords = /manager|menu setup|update the app|مدير|إعداد القائمة|حدّث التطبيق/i;

  it('never shows a diner the staff wording of a reused code', () => {
    for (const code of Object.keys(GUEST_ERROR_OVERRIDES)) {
      for (const locale of ['en', 'ar'] as const) {
        expect(t(locale, guestErrorMessageKey(code)), `${code} ${locale}`).not.toMatch(staffWords);
      }
    }
  });

  it('keeps the catalogue line for the guest codes, which were written for diners', () => {
    expect(guestErrorMessageKey('SESSION_EXPIRED')).toBe('errors.codes.SESSION_EXPIRED');
    expect(guestErrorMessageKey('CALL_TOO_SOON')).toBe('errors.codes.CALL_TOO_SOON');
  });

  it('falls back to the guest generic line', () => {
    expect(guestErrorMessageKey(null)).toBe('guest.errors.generic');
    expect(guestErrorMessageKey('NOT_A_CODE')).toBe('guest.errors.generic');
  });

  it('has a real line in both languages for every override', () => {
    for (const key of Object.values(GUEST_ERROR_OVERRIDES)) {
      expect(t('en', key!)).not.toBe(key);
      expect(t('ar', key!)).not.toBe(t('en', key!));
    }
  });

  it('covers every code a guest function raises', () => {
    for (const code of ['SESSION_EXPIRED', 'GUEST_CALLS_OFF', 'GUEST_ORDERS_OFF', 'CALL_TOO_SOON', 'TOO_MANY_ITEMS', 'TOO_MANY_PENDING_ORDERS']) {
      expect(code in ERROR_CODE_KEYS).toBe(true);
    }
  });
});
