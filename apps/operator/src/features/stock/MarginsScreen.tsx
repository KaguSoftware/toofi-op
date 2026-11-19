import { useQuery } from '@tanstack/react-query';
import { formatNumber } from '@rop/i18n';
import { DataTable, ErrorState, Money, type Column } from '../../components';
import { appRpc } from '../../lib/appRpc';
import { useLocale } from '../../lib/i18n';
import { QK } from '../../lib/queryKeys';
import { RangePicker, useRangeState } from '../manage/RangePicker';

interface MarginRow {
  menu_item_id: string;
  name_en: string;
  name_ar: string;
  qty: number;
  revenue: number;
  cost: number;
  margin: number;
  costed: boolean;
}
interface Margins {
  items: MarginRow[];
  totals: { revenue: number; cost: number; margin: number };
}

export function MarginsScreen() {
  const { tr, locale } = useLocale();
  const rs = useRangeState('last7');
  const q = useQuery({
    queryKey: QK.stock('margins', rs.range.from, rs.range.to),
    enabled: rs.error === null,
    queryFn: () => appRpc<Margins>('report_item_margins', { p_from: rs.range.from, p_to: rs.range.to }),
  });
  const cols: Column<MarginRow>[] = [
    { key: 'name', header: tr('manage.panel.item'), cell: (r) => (locale === 'ar' ? r.name_ar : r.name_en) },
    { key: 'qty', header: tr('manage.panel.qty'), align: 'end', cell: (r) => formatNumber(r.qty, locale) },
    { key: 'revenue', header: tr('manage.panel.revenue'), align: 'end', cell: (r) => <Money amount={r.revenue} /> },
    { key: 'cost', header: tr('stock.recipe.cost'), align: 'end', cell: (r) => (r.costed ? <Money amount={r.cost} /> : tr('stock.margins.noRecipe')) },
    { key: 'margin', header: tr('stock.recipe.margin'), align: 'end', cell: (r) => <Money amount={r.margin} /> },
  ];
  return (
    <section>
      <h2>{tr('stock.marginsTitle')}</h2>
      <RangePicker state={rs} />
      {q.error ? (
        <ErrorState error={q.error} onRetry={() => void q.refetch()} />
      ) : (
        <>
          <DataTable columns={cols} rows={q.data?.items} rowKey={(r) => r.menu_item_id} caption={tr('stock.marginsTitle')} loading={q.isPending && rs.error === null} />
          {q.data && (
            <p>
              {tr('stock.margins.totals')}: <Money amount={q.data.totals.revenue} /> − <Money amount={q.data.totals.cost} /> = <Money amount={q.data.totals.margin} />
            </p>
          )}
        </>
      )}
    </section>
  );
}
