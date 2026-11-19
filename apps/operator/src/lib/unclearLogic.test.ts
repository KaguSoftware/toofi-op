import { describe, expect, it } from 'vitest';
import { isUnclearFailure } from './unclearLogic';

describe('isUnclearFailure', () => {
  it('treats timeouts, network errors and unknown server errors as unclear, clean refusals as definite', () => {
    expect(isUnclearFailure(new Error('network'))).toBe(true);
    expect(isUnclearFailure({ name: 'RequestTimeoutError' })).toBe(true);
    expect(isUnclearFailure({ name: 'AppRpcError', code: 'UNKNOWN' })).toBe(true);
    expect(isUnclearFailure({ name: 'AppRpcError', code: 'TAB_NOT_OPEN' })).toBe(false);
  });
});
