import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { formatTime } from '@rop/i18n';
import { Button, EmptyState, ErrorState, Icon, Loading, Money, PageHeader } from '../../components';
import { useAuth } from '../../lib/auth';
import { useLocale } from '../../lib/i18n';
import { QK } from '../../lib/queryKeys';
import { useBroadcast } from '../../lib/realtime';
import { FloorNav } from '../floor/FloorNav';
import { BillPanel } from './BillPanel';
import { ShiftBadge, useShiftOpen } from './ShiftBadge';
import { fetchOpenTabs, fetchSettledToday } from './tillData';
import { filterByLabel } from './tillLogic';
import './till.css';

type View = 'open' | 'settled';

/** The bills view of the floor: every open bill, and today's settled ones for a reprint or a refund. */
export function TillScreen() {
  const { tr, locale } = useLocale();
  const { staff } = useAuth();
  const [view, setView] = useState<View>('open');
  const [search, setSearch] = useState('');
  const [selected, setSelected] = useState<string | null>(null);

  useBroadcast(staff ? `tabs:${staff.venueId}` : null);

  const open = useQuery({ queryKey: QK.tillOpenTabs(), queryFn: fetchOpenTabs, enabled: view === 'open' });
  const settled = useQuery({ queryKey: QK.tillSettled(), queryFn: fetchSettledToday, enabled: view === 'settled' });
  const shift = useShiftOpen();

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
        title={tr('floor.bills')} icon="till"
        meta={<ShiftBadge open={shift} />}
      >
        <FloorNav />
      </PageHeader>
      <div className="rop-till-layout">
        <div className="rop-till-list">
          <div className="rop-segmented" role="group" aria-label={tr('floor.bills')}>
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
          <ul className="rop-till-tabs rop-cascade" key={view}>
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
              // While the status is unknown, do not claim there is no shift.
              shiftOpen={shift ?? true}
              onBack={() => setSelected(null)}
              backLabel={tr('till.back')}
            />
          ) : (
            <EmptyState message={tr('till.selectTab')} />
          )}
        </div>
      </div>
    </section>
  );
}
