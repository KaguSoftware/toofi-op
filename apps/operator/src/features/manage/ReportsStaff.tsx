import { formatNumber, formatPercent } from '@rop/i18n';
import { DataTable, ErrorState, Loading, Money, type Column } from '../../components';
import { useLocale } from '../../lib/i18n';
import type { DateRange } from './manageLogic';
import { useReport } from './reportsData';
import { CountValue, percentOf, ReportSection, SignedMoney } from './reportsKit';
import { staffViews, type StaffReport, type StaffRow } from './reportsLogic';

/** Who sold what, whose voids, discounts and refunds stand out, and how the cash counts went. */
export function ReportsStaff({ range, ok }: { range: DateRange; ok: boolean }) {
  const { tr, locale } = useLocale();
  const q = useReport<StaffReport>('analytics_staff', range, ok);

  if (q.isError) return <ErrorState error={q.error} onRetry={() => void q.refetch()} />;
  if (!q.data) return <Loading />;

  const views = staffViews(q.data.staff);
  const num = (n: number) => formatNumber(n, locale);
  const who: Column<StaffRow> = {
    key: 'name',
    header: tr('reports.staff.name'),
    cell: (r) => (
      <>
        {r.full_name} <span className="reports__tag">· {tr(`auth.role.${r.role as 'waiter' | 'cashier' | 'manager' | 'owner'}`)}</span>
      </>
    ),
  };

  const serviceCols: Column<StaffRow>[] = [
    who,
    { key: 'tabs', header: tr('reports.staff.tabs'), align: 'end', cell: (r) => num(r.tabs) },
    { key: 'covers', header: tr('reports.staff.covers'), align: 'end', cell: (r) => num(r.covers) },
    { key: 'sales', header: tr('reports.staff.sales'), align: 'end', cell: (r) => <SignedMoney amount={r.revenue} /> },
    { key: 'spend', header: tr('reports.staff.spend'), align: 'end', cell: (r) => (r.covers > 0 ? <Money amount={r.spend_per_cover} /> : '–') },
    { key: 'ipc', header: tr('reports.staff.itemsPerCover'), align: 'end', cell: (r) => (r.covers > 0 ? formatPercent(r.items_per_cover_x100 / 100, locale) : '–') },
  ];
  const exceptionCols: Column<StaffRow>[] = [
    {
      ...who,
      cell: (r) => (
        <>
          {who.cell(r)}{' '}
          {r.flagged && (
            <span className="rop-badge" data-tone="danger">
              {tr('reports.staff.flagged')}
            </span>
          )}
        </>
      ),
    },
    { key: 'voids', header: tr('reports.staff.voids'), align: 'end', cell: (r) => <CountValue count={r.voids_count} value={r.voids_value} /> },
    { key: 'discounts', header: tr('reports.staff.discounts'), align: 'end', cell: (r) => <CountValue count={r.discounts_count} value={r.discounts_value} /> },
    { key: 'refunds', header: tr('reports.staff.refunds'), align: 'end', cell: (r) => <CountValue count={r.refunds_count} value={r.refunds_value} /> },
    { key: 'rate', header: tr('reports.staff.rate'), align: 'end', cell: (r) => <bdi>{percentOf(r.exception_bps, locale)}</bdi> },
  ];
  const cashCols: Column<StaffRow>[] = [
    who,
    { key: 'shifts', header: tr('reports.staff.shifts'), align: 'end', cell: (r) => num(r.shifts) },
    { key: 'variance', header: tr('reports.staff.variance'), align: 'end', cell: (r) => (r.shifts > 0 ? <SignedMoney amount={r.cash_variance} /> : '–') },
    {
      key: 'alerts',
      header: tr('reports.staff.alerts'),
      align: 'end',
      cell: (r) =>
        r.variance_alerts > 0 ? (
          <span className="rop-badge" data-tone="danger">
            {num(r.variance_alerts)}
          </span>
        ) : (
          num(0)
        ),
    },
    { key: 'drawer', header: tr('reports.staff.drawerOpens'), align: 'end', cell: (r) => num(r.drawer_opens) },
    { key: 'paid', header: tr('reports.staff.paidOuts'), align: 'end', cell: (r) => <CountValue count={r.paid_outs_count} value={r.paid_outs_value} /> },
  ];

  return (
    <>
      <ReportSection
        title={tr('reports.staff.exceptionsTitle')}
        hint={tr('reports.staff.exceptionsHint', { rate: formatPercent(q.data.venue_exception_bps / 100, locale) })}
      >
        <DataTable
          columns={exceptionCols}
          rows={views.exceptions}
          rowKey={(r) => r.staff_id}
          caption={tr('reports.staff.exceptionsTitle')}
          emptyMessage={tr('reports.staff.exceptionsNone')}
          rowClass={(r) => (r.flagged ? 'manage__row-alert' : undefined)}
        />
      </ReportSection>
      <ReportSection title={tr('reports.staff.cashTitle')} hint={tr('reports.staff.cashHint')}>
        <DataTable columns={cashCols} rows={views.cash} rowKey={(r) => r.staff_id} caption={tr('reports.staff.cashTitle')} emptyMessage={tr('reports.staff.cashNone')} />
      </ReportSection>
      <ReportSection title={tr('reports.staff.serviceTitle')} hint={tr('reports.staff.serviceHint')}>
        <DataTable columns={serviceCols} rows={views.service} rowKey={(r) => r.staff_id} caption={tr('reports.staff.serviceTitle')} emptyMessage={tr('reports.staff.none')} />
      </ReportSection>
    </>
  );
}
