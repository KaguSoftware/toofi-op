import { describe, expect, it } from 'vitest';
import { TAB_STATUSES, TransitionError, tabStatusMachine } from './tab';

describe('tabStatusMachine (open -> settled | void)', () => {
  it('knows the three tab_status values', () => {
    expect([...TAB_STATUSES]).toEqual(['open', 'settled', 'void']);
  });

  it('an open tab can be settled or voided', () => {
    expect(tabStatusMachine.canTransition('open', 'settled')).toBe(true);
    expect(tabStatusMachine.canTransition('open', 'void')).toBe(true);
  });

  it('settled and void are terminal', () => {
    expect(tabStatusMachine.isTerminal('settled')).toBe(true);
    expect(tabStatusMachine.isTerminal('void')).toBe(true);
    expect(tabStatusMachine.isTerminal('open')).toBe(false);
    for (const to of TAB_STATUSES) {
      expect(tabStatusMachine.canTransition('settled', to)).toBe(false);
      expect(tabStatusMachine.canTransition('void', to)).toBe(false);
    }
  });

  it('open -> open is not a transition', () => {
    expect(tabStatusMachine.canTransition('open', 'open')).toBe(false);
  });

  it('assertTransition throws a TransitionError naming both ends', () => {
    expect(() => tabStatusMachine.assertTransition('open', 'settled')).not.toThrow();
    try {
      tabStatusMachine.assertTransition('settled', 'open');
      expect.unreachable();
    } catch (e) {
      expect(e).toBeInstanceOf(TransitionError);
      expect((e as TransitionError).code).toBe('INVALID_TRANSITION');
      expect((e as TransitionError).from).toBe('settled');
      expect((e as TransitionError).to).toBe('open');
    }
  });
});
