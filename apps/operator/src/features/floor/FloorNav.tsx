import { Link } from '@tanstack/react-router';
import { canAccess } from '@rop/core';
import { useAuth } from '../../lib/auth';
import { useLocale } from '../../lib/i18n';

/** Tables and bills, the two views of the floor. A role with only the tables sees no switch. */
export function FloorNav() {
  const { tr } = useLocale();
  const { staff } = useAuth();
  if (!canAccess(staff?.role, '/floor/bills')) return null;
  return (
    <nav className="rop-segmented floor__nav" aria-label={tr('floor.sections')}>
      <Link to="/floor" className="rop-btn" activeOptions={{ exact: true }}>
        {tr('floor.tables')}
      </Link>
      <Link to="/floor/bills" className="rop-btn">{tr('floor.bills')}</Link>
    </nav>
  );
}
