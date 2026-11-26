import type { GuestCopy } from '@/lib/copyLogic';
import type { CallStrip } from '@/lib/callLogic';
import type { OrderStrips } from '@/lib/orderLogic';
import { Icon } from './Icon';
import type { IconName } from './icons';

export type NoticeStrip = 'scan-again' | 'closed' | null;

function Strip({ tone, icon, children, dismiss }: { tone: 'wait' | 'good'; icon: IconName; children: string; dismiss?: { label: string; onClick: () => void } }) {
  return (
    <div className={`status status--${tone}`}>
      <Icon name={icon} size={20} />
      <span className="status__text">{children}</span>
      {dismiss && (
        <button type="button" className="status__dismiss" aria-label={dismiss.label} onClick={dismiss.onClick}>
          <Icon name="close" size={18} />
        </button>
      )}
    </div>
  );
}

interface Props {
  copy: GuestCopy;
  notice: NoticeStrip;
  call: CallStrip;
  orders: OrderStrips;
  /** A refused change to the order (20 of one dish, 40 lines), shown while no sheet is open. */
  limit: string | null;
  offline: boolean;
  onDismissOrder: (id: string) => void;
}

/** Above the bottom bar, only when there is something to say. Status is an icon and words, never colour alone. */
export function StatusStrips({ copy, notice, call, orders, limit, offline, onDismissOrder }: Props) {
  // Always mounted, even when empty: a live region added with its text already in it is not announced.
  return (
    <div className="statuses" role="status">
      {offline && (
        <Strip tone="wait" icon="offline">
          {copy.offline}
        </Strip>
      )}
      {notice === 'scan-again' && (
        <Strip tone="wait" icon="clock">
          {copy.notice.scanAgain}
        </Strip>
      )}
      {notice === 'closed' && (
        <Strip tone="wait" icon="clock">
          {copy.notice.closed}
        </Strip>
      )}
      {limit && (
        <Strip tone="wait" icon="order">
          {limit}
        </Strip>
      )}
      {call === 'waiting' && (
        <Strip tone="wait" icon="bell">
          {copy.strip.callWaiting}
        </Strip>
      )}
      {call === 'answered' && (
        <Strip tone="good" icon="check">
          {copy.strip.callAnswered}
        </Strip>
      )}
      {orders.waiting && (
        <Strip tone="wait" icon="clock">
          {orders.waiting === 'late' ? copy.order.strip.late : copy.order.strip.waiting}
        </Strip>
      )}
      {orders.decided && (
        <Strip
          tone={orders.decided.kind === 'accepted' ? 'good' : 'wait'}
          icon={orders.decided.kind === 'accepted' ? 'check' : 'help'}
          dismiss={{ label: copy.order.strip.dismiss, onClick: () => onDismissOrder(orders.decided!.id) }}
        >
          {copy.order.strip[orders.decided.kind]}
        </Strip>
      )}
    </div>
  );
}
