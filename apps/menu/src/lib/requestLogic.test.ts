import { describe, expect, it } from 'vitest';
import { idemKey } from '@rop/core';
import { parseCallBody, parseLocaleBody, parseOrderBody } from './requestLogic';

const key = idemKey('G-ABCD1234', 'send_guest_order');
const line = { menu_item_id: '6f1c2a8e-3b4d-4e5f-8a9b-0c1d2e3f4a5b', qty: 2, modifier_ids: [], note: null };

describe('parseCallBody', () => {
  it('accepts a known reason with a well-formed key', () => {
    expect(parseCallBody({ reason: 'bill', key })).toEqual({ reason: 'bill', key });
  });

  it('refuses an unknown reason, a missing or malformed key, or a non-object', () => {
    expect(parseCallBody({ reason: 'dance', key })).toBeNull();
    expect(parseCallBody({ reason: 'bill' })).toBeNull();
    expect(parseCallBody({ reason: 'bill', key: 'abc' })).toBeNull();
    expect(parseCallBody(null)).toBeNull();
    expect(parseCallBody([])).toBeNull();
  });
});

describe('parseOrderBody', () => {
  it('keeps ids, quantities, modifier ids and the note', () => {
    const body = { key, items: [{ ...line, modifier_ids: ['m1'], note: 'no onions' }] };
    expect(parseOrderBody(body)).toEqual(body);
  });

  it('drops any price the client sends', () => {
    const parsed = parseOrderBody({ key, items: [{ ...line, price: 1, unit_price: 1, line_total: 1 }], total: 1 });
    expect(parsed).toEqual({ key, items: [line] });
    expect(JSON.stringify(parsed)).not.toContain('price');
    expect(JSON.stringify(parsed)).not.toContain('total');
  });

  it('defaults a missing modifier list and note', () => {
    expect(parseOrderBody({ key, items: [{ menu_item_id: 'x', qty: 1 }] })?.items[0]).toEqual({ menu_item_id: 'x', qty: 1, modifier_ids: [], note: null });
  });

  it('passes value problems to the database (empty order, qty 0, 41 lines) so its codes reach the guest', () => {
    expect(parseOrderBody({ key, items: [] })).not.toBeNull();
    expect(parseOrderBody({ key, items: [{ ...line, qty: 0 }] })).not.toBeNull();
    expect(parseOrderBody({ key, items: Array.from({ length: 41 }, () => line) })).not.toBeNull();
  });

  it('refuses a malformed shape', () => {
    expect(parseOrderBody({ key, items: 'x' })).toBeNull();
    expect(parseOrderBody({ items: [line] })).toBeNull();
    expect(parseOrderBody({ key, items: [{ ...line, qty: '2' }] })).toBeNull();
    expect(parseOrderBody({ key, items: [{ ...line, modifier_ids: [1] }] })).toBeNull();
    expect(parseOrderBody({ key, items: [{ ...line, note: 5 }] })).toBeNull();
    expect(parseOrderBody({ key, items: Array.from({ length: 101 }, () => line) })).toBeNull();
  });
});

describe('parseLocaleBody', () => {
  it('accepts en and ar only', () => {
    expect(parseLocaleBody({ locale: 'en' })).toEqual({ locale: 'en' });
    expect(parseLocaleBody({ locale: 'fr' })).toBeNull();
  });
});
