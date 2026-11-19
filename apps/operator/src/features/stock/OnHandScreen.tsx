import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { DataTable, ErrorState, Money, type Column } from '../../components';
import { useLocale } from '../../lib/i18n';
import { QK } from '../../lib/queryKeys';
import { selectRows } from '../manage/shared';
import { ingredientName } from './stockData';
import { formatQty, type Unit } from './stockLogic';

interface OnHand {
  ingredient_id: string;
  name_en: string;
  name_ar: string;
  unit: Unit;
  reorder_point: number;
  on_hand: number;
  value: number;
  is_active: boolean;
}

const COLS = 'ingredient_id, name_en, name_ar, unit, reorder_point, on_hand, value, is_active';

export function OnHandScreen() {
  const { tr, locale } = useLocale();
  const [lowOnly, setLowOnly] = useState(false);
  // v_low_stock is the server's definition of low (active and on_hand <= reorder_point).
  const q = useQuery({
    queryKey: QK.stock('on-hand', lowOnly ? 'low' : 'all'),
    queryFn: () => selectRows<OnHand>(lowOnly ? 'v_low_stock' : 'v_ingredient_on_hand', COLS, { order: 'name_en' }),
  });

  const cols: Column<OnHand>[] = [
    { key: 'name', header: tr('stock.ingredient'), cell: (r) => ingredientName(r, locale) },
    { key: 'onHand', header: tr('stock.onHandQty'), align: 'end', cell: (r) => formatQty(r.on_hand, r.unit, locale) },
    { key: 'reorder', header: tr('stock.reorderPoint'), align: 'end', cell: (r) => formatQty(r.reorder_point, r.unit, locale) },
    { key: 'value', header: tr('stock.value'), align: 'end', cell: (r) => <Money amount={r.value} /> },
    {
      key: 'status',
      header: tr('manage.menu.status'),
      cell: (r) => (!r.is_active ? tr('manage.inactive') : r.on_hand <= r.reorder_point ? tr('stock.low') : tr('stock.ok')),
    },
  ];

  if (q.error) return <ErrorState error={q.error} onRetry={() => void q.refetch()} />;
  return (
    <section>
      <h2>{tr('stock.onHand')}</h2>
      <label className="manage__row">
        <input type="checkbox" checked={lowOnly} onChange={(e) => setLowOnly(e.target.checked)} />
        {tr('stock.lowOnly')}
      </label>
      <DataTable
        columns={cols}
        rows={q.data}
        rowKey={(r) => r.ingredient_id}
        caption={tr('stock.onHand')}
        loading={q.isPending}
        emptyMessage={tr(lowOnly ? 'stock.noLow' : 'stock.noIngredients')}
      />
    </section>
  );
}
