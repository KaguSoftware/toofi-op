// Pure: what an in-progress split of one bill has already covered. Payments are not linked
// to lines on the server, so the till remembers which lines a by-item split has paid (and
// how many even shares) and stops them being selected again. Kept per tab in storage so a
// reload or a trip back to the list does not forget it.

export interface SplitState {
  people: number;
  /** Shares already paid in the even split. */
  paid: number;
  /** Lines already paid in the by-item split. */
  paidLines: string[];
}

export const INITIAL_SPLIT: SplitState = { people: 2, paid: 0, paidLines: [] };

type Store = Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>;
const key = (tabId: string) => `rop.split.${tabId}`;

export function loadSplit(store: Store | null, tabId: string): SplitState {
  try {
    const raw = store?.getItem(key(tabId));
    if (!raw) return INITIAL_SPLIT;
    const o = JSON.parse(raw) as Partial<SplitState>;
    const people = Number.isInteger(o.people) ? Math.min(20, Math.max(2, o.people as number)) : 2;
    const paid = Number.isInteger(o.paid) ? Math.min(people - 1, Math.max(0, o.paid as number)) : 0;
    const paidLines = Array.isArray(o.paidLines) ? o.paidLines.filter((x): x is string => typeof x === 'string') : [];
    return { people, paid, paidLines };
  } catch {
    return INITIAL_SPLIT;
  }
}

export function saveSplit(store: Store | null, tabId: string, s: SplitState): void {
  try {
    if (s.paid === 0 && s.paidLines.length === 0 && s.people === INITIAL_SPLIT.people) store?.removeItem(key(tabId));
    else store?.setItem(key(tabId), JSON.stringify(s));
  } catch {
    /* storage blocked: the split lives in memory only */
  }
}

/** Mark lines as paid (each id once). */
export function markLinesPaid(s: SplitState, ids: readonly string[]): SplitState {
  return { ...s, paidLines: [...new Set([...s.paidLines, ...ids])] };
}

/** Forget paid line ids that are no longer on the bill (a voided or merged line). */
export function pruneSplit(s: SplitState, billLineIds: readonly string[]): SplitState {
  const keep = s.paidLines.filter((id) => billLineIds.includes(id));
  return keep.length === s.paidLines.length ? s : { ...s, paidLines: keep };
}

/** The ids a by-item selection may still pay: nothing already covered by an earlier share. */
export function selectableLines(s: SplitState, ids: readonly string[]): string[] {
  return ids.filter((id) => !s.paidLines.includes(id));
}
