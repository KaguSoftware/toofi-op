'use client';

import { fill, type GuestCopy } from '@/lib/copyLogic';
import { CALL_REASONS, type CallReason } from '@/lib/requestLogic';
import { Icon } from './Icon';
import { Sheet } from './Sheet';

const REASON_ICON = { order: 'order', bill: 'bill', water: 'water', help: 'help' } as const;

interface Props {
  copy: GuestCopy;
  tableLabel: string;
  /** The reason being sent right now, if any. */
  sending: CallReason | null;
  offline: boolean;
  /** Why the last attempt did not go through; stays up so the guest can try again. */
  error: string | null;
  onPick: (reason: CallReason) => void;
  onClose: () => void;
}

/** Four reasons in a 2 × 2 grid. Picking one sends the call. */
export function CallSheet({ copy, tableLabel, sending, offline, error, onPick, onClose }: Props) {
  return (
    <Sheet title={copy.call.title} closeLabel={copy.sheet.close} onClose={onClose}>
      <div className="reasons">
        {CALL_REASONS.map((reason) => (
          <button key={reason} type="button" className="reason" disabled={sending !== null || offline} aria-busy={sending === reason} onClick={() => onPick(reason)}>
            <Icon name={REASON_ICON[reason]} />
            <span>{copy.call.reason[reason]}</span>
          </button>
        ))}
      </div>
      {offline && (
        <p className="sheet__note sheet__note--alert" role="status">
          {copy.offline}
        </p>
      )}
      {error && !offline && (
        <p className="sheet__note sheet__note--alert" role="alert">
          {error}
        </p>
      )}
      <p className="sheet__note" aria-live="polite">
        {sending ? copy.call.sending : tableLabel ? fill(copy.call.hint, { label: tableLabel }) : ''}
      </p>
    </Sheet>
  );
}
