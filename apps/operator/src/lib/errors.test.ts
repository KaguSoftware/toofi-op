import { describe, expect, it } from 'vitest';
import { RequestTimeoutError } from '@rop/core';
import { ERROR_CODE_KEYS } from '@rop/i18n';
import { AppRpcError, toAppRpcError } from './appRpc';
import { errorMessage } from './errors';

describe('errorMessage', () => {
  it('translates a known server code in English and Arabic', () => {
    const e = new AppRpcError('FORBIDDEN', 'FORBIDDEN');
    expect(errorMessage(e, 'en')).toBe(ERROR_CODE_KEYS.FORBIDDEN.en);
    expect(errorMessage(e, 'ar')).toBe(ERROR_CODE_KEYS.FORBIDDEN.ar);
  });
  it('reads a code returned as data', () => {
    expect(errorMessage({ code: 'PIN_INVALID' }, 'en')).toBe('Wrong PIN.');
  });
  it('shows a timeout as a connection problem', () => {
    expect(errorMessage(new RequestTimeoutError(15000, 'x'), 'en')).toMatch(/connection/i);
  });
  it('falls back to the generic line', () => {
    expect(errorMessage(new AppRpcError('UNKNOWN', 'boom'), 'en')).toBe('Something went wrong. Try again.');
  });
});

describe('toAppRpcError', () => {
  it('takes an upper-snake message as the code', () => {
    expect(toAppRpcError({ message: 'TAB_NOT_OPEN', code: 'P0001' }).code).toBe('TAB_NOT_OPEN');
  });
  it('maps anything else to UNKNOWN', () => {
    expect(toAppRpcError({ message: 'permission denied for table' }).code).toBe('UNKNOWN');
  });
});
