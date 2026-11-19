import { describe, expect, it } from 'vitest';
import { INITIAL_SPLIT, loadSplit, markLinesPaid, pruneSplit, saveSplit, selectableLines } from './splitLogic';

function memory() {
  const m = new Map<string, string>();
  return {
    getItem: (k: string) => m.get(k) ?? null,
    setItem: (k: string, v: string) => void m.set(k, v),
    removeItem: (k: string) => void m.delete(k),
    size: () => m.size,
  };
}

describe('split memory', () => {
  it('marks lines paid once and stops them being selectable again', () => {
    const s = markLinesPaid(markLinesPaid(INITIAL_SPLIT, ['a', 'b']), ['b', 'c']);
    expect(s.paidLines).toEqual(['a', 'b', 'c']);
    expect(selectableLines(s, ['a', 'c', 'd'])).toEqual(['d']);
  });

  it('survives a reload through storage, per tab', () => {
    const store = memory();
    saveSplit(store, 't1', markLinesPaid({ people: 3, paid: 1, paidLines: [] }, ['a']));
    expect(loadSplit(store, 't1')).toEqual({ people: 3, paid: 1, paidLines: ['a'] });
    expect(loadSplit(store, 't2')).toEqual(INITIAL_SPLIT);
  });

  it('stores nothing for an untouched split', () => {
    const store = memory();
    saveSplit(store, 't1', markLinesPaid(INITIAL_SPLIT, ['a']));
    saveSplit(store, 't1', INITIAL_SPLIT);
    expect(store.size()).toBe(0);
  });

  it('ignores corrupt storage and clamps people and paid', () => {
    const store = memory();
    store.setItem('rop.split.t1', '{nope');
    expect(loadSplit(store, 't1')).toEqual(INITIAL_SPLIT);
    store.setItem('rop.split.t1', JSON.stringify({ people: 99, paid: 50, paidLines: ['a', 5] }));
    expect(loadSplit(store, 't1')).toEqual({ people: 20, paid: 19, paidLines: ['a'] });
  });

  it('forgets lines that left the bill', () => {
    const s = markLinesPaid(INITIAL_SPLIT, ['a', 'b']);
    expect(pruneSplit(s, ['b', 'c']).paidLines).toEqual(['b']);
    expect(pruneSplit(s, ['a', 'b'])).toBe(s);
  });
});
