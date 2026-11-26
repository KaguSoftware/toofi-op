'use client';

import { fill, type GuestCopy } from '@/lib/copyLogic';
import { Sheet } from './Sheet';

export type NoticeKind = 'scan' | 'expired' | 'closed' | 'off' | 'ordersOff' | 'tooSoon';

/** A sheet that only explains: scan your table's code, service is closed, calls or ordering are off, wait before calling again. */
export function NoticeSheet({ copy, kind, time, onClose }: { copy: GuestCopy; kind: NoticeKind; time: string; onClose: () => void }) {
  const text = kind === 'ordersOff' ? copy.order.ordersOff : copy.sheet[kind];
  return (
    <Sheet title={text.title} closeLabel={copy.sheet.close} onClose={onClose}>
      <p className="sheet__body">{fill(text.body, { time })}</p>
    </Sheet>
  );
}
