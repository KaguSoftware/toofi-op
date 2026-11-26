import { describe, expect, it } from 'vitest';
import { QK } from './queryKeys';
import { shouldPersistQuery } from './queryPolicy';

const q = (queryKey: readonly unknown[], status = 'success') => ({ queryKey, state: { status } });

describe('shouldPersistQuery', () => {
  it('persists floor, tab and menu data only', () => {
    expect(shouldPersistQuery(q(QK.floorStatus()))).toBe(true);
    expect(shouldPersistQuery(q(QK.tabLines('t1')))).toBe(true);
    expect(shouldPersistQuery(q(QK.tabMenu()))).toBe(true);
    expect(shouldPersistQuery(q(['menu', 'items']))).toBe(true);
  });
  it('never persists till, manage (analytics, staff, settings, audit) or stock', () => {
    expect(shouldPersistQuery(q(QK.tillBill('t1')))).toBe(false);
    expect(shouldPersistQuery(q(QK.tillSettings()))).toBe(false);
    expect(shouldPersistQuery(q(QK.manage('analytics')))).toBe(false);
    expect(shouldPersistQuery(q(QK.manage('staff')))).toBe(false);
    expect(shouldPersistQuery(q(QK.manage('qr-tokens')))).toBe(false); // table link tokens never reach localStorage
    expect(shouldPersistQuery(q(QK.stock('on-hand')))).toBe(false);
  });
  it('skips queries that did not succeed', () => {
    expect(shouldPersistQuery(q(QK.floorStatus(), 'error'))).toBe(false);
  });
});
