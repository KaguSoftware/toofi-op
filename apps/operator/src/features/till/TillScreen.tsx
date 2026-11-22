import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Link } from '@tanstack/react-router';
import { formatTime } from '@rop/i18n';
import { Button, EmptyState, ErrorState, Icon, Loading, Money, PageHeader } from '../../components';
import { useAuth } from '../../lib/auth';
import { useLocale } from '../../lib/i18n';
import { stationId } from '../../lib/idem';
import { QK } from '../../lib/queryKeys';
import { useBroadcast } from '../../lib/realtime';
import { BillPanel } from './BillPanel';
import { fetchOpenTabs, fetchSettledToday, fetchShiftStatus } from './tillData';
import { filterByLabel } from './tillLogic';
import './till.css';

type View = 'open' | 'settled';

export function TillScreen() {
  const { tr, locale } = useLocale();
  const { staff } = useAuth();
  const [view, setView] = useState<View>('open');
  const [search, setSearch] = useState('');
  const [selected, setSelected] = useState<string | null>(null);
  const device = stationId();

  useBroadcast(staff ? `tabs:${staff.venueId}` : null);

  const open = useQuery({ queryKey: QK.tillOpenTabs(), queryFn: fetchOpenTabs, enabled: view === 'open' });
  const settled = useQuery({ queryKey: QK.tillSettled(), queryFn: fetchSettledToday, enabled: view === 'settled' });
  const shift = useQuery({ queryKey: QK.tillShiftStatus(device), queryFn: () => fetchShiftStatus(device) });
  // While the status is unknown, do not claim there is no shift.
  const shiftOpen = shift.data ? shift.data.open : true;

  const labelOf = (l: string | null) => (l ? tr('till.table', { label: l }) : tr('till.noTable'));
  const switchView = (v: View) => {
    setView(v);
    setSelected(null);
  };

  const rows =
    view === 'open'
      ? filterByLabel(open.data ?? [], search).map((t) => ({
          id: t.tabId,
          label: t.tableLabel,
          detail: <Money amount={t.due} />,
        }))
      : filterByLabel(settled.data ?? [], search).map((t) => ({
          id: t.tabId,
          label: t.tableLabel,
          detail: <time dateTime={t.closedAt}>{formatTime(new Date(t.closedAt), locale)}</time>,
        }));
  const list = view === 'open' ? open : settled;

  return (
    <section className="rop-till">
      <PageHeader
        title={tr('till.title')}
        meta={
          shift.data &&
          (shift.data.open ? (
            <span className="rop-badge" data-tone="success">
              <span className="rop-dot" />
              {tr('till.shiftOn')}
            </span>
          ) : (
            <p role="status" className="rop-till-banner">
              <Icon name="alert" size={18} />
              <span>{tr('till.noShiftBanner')}</span> <Link to="/till/shift">{tr('till.openShiftLink')}</Link>
            </p>
          ))
        }
      />
      <div className="rop-till-layout">
        <div className="rop-till-list">
          <div className="rop-segmented" role="group" aria-label={tr('till.title')}>
            <Button aria-pressed={view === 'open'} onClick={() => switchView('open')}>
              {tr('till.openTabs')}
            </Button>
            <Button aria-pressed={view === 'settled'} onClick={() => switchView('settled')}>
              {tr('till.settledToday')}
            </Button>
          </div>
          <label className="rop-sr-only" htmlFor="till-search">
            {tr('till.search')}
          </label>
          <div className="rop-till-search">
          <Icon name="search" size={20} />
          <input
            id="till-search"
            type="search"
            placeholder={tr('till.search')}
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
          </div>
          {list.isPending && <Loading />}
          {list.isError && <ErrorState error={list.error} onRetry={() => void list.refetch()} />}
          {list.data && rows.length === 0 && <EmptyState message={tr(view === 'open' ? 'till.noOpenTabs' : 'till.noSettled')} />}
          <ul className="rop-till-tabs">
            {rows.map((r) => (
              <li key={r.id}>
                <Button aria-pressed={selected === r.id} onClick={() => setSelected(r.id)}>
                  <strong>{labelOf(r.label)}</strong> {r.detail}
                </Button>
              </li>
            ))}
          </ul>
        </div>
        <div className="rop-till-detail">
          {selected ? (
            <BillPanel
              key={selected}
              tabId={selected}
              role={staff?.role ?? null}
              shiftOpen={shiftOpen}
              onBack={() => setSelected(null)}
            />
          ) : (
            <EmptyState message={tr('till.selectTab')} />
          )}
        </div>
      </div>
    </section>
  );
}
