'use client';

import { fill, type GuestCopy } from '@/lib/copyLogic';
import { formatCountdown, type CallButton } from '@/lib/callLogic';
import { Icon } from './Icon';

/**
 * Call waiter (charcoal) and Your order. The order half is ticket 05's: until it exists it
 * shows its empty state and does nothing. The one terra cotta control on screen will be
 * Your order, once it has items; Call waiter never is.
 */
export function BottomBar({ copy, call, onCall }: { copy: GuestCopy; call: CallButton; onCall: () => void }) {
  return (
    <div className="bar">
      {call.kind !== 'off' && (
        <button type="button" className="bar__call" onClick={onCall}>
          <Icon name="bell" size={22} />
          <span className="bar__call-text">
            <span>{copy.bar.callWaiter}</span>
            {call.kind === 'wait' && <span className="bar__call-sub">{fill(copy.bar.callAgain, { time: formatCountdown(call.msLeft) })}</span>}
          </span>
        </button>
      )}
      <button type="button" className="bar__order" disabled>
        <span className="bar__order-title">{copy.bar.yourOrder}</span>
        <span className="bar__order-sub">{copy.bar.orderEmpty}</span>
      </button>
    </div>
  );
}
