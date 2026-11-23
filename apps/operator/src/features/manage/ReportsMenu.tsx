import { formatNumber } from '@rop/i18n';
import { DataTable, ErrorState, Loading, Money, type Column } from '../../components';
import { useLocale } from '../../lib/i18n';
import type { DateRange } from './manageLogic';
import { useReport } from './reportsData';
import { percentOf, ReportSection } from './reportsKit';
import { groupByClass, MENU_CLASSES, type MenuItemRow, type MenuReport } from './reportsLogic';

/** Menu engineering: every item placed by how often it sells and what it earns, with what to do about it. */
export function ReportsMenu({ range, ok }: { range: DateRange; ok: boolean }) {
  const { tr, locale } = useLocale();
  const q = useReport<MenuReport>('analytics_menu_engineering', range, ok);

  if (q.isError) return <ErrorState error={q.error} onRetry={() => void q.refetch()} />;
  if (!q.data) return <Loading />;

  const groups = groupByClass(q.data.items);
  const name = (r: MenuItemRow) => (
    <>
      {locale === 'ar' ? r.name_ar : r.name_en}
      {!r.is_active && <span className="reports__tag"> · {tr('reports.menu.offMenu')}</span>}
    </>
  );
  const costed: Column<MenuItemRow>[] = [
    { key: 'item', header: tr('reports.menu.item'), cell: name },
    { key: 'sold', header: tr('reports.menu.sold'), align: 'end', cell: (r) => formatNumber(r.qty, locale) },
    { key: 'share', header: tr('reports.menu.share'), align: 'end', cell: (r) => <bdi>{percentOf(r.share_bps, locale)}</bdi> },
    { key: 'unit', header: tr('reports.menu.unitMargin'), align: 'end', cell: (r) => <Money amount={r.unit_margin} /> },
    { key: 'margin', header: tr('reports.menu.margin'), align: 'end', cell: (r) => <Money amount={r.margin} /> },
  ];
  const uncosted: Column<MenuItemRow>[] = [
    { key: 'item', header: tr('reports.menu.item'), cell: name },
    { key: 'sold', header: tr('reports.menu.sold'), align: 'end', cell: (r) => formatNumber(r.qty, locale) },
    { key: 'revenue', header: tr('reports.menu.revenue'), align: 'end', cell: (r) => <Money amount={r.revenue} /> },
  ];

  return (
    <>
      <p className="manage__note reports__intro">{tr('reports.menu.hint')}</p>
      {MENU_CLASSES.map((c) => (
        <ReportSection key={c} title={`${tr(`reports.menu.${c}`)} (${formatNumber(groups[c].length, locale)})`} hint={tr(`reports.menu.${c}_hint`)}>
          <DataTable
            columns={c === 'uncosted' ? uncosted : costed}
            rows={groups[c]}
            rowKey={(r) => r.menu_item_id}
            caption={tr(`reports.menu.${c}`)}
            emptyMessage={tr('reports.menu.none')}
          />
        </ReportSection>
      ))}
    </>
  );
}
