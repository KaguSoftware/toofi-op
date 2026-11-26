import { describe, expect, it } from 'vitest';
import { parseBinding, sessionIdOf, withoutSecrets } from './sessionLogic';

const SID = '6f1c2a8e-3b4d-4e5f-8a9b-0c1d2e3f4a5b';

describe('sessionIdOf', () => {
  it('takes a uuid session id and nothing else', () => {
    expect(sessionIdOf({ session_id: SID, table_label: 'T5' })).toBe(SID);
    expect(sessionIdOf({ session_id: 'x' })).toBeNull();
    expect(sessionIdOf(null)).toBeNull();
  });
});

describe('parseBinding', () => {
  it('reads the label and the switches', () => {
    expect(parseBinding({ table_label: 'T5', day_open: true, calls_enabled: true, orders_enabled: false, call: null, orders: [] })).toEqual({
      tableLabel: 'T5',
      dayOpen: true,
      callsEnabled: true,
      ordersEnabled: false,
    });
    expect(parseBinding({})).toBeNull();
  });
});

describe('withoutSecrets', () => {
  it('drops session ids and tokens at any depth', () => {
    const out = withoutSecrets({ a: 1, session_id: SID, orders: [{ id: 'o', guest_session_id: SID }], link: { token: 't' } });
    expect(out).toEqual({ a: 1, orders: [{ id: 'o' }], link: {} });
  });
});
