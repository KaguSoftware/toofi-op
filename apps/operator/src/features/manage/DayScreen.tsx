import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Link } from '@tanstack/react-router';
import { formatDateTime, formatIQD, formatNumber } from '@rop/i18n';
import { Button, ConfirmDialog, DataTable, ErrorState, Loading, Money, PageHeader, type Column } from '../../components';
import { appRpc } from '../../lib/appRpc';
import { errorMessage } from '../../lib/errors';
import { useLocale } from '../../lib/i18n';
import { printReceipt } from '../../lib/print';
import { QK } from '../../lib/queryKeys';
import { errorCodeOf, selectRows, useRun } from './shared';
import { alertCount, parseShiftVariances, summaryHtml, type DaySummary, type ShiftVariance } from './dayLogic';
import { presetRange } from './manageLogic';
import './manage.css';

interface DayRow {
  id: string;
  business_date: string;
  opened_at: string;
  closed_at: string | null;
  summary: DaySummary | null;
}

/** Till shifts of one business date. If app.shift_variances is missing the query errors and the section shows an ErrorState. */
function ShiftsSection({ date }: { date: string }) {
  const { tr, locale } = useLocale();
  const q = useQuery({
    queryKey: QK.manage('day', 'shifts', date),
    queryFn: async () => parseShiftVariances(await appRpc('shift_variances' as never, { p_from: date, p_to: date })),
  });
  const money = (n: number | null) => (n === null ? '-' : formatIQD(n, locale));
  const when = (s: string | null) => (s ? formatDateTime(new Date(s), locale) : tr('manage.day.shifts.stillOpen'));
  const cols: Column<ShiftVariance>[] = [
    { key: 'staff', header: tr('manage.day.shifts.staff'), cell: (r) => r.staff_name },
    { key: 'device', header: tr('manage.day.shifts.device'), cell: (r) => <bdi>{r.device_id}</bdi> },
    { key: 'opened', header: tr('manage.day.shifts.opened'), cell: (r) => when(r.opened_at) },
    { key: 'closed', header: tr('manage.day.shifts.closed'), cell: (r) => when(r.closed_at) },
    { key: 'float', header: tr('manage.day.shifts.openingFloat'), align: 'end', cell: (r) => money(r.opening_float) },
    { key: 'expected', header: tr('manage.day.shifts.expected'), align: 'end', cell: (r) => money(r.expected_cash) },
    { key: 'counted', header: tr('manage.day.shifts.counted'), align: 'end', cell: (r) => money(r.counted_cash) },
    { key: 'variance', header: tr('manage.day.shifts.variance'), align: 'end', cell: (r) => <bdi>{money(r.variance)}</bdi> },
    {
      key: 'status',
      header: tr('manage.day.shifts.status'),
      cell: (r) =>
        r.alert ? (
          <strong className="manage__alert">{tr('manage.day.shifts.alert')}</strong>
        ) : r.closed_at ? (
          tr('manage.day.shifts.ok')
        ) : (
          tr('manage.day.shifts.stillOpen')
        ),
    },
  ];
  const alerts = q.data ? alertCount(q.data) : 0;
  return (
    <section aria-labelledby="day-shifts">
      <h2 id="day-shifts">{tr('manage.day.shifts.title')}</h2>
      {q.isPending ? (
        <Loading />
      ) : q.error ? (
        <ErrorState error={q.error} onRetry={() => void q.refetch()} />
      ) : (
        <>
          {q.data.length > 0 && (
            <p role={alerts > 0 ? 'alert' : 'status'}>
              {alerts > 0 ? tr('manage.day.shifts.alertCount', { count: alerts }) : tr('manage.day.shifts.allOk')}
            </p>
          )}
          <DataTable
            columns={cols}
            rows={q.data}
            rowKey={(r) => `${r.device_id}|${r.opened_at}`}
            caption={tr('manage.day.shifts.caption')}
            emptyMessage={tr('manage.day.shifts.none')}
            rowClass={(r) => (r.alert ? 'manage__row-alert' : undefined)}
          />
        </>
      )}
    </section>
  );
}

