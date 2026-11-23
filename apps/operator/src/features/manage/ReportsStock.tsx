import { formatNumber, formatPercent } from '@rop/i18n';
import { DataTable, ErrorState, Money, type Column } from '../../components';
import { useLocale } from '../../lib/i18n';
import type { DateRange } from './manageLogic';
import { useReport } from './reportsData';
import { percentOf, ReportSection, SignedMoney } from './reportsKit';
import { PRICE_RISE_ALERT_BPS, type PriceChange, type StockLossRow, type StockLosses } from './reportsLogic';

/** Where stock goes missing, and which supplier prices moved. */
export function ReportsStock({ range, ok }: { range: DateRange; ok: boolean }) {
  const { tr, locale } = useLocale();
  const losses = useReport<StockLosses>('analytics_stock_losses', range, ok);
  const prices = useReport<{ items: PriceChange[] }>('analytics_price_changes', range, ok);

  const name = (r: { name_en: string; name_ar: string }) => (locale === 'ar' ? r.name_ar : r.name_en);
  const qty = (n: number, unit: string) => (
    <bdi>
      {formatNumber(n, locale)} {unit}
    </bdi>
  );

  const lossCols: Column<StockLossRow>[] = [
    { key: 'ing', header: tr('reports.stock.ingredient'), cell: name },
    {
      key: 'waste',
      header: tr('reports.stock.waste'),
      align: 'end',
      cell: (r) => (r.waste_qty === 0 ? '–' : <>{qty(r.waste_qty, r.unit)} · <Money amount={r.waste_value} /></>),
    },
    {
      key: 'missing',
      header: tr('reports.stock.missing'),
      align: 'end',
      cell: (r) =>
        r.missing_qty === 0 ? (
          '–'
        ) : r.missing_qty < 0 ? (
          <>{qty(-r.missing_qty, r.unit)} {tr('reports.stock.surplus')}</>
        ) : (
          <>{qty(r.missing_qty, r.unit)} · <Money amount={r.missing_value} /></>
        ),
    },
    { key: 'loss', header: tr('reports.stock.loss'), align: 'end', cell: (r) => <strong><SignedMoney amount={r.loss_value} /></strong> },
    { key: 'share', header: tr('reports.stock.ofUsage'), align: 'end', cell: (r) => <bdi>{percentOf(r.loss_bps, locale)}</bdi> },
  ];

  const cost = (n: number, unit: string) => (
    <bdi>
      {formatNumber(n, locale)} / {unit}
    </bdi>
  );
  const priceCols: Column<PriceChange>[] = [
    { key: 'ing', header: tr('reports.stock.ingredient'), cell: name },
    { key: 'was', header: tr('reports.stock.was'), align: 'end', cell: (r) => cost(r.old_cost, r.unit) },
    { key: 'now', header: tr('reports.stock.now'), align: 'end', cell: (r) => cost(r.new_cost, r.unit) },
    {
      key: 'change',
      header: tr('reports.stock.change'),
      align: 'end',
      cell: (r) => (
        <>
          {r.change_bps >= PRICE_RISE_ALERT_BPS && (
            <span className="rop-badge" data-tone="danger">
              {tr('reports.stock.rise')}
            </span>
          )}{' '}
          <bdi>
            {r.change_bps > 0 ? '+' : '−'}
            {formatPercent(Math.abs(r.change_bps) / 100, locale)}%
          </bdi>
        </>
      ),
    },
    { key: 'used', header: tr('reports.stock.usedIn'), cell: (r) => (r.menu_items.length === 0 ? '–' : r.menu_items.map(name).join(locale === 'ar' ? '، ' : ', ')) },
  ];

  const t = losses.data?.totals;
  return (
    <>
      <ReportSection title={tr('reports.stock.lossTitle')} hint={tr('reports.stock.lossHint')}>
        {losses.isError ? (
          <ErrorState error={losses.error} onRetry={() => void losses.refetch()} />
        ) : (
          <>
            {t && losses.data && losses.data.items.length > 0 && (
              <p className="reports__total">
                {tr('reports.stock.total')}: <strong><SignedMoney amount={t.loss_value} /></strong>
                {t.loss_bps !== null && <> · {tr('reports.stock.ofUsage')}: <bdi>{percentOf(t.loss_bps, locale)}</bdi></>}
              </p>
            )}
            <DataTable
              columns={lossCols}
              rows={losses.data?.items}
              rowKey={(r) => r.ingredient_id}
              caption={tr('reports.stock.lossTitle')}
              loading={losses.isPending}
              emptyMessage={tr('reports.stock.none')}
            />
          </>
        )}
      </ReportSection>

      <ReportSection title={tr('reports.stock.priceTitle')} hint={tr('reports.stock.priceHint')}>
        {prices.isError ? (
          <ErrorState error={prices.error} onRetry={() => void prices.refetch()} />
        ) : (
          <DataTable
            columns={priceCols}
            rows={prices.data?.items}
            rowKey={(r) => r.ingredient_id}
            caption={tr('reports.stock.priceTitle')}
            loading={prices.isPending}
            emptyMessage={tr('reports.stock.priceNone')}
          />
        )}
      </ReportSection>
    </>
  );
}
