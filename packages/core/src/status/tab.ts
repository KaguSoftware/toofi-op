/**
 * The tab status machine, matching the `tab_status` enum: open -> settled | void.
 * The server enforces it; clients use it to enable buttons and fail fast.
 * Transitions are the legal edges only; the initial state is set at insert.
 */

export const TAB_STATUSES = ['open', 'settled', 'void'] as const;

export type TabStatus = (typeof TAB_STATUSES)[number];

export class TransitionError extends Error {
  readonly code = 'INVALID_TRANSITION' as const;
  readonly from: string;
  readonly to: string;

  constructor(from: string, to: string) {
    super(`invalid tab transition: '${from}' -> '${to}'`);
    this.name = 'TransitionError';
    this.from = from;
    this.to = to;
  }
}

const TRANSITIONS: Readonly<Record<TabStatus, readonly TabStatus[]>> = {
  open: ['settled', 'void'],
  settled: [], // a correction after settling is a refund, never a status edit
  void: [],
};

export const tabStatusMachine = {
  states: TAB_STATUSES,
  transitions: TRANSITIONS,
  canTransition(from: TabStatus, to: TabStatus): boolean {
    return TRANSITIONS[from].includes(to);
  },
  /** Throws TransitionError when the edge is not in the table. */
  assertTransition(from: TabStatus, to: TabStatus): void {
    if (!TRANSITIONS[from].includes(to)) throw new TransitionError(from, to);
  },
  isTerminal(state: TabStatus): boolean {
    return TRANSITIONS[state].length === 0;
  },
};
