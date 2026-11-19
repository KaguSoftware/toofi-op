/** The one error catalogue and its resolver (packages/i18n/src/errors.ts). */
import { describe, expect, it } from 'vitest';
import {
  ERROR_CODE_KEYS,
  SQLSTATE_KEYS,
  errorCode,
  errorMessageKey,
  isErrorCode,
  sqlStateMessageKey,
  type ErrorCode,
} from '../errors';
import { t, type MessageKey } from '../t';

/** PostgREST's error object for a `raise exception 'CODE'`. */
const pg = (message: string, code = 'P0001') => ({ message, code, details: null, hint: null });

describe('rule 1: an exact code', () => {
  it('reads the code from a PostgREST message, as the SQL raised it', () => {
    expect(errorMessageKey(pg('FORBIDDEN'))).toBe('errors.codes.FORBIDDEN');
    expect(errorMessageKey(pg('  PIN_WEAK  '))).toBe('errors.codes.PIN_WEAK');
  });

  it('reads the code from `code`', () => {
    expect(errorMessageKey({ code: 'PIN_LOCKED', message: 'locked out' })).toBe(
      'errors.codes.PIN_LOCKED',
    );
  });

  it('takes a bare message string', () => {
    expect(errorCode('PIN_INVALID')).toBe('PIN_INVALID');
  });

  it('a business code beats its SQLSTATE', () => {
    expect(errorMessageKey(pg('IDEMPOTENCY_CONFLICT', '40001'))).toBe(
      'errors.codes.IDEMPOTENCY_CONFLICT',
    );
  });
});

describe('rule 2: a code inside a longer message', () => {
  it('finds a whole code word that a wrapper put text around', () => {
    expect(errorCode('error: APPEND_ONLY (payments)')).toBe('APPEND_ONLY');
  });

  it('the longest known code word wins, whatever the order', () => {
    expect(errorCode('PIN_FORMAT then IDEMPOTENCY_KEY_REQUIRED')).toBe('IDEMPOTENCY_KEY_REQUIRED');
  });

  it('never finds a code inside a longer word', () => {
    expect(errorCode('FORBIDDEN_FRUIT happened')).toBeNull();
    expect(errorCode('XFORBIDDEN')).toBeNull();
    expect(errorCode('Something went wrong')).toBeNull();
  });
});

describe('rule 3: a native Postgres error by its SQLSTATE', () => {
  it('maps the common native errors', () => {
    expect(errorMessageKey(pg('duplicate key value violates unique constraint "x"', '23505'))).toBe(
      'errors.duplicate',
    );
    expect(errorMessageKey(pg('new row violates check constraint "x"', '23514'))).toBe(
      'errors.invalidValue',
    );
    expect(errorMessageKey(pg('invalid input syntax for type uuid: "abc"', '22P02'))).toBe(
      'errors.invalidInput',
    );
    expect(errorMessageKey(pg('permission denied for table payments', '42501'))).toBe(
      'errors.forbidden',
    );
    expect(errorMessageKey(pg('deadlock detected', '40P01'))).toBe('errors.busy');
  });

  it('reads `sqlState`', () => {
    expect(sqlStateMessageKey({ code: 'UNKNOWN', sqlState: '23505' })).toBe('errors.duplicate');
    expect(sqlStateMessageKey({ code: 'P0001' })).toBeNull();
  });
});

describe('rule 4: the fallback', () => {
  it('an unknown code, or nothing at all, is the generic line', () => {
    expect(errorMessageKey(pg('SOME_FUTURE_CODE'))).toBe('errors.generic');
    expect(errorMessageKey(new Error('boom'))).toBe('errors.generic');
    expect(errorMessageKey(null)).toBe('errors.generic');
    expect(errorMessageKey(42)).toBe('errors.generic');
  });

  it('a transport failure is the network line only when the caller says so', () => {
    const offline = new TypeError('Failed to fetch');
    expect(errorMessageKey(offline)).toBe('errors.generic');
    expect(errorMessageKey(offline, { isTransport: (e) => e instanceof TypeError })).toBe(
      'errors.network',
    );
    expect(errorMessageKey(pg('FORBIDDEN'), { isTransport: () => true })).toBe(
      'errors.codes.FORBIDDEN',
    );
  });
});

describe('overrides', () => {
  it('a screen’s own words for a code beat the catalogue, for that code only', () => {
    const overrides = { PIN_INVALID: 'common.retry' } as const;
    expect(errorMessageKey(pg('PIN_INVALID'), { overrides })).toBe('common.retry');
    expect(errorMessageKey(pg('PIN_LOCKED'), { overrides })).toBe('errors.codes.PIN_LOCKED');
  });
});

describe('the catalogue', () => {
  const codes = Object.keys(ERROR_CODE_KEYS) as ErrorCode[];

  it('every code has English and Arabic, and the Arabic is Arabic', () => {
    for (const code of codes) {
      const key = errorMessageKey(code);
      expect(t('en', key), code).not.toBe(key);
      expect(t('en', key), code).toBe(ERROR_CODE_KEYS[code].en);
      expect(t('ar', key), code).toBe(ERROR_CODE_KEYS[code].ar);
      expect(t('ar', key), code).not.toBe(t('en', key));
      expect(t('ar', key), code).toMatch(/[؀-ۿ]/);
    }
    for (const key of Object.values(SQLSTATE_KEYS) as MessageKey[]) {
      expect(t('ar', key), key).toMatch(/[؀-ۿ]/);
    }
  });

  it('every code is upper snake case, and no SQLSTATE is also a code', () => {
    for (const code of codes) expect(code).toMatch(/^[A-Z][A-Z0-9_]+$/);
    for (const state of Object.keys(SQLSTATE_KEYS)) expect(isErrorCode(state)).toBe(false);
  });

  it('no line uses an em dash', () => {
    for (const code of codes) {
      expect(ERROR_CODE_KEYS[code].en, code).not.toContain('—');
      expect(ERROR_CODE_KEYS[code].ar, code).not.toContain('—');
    }
  });
});
