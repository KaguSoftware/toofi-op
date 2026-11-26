'use client';

import { fill, type GuestCopy } from '@/lib/copyLogic';
import { formatCountdown, type CallButton } from '@/lib/callLogic';
import { Icon } from './Icon';

interface Props {
  copy: GuestCopy;
  call: CallButton;
  /** "3 dishes · 25,000 IQD" when the order has dishes; null when it is empty. */
  orderSub: string | null;
  /** Ordering is switched off for this table: there is no Your order button. */
  ordersOff: boolean;
  onCall: () => void;
  onOrder: () => void;
}

/**
 * Call waiter (charcoal) and Your order. Your order is terra cotta once it has dishes and
 * recessed while empty (it still opens, to say how to add some); Call waiter never is.
 */
export function BottomBar({ copy, call, orderSub, ordersOff, onCall, onOrder }: Props) {
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
      {!ordersOff && (
        <button type="button" className={orderSub ? 'bar__order bar__order--ready' : 'bar__order'} aria-haspopup="dialog" onClick={onOrder}>
          <span className="bar__order-title">{copy.bar.yourOrder}</span>
          <span className="bar__order-sub">{orderSub ?? copy.bar.orderEmpty}</span>
        </button>
      )}
    </div>
  );
}
