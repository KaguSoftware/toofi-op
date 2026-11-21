import { Link, Outlet } from '@tanstack/react-router';
import type { MessageKey } from '@rop/i18n';
import { useAuth } from '../../lib/auth';
import { useLocale } from '../../lib/i18n';
import { useBroadcast } from '../../lib/realtime';
import '../manage/manage.css';

const SECTIONS: readonly { to: string; key: MessageKey; exact?: boolean }[] = [
  { to: '/stock', key: 'stock.onHand', exact: true },
  { to: '/stock/receive', key: 'stock.receive' },
  { to: '/stock/waste', key: 'stock.waste' },
  { to: '/stock/count', key: 'stock.countTitle' },
  { to: '/stock/recipes', key: 'stock.recipes' },
  { to: '/stock/margins', key: 'stock.marginsTitle' },
  { to: '/stock/admin', key: 'stock.admin' },
];

/** Layout for /stock: a sub-navigation and the child route. Listens for stock changes. */
export function StockScreen() {
  const { tr } = useLocale();
  const { staff } = useAuth();
  useBroadcast(staff ? `stock:${staff.venueId}` : null);
  return (
    <section className="manage">
      <h1>{tr('stock.title')}</h1>
      <nav className="rop-segmented manage__tabs" aria-label={tr('stock.sections')}>
        {SECTIONS.map((s) => (
          <Link key={s.to} to={s.to} activeOptions={{ exact: s.exact ?? false }}>
            {tr(s.key)}
          </Link>
        ))}
      </nav>
      <Outlet />
    </section>
  );
}
