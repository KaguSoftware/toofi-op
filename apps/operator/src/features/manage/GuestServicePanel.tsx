import { useQuery } from '@tanstack/react-query';
import { can } from '@rop/core';
import { ErrorState, Loading } from '../../components';
import { appRpc } from '../../lib/appRpc';
import { useAuth } from '../../lib/auth';
import { useLocale } from '../../lib/i18n';
import { QK } from '../../lib/queryKeys';
import { OnOff } from './GuestKit';
import { selectRows, useRun } from './shared';

interface Settings {
  guest_calls_enabled: boolean;
  guest_orders_enabled: boolean;
}

async function fetchSettings(): Promise<Settings> {
  const rows = await selectRows<Settings>('venue_settings', 'guest_calls_enabled, guest_orders_enabled', { limit: 1 });
  const row = rows[0];
  if (!row) throw new Error('venue settings missing');
  return row;
}

/** The two venue-wide switches. Manager and owner only; the server checks the role too. */
export function GuestServicePanel() {
  const { tr } = useLocale();
  const { staff } = useAuth();
  const mayPause = staff !== null && can(staff.role, 'setGuestSwitches');
  const q = useQuery({ queryKey: QK.manage('guest-service'), queryFn: fetchSettings, enabled: mayPause });
  const { busy, run } = useRun(['manage']);
  if (!mayPause) return null;
  if (q.isPending) return <Loading />;
  if (q.error) return <ErrorState error={q.error} onRetry={() => void q.refetch()} />;
  const { guest_calls_enabled: calls, guest_orders_enabled: orders } = q.data;

  const set = (c: boolean, o: boolean) => void run(() => appRpc('set_guest_service', { p_calls_enabled: c, p_orders_enabled: o }));

  return (
    <section className="manage__section" aria-labelledby="guest-service-title">
      <header className="manage__section-head">
        <h2 id="guest-service-title">{tr('guestSetup.servicesTitle')}</h2>
      </header>
      <p className="manage__note">{tr('guestSetup.servicesHint')}</p>
      <div className="manage__switches">
        <div className="manage__switch">
          <span>{tr('guestSetup.calls')}</span>
          <OnOff label={tr('guestSetup.callsGroup')} on={calls} busy={busy} onChange={(v) => set(v, orders)} />
        </div>
        <div className="manage__switch">
          <span>{tr('guestSetup.orders')}</span>
          <OnOff label={tr('guestSetup.ordersGroup')} on={orders} busy={busy} onChange={(v) => set(calls, v)} />
        </div>
      </div>
    </section>
  );
}
