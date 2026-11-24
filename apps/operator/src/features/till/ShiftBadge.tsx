import { useQuery } from '@tanstack/react-query';
import { Link } from '@tanstack/react-router';
import { Icon } from '../../components';
import { useLocale } from '../../lib/i18n';
import { stationId } from '../../lib/idem';
import { QK } from '../../lib/queryKeys';
import { fetchShiftStatus } from './tillData';

/** This station's till shift: undefined while it is not known. */
export function useShiftOpen(enabled = true): boolean | undefined {
  const device = stationId();
  return useQuery({ queryKey: QK.tillShiftStatus(device), queryFn: () => fetchShiftStatus(device), enabled }).data?.open;
}

/** Header line: the shift is on, or cash is off with the way to fix it. */
export function ShiftBadge({ open }: { open: boolean | undefined }) {
  const { tr } = useLocale();
  if (open === undefined) return null;
  return open ? (
    <span className="rop-badge" data-tone="success">
      <span className="rop-dot" />
      {tr('till.shiftOn')}
    </span>
  ) : (
    <p role="status" className="rop-till-banner">
      <Icon name="alert" size={18} />
      <span>{tr('till.noShiftBanner')}</span> <Link to="/till/shift">{tr('till.openShiftLink')}</Link>
    </p>
  );
}