export function DayScreen() {
  const { tr, locale } = useLocale();
  const day = useQuery({
    queryKey: QK.manage('day'),
    queryFn: async () =>
      (await selectRows<DayRow>('day_sessions', 'id, business_date, opened_at, closed_at, summary', { order: 'opened_at', desc: true, limit: 1 }))[0] ?? null,
  });
  const { busy, run } = useRun(['manage', 'floor']);
  const [confirming, setConfirming] = useState(false);
  const [openTabs, setOpenTabs] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [justClosed, setJustClosed] = useState<{ business_date: string; summary: DaySummary } | null>(null);

  if (day.isPending) return <Loading />;
  if (day.error) return <ErrorState error={day.error} onRetry={() => void day.refetch()} />;

  const current = day.data;
  const isOpen = !!current && current.closed_at === null;

  async function open() {
    setError(null);
    setJustClosed(null);
    const r = await run(() => appRpc('open_day'), 'manage.day.opened', { quiet: true });
    if (!r.ok) setError(errorMessage(r.error, locale));
  }

  async function close() {
    setConfirming(false);
    setError(null);
    setOpenTabs(false);
    const r = await run(() => appRpc<{ business_date: string; summary: DaySummary }>('close_day'), 'manage.day.closed', { quiet: true });
    if (r.ok) setJustClosed(r.value);
    else if (errorCodeOf(r.error) === 'OPEN_TABS_EXIST') setOpenTabs(true);
    else setError(errorMessage(r.error, locale));
  }

  const shown = justClosed ?? (current && current.closed_at && current.summary ? { business_date: current.business_date, summary: current.summary } : null);

  return (
    <section className="manage manage-day">
      <PageHeader
        title={tr('manage.dayTitle')} icon="day" tone="accent"
        actions={
          isOpen ? (
            <Button variant="danger" busy={busy} onClick={() => setConfirming(true)}>
              {tr('manage.day.close')}
            </Button>
          ) : (
            <Button variant="primary" busy={busy} onClick={() => void open()}>
              {tr('manage.day.open')}
            </Button>
          )
        }
      />

      <div className="manage-day__status" data-open={isOpen || undefined}>
        <span className="rop-badge" data-tone={isOpen ? 'success' : undefined}>
          <span className="rop-dot" />
          {isOpen ? tr('manage.day.statusOpen') : tr('manage.day.statusClosed')}
        </span>
        <p role="status">
          {isOpen && current
            ? tr('manage.day.openSince', { date: current.business_date, time: formatDateTime(new Date(current.opened_at), locale) })
            : tr('manage.day.closedState')}
        </p>
      </div>

      {openTabs && (
        <div role="alert" className="manage__notice">
          <h2>{tr('manage.day.openTabsTitle')}</h2>
          <p>{tr('manage.day.openTabsBody')}</p>
          <Link to="/floor">{tr('manage.day.goToFloor')}</Link>
        </div>
      )}
      {error && (
        <p role="alert" className="rop-field__error">
          {error}
        </p>
      )}


      <ConfirmDialog
        open={confirming}
        title={tr('manage.day.closeTitle')}
        message={tr('manage.day.closeMessage')}
        confirmLabel={tr('manage.day.close')}
        danger
        busy={busy}
        onConfirm={() => void close()}
        onCancel={() => setConfirming(false)}
      />

      <ShiftsSection date={current?.business_date ?? presetRange('today', new Date()).from} />

      {shown && (
        <section className="manage-day__summary" aria-labelledby="day-summary">
          <h2 id="day-summary">{tr('manage.day.summary', { date: shown.business_date })}</h2>
          <dl className="manage__summary">
            {(['gross', 'discounts', 'refunds', 'net', 'cash', 'card'] as const).map((k) => (
              <div key={k} className="manage__card">
                <dt>{tr(`manage.day.s_${k}`)}</dt>
                <dd className="manage__figure">
                  <Money amount={shown.summary[k]} />
                </dd>
              </div>
            ))}
            <div className="manage__card">
              <dt>{tr('manage.day.s_voids')}</dt>
              <dd className="manage__figure">
                {formatNumber(shown.summary.voids_count, locale)} (<Money amount={shown.summary.voids_value} />)
              </dd>
            </div>
            <div className="manage__card">
              <dt>{tr('manage.day.s_covers')}</dt>
              <dd className="manage__figure">{formatNumber(shown.summary.covers, locale)}</dd>
            </div>
            <div className="manage__card">
              <dt>{tr('manage.day.s_tabs')}</dt>
              <dd className="manage__figure">{formatNumber(shown.summary.tabs, locale)}</dd>
            </div>
            {(['paid_outs', 'pay_ins', 'drops'] as const).map((k) => (
              <div key={k} className="manage__card">
                <dt>{tr(`manage.day.s_${k}`)}</dt>
                <dd className="manage__figure">
                  <Money amount={shown.summary[k] ?? 0} />
                </dd>
              </div>
            ))}
          </dl>
          <Button
            onClick={() =>
              void printReceipt(
                summaryHtml(shown.business_date, shown.summary, {
                  title: tr('manage.day.summary', { date: shown.business_date }),
                  labels: {
                    gross: tr('manage.day.s_gross'),
                    discounts: tr('manage.day.s_discounts'),
                    refunds: tr('manage.day.s_refunds'),
                    net: tr('manage.day.s_net'),
                    cash: tr('manage.day.s_cash'),
                    card: tr('manage.day.s_card'),
                    voids: tr('manage.day.s_voids'),
                    covers: tr('manage.day.s_covers'),
                    tabs: tr('manage.day.s_tabs'),
                    paidOuts: tr('manage.day.s_paid_outs'),
                    payIns: tr('manage.day.s_pay_ins'),
                    drops: tr('manage.day.s_drops'),
                  },
                  locale,
                }),
              )
            }
          >
            {tr('manage.day.print')}
          </Button>
        </section>
      )}
    </section>
  );
}
