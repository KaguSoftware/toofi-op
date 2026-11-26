import type { GuestCopy } from '@/lib/copyLogic';
import type { CallStrip } from '@/lib/callLogic';
import { Icon } from './Icon';
import type { IconName } from './icons';

export type NoticeStrip = 'scan-again' | 'closed' | null;

function Strip({ tone, icon, children }: { tone: 'wait' | 'good'; icon: IconName; children: string }) {
  return (
    <div className={`status status--${tone}`}>
      <Icon name={icon} size={20} />
      <span>{children}</span>
    </div>
  );
}

/** Above the bottom bar, only when there is something to say. Status is an icon and words, never colour alone. */
export function StatusStrips({ copy, notice, call, offline }: { copy: GuestCopy; notice: NoticeStrip; call: CallStrip; offline: boolean }) {
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
    </div>
  );
}
