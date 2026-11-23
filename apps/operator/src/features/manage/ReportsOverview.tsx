import { Link } from '@tanstack/react-router';
import { formatDate, formatIQD, formatNumber, formatPercent, formatWeekdayShort } from '@rop/i18n';
import { Button, DataTable, ErrorState, Loading, Money, type Column } from '../../components';
import { useLocale } from '../../lib/i18n';
import type { DateRange } from './manageLogic';
import { useAttention, useReport } from './reportsData';
import { percentOf, ReportSection, signedIQD } from './reportsKit';
import {
  ATTENTION_TARGET,
  ATTENTION_TONE,
  heatGrid,
  pointsTrend,
  trend,
  type AttentionItem,
  type Overview,
  type Pair,
  type ReportTab,
  type TableTurns,
  type Trend,
  type WeekdayHour,
} from './reportsLogic';

/** A date that falls on the given weekday (0 is Sunday), at midday so the venue time zone cannot move it. */
const weekdayDate = (dow: number) => new Date(Date.UTC(2024, 0, 7 + dow, 9));

export function ReportsOverview({ range, ok, onTab }: { range: DateRange; ok: boolean; onTab: (t: ReportTab) => void }) {
  const { tr, locale } = useLocale();
  const attention = useAttention();
  const overview = useReport<Overview>('analytics_overview', range, ok);
  const heat = useReport<WeekdayHour>('analytics_weekday_hour', range, ok);
  const turns = useReport<TableTurns>('analytics_table_turns', range, ok);

  const pct = (n: number) => formatPercent(n, locale);
  const trendText = (t: Trend): string =>
    t === null ? tr('reports.compare.none') : t.dir === 'same' ? tr('reports.compare.same') : tr(`reports.compare.${t.dir}`, { pct: pct(t.pct) });

  function sentence(i: AttentionItem): string {
    switch (i.kind) {
      case 'day_left_open':
        return tr('reports.attention.day_left_open', { date: i.business_date ? formatDate(new Date(`${i.business_date}T09:00:00Z`), locale) : '' });
      case 'cash_variance':
        return tr('reports.attention.cash_variance', {
          count: i.count,
          value: formatIQD(i.value ?? 0, locale),
          name: i.worst?.staff_name ?? '',
          variance: signedIQD(i.worst?.variance ?? 0, locale),
        });
      default:
        return tr(`reports.attention.${i.kind}`, { count: i.count });
    }
  }

  const o = overview.data;
  const grid = heat.data ? heatGrid(heat.data) : null;
  const food = o ? pointsTrend(o.food_cost_bps) : null;
  const share = (p: Pair) => (o && o.item_sales.current > 0 ? pct(Math.round((p.current / o.item_sales.current) * 1000) / 10) : pct(0));

  const turnCols: Column<TableTurns['areas'][number]>[] = [
    { key: 'area', header: tr('reports.turns.area'), cell: (r) => (locale === 'ar' ? r.name_ar : r.name_en) },
    { key: 'tables', header: tr('reports.turns.tables'), align: 'end', cell: (r) => formatNumber(r.tables, locale) },
    { key: 'tabs', header: tr('reports.turns.tabs'), align: 'end', cell: (r) => formatNumber(r.tabs, locale) },
    { key: 'avg', header: tr('reports.turns.avg'), align: 'end', cell: (r) => (r.tabs > 0 ? tr('reports.turns.minutes', { count: r.avg_minutes }) : '–') },
  ];

  return (
    <>
      <ReportSection title={tr('reports.attention.title')}>
        {attention.isPending ? (
          <Loading />
        ) : attention.isError ? (
          <ErrorState error={attention.error} onRetry={() => void attention.refetch()} />
        ) : attention.data.length === 0 ? (
          <p className="reports__clear">{tr('reports.attention.none')}</p>
        ) : (
          <ul className="reports__attention">
            {attention.data.map((i) => {
              const target = ATTENTION_TARGET[i.kind];
              return (
                <li key={i.kind} data-tone={ATTENTION_TONE[i.kind]}>
                  <span className="reports__attention-text">{sentence(i)}</span>
                  {'to' in target ? (
                    <Link className="rop-btn" to={target.to}>
                      {tr('reports.details')}
                    </Link>
                  ) : (
                    <Button onClick={() => onTab(target.tab)}>{tr('reports.details')}</Button>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </ReportSection>

      <ReportSection
        title={tr('reports.figures.title')}
        hint={o ? tr(o.weeks_back === 1 ? 'reports.compare.weeks_1' : 'reports.compare.weeks_n', { count: o.weeks_back }) : undefined}
      >
        {overview.isError ? (
          <ErrorState error={overview.error} onRetry={() => void overview.refetch()} />
        ) : !o ? (
          <Loading />
        ) : (
          <>
            <dl className="manage__cards">
              <div className="manage__card">
                <dt>{tr('reports.figures.net')}</dt>
                <dd className="manage__figure">
                  <Money amount={o.net.current} />
                </dd>
                <dd className="manage__delta">
                  {trendText(trend(o.net))} · {tr('reports.compare.was', { value: formatIQD(o.net.previous, locale) })}
                </dd>
              </div>
              <div className="manage__card">
                <dt>{tr('reports.figures.covers')}</dt>
                <dd className="manage__figure">{formatNumber(o.covers.current, locale)}</dd>
                <dd className="manage__delta">
                  {trendText(trend(o.covers))} · {tr('reports.compare.was', { value: formatNumber(o.covers.previous, locale) })}
                </dd>
              </div>
              <div className="manage__card">
                <dt>{tr('reports.figures.spend')}</dt>
                <dd className="manage__figure">
                  <Money amount={o.spend_per_cover.current} />
                </dd>
                <dd className="manage__delta">
                  {trendText(trend(o.spend_per_cover))} · {tr('reports.compare.was', { value: formatIQD(o.spend_per_cover.previous, locale) })}
                </dd>
              </div>
              <div className="manage__card">
                <dt>{tr('reports.figures.foodCost')}</dt>
                <dd className="manage__figure">
                  {o.food_cost_bps.current === null ? <span className="reports__unknown">{tr('reports.figures.noFoodCost')}</span> : <bdi>{percentOf(o.food_cost_bps.current, locale)}</bdi>}
                </dd>
                <dd className="manage__delta">
                  {food === null
                    ? tr('reports.compare.none')
                    : food.dir === 'same'
                      ? tr('reports.compare.same')
                      : tr(food.dir === 'up' ? 'reports.compare.pointsUp' : 'reports.compare.pointsDown', { points: pct(food.points) })}
                </dd>
              </div>
            </dl>
            <p className="manage__note reports__footnote">{tr('reports.figures.foodCostHint')}</p>

            <h3 className="reports__subhead">{tr('reports.figures.leakTitle')}</h3>
            <dl className="reports__leak">
              {(['discounts', 'voids', 'refunds'] as const).map((k) => (
                <div key={k}>
                  <dt>{tr(`reports.figures.${k}`)}</dt>
                  <dd>
                    <Money amount={o[k].current} />
                  </dd>
                  <dd className="manage__delta">{tr('reports.figures.ofSales', { pct: share(o[k]) })}</dd>
                </div>
              ))}
            </dl>
          </>
        )}
      </ReportSection>

      <ReportSection title={tr('reports.heat.title')} hint={tr('reports.heat.hint')}>
        {heat.isError ? (
          <ErrorState error={heat.error} onRetry={() => void heat.refetch()} />
        ) : !grid ? (
          <Loading />
        ) : grid.rows.length === 0 ? (
          <p className="reports__clear">{tr('reports.heat.none')}</p>
        ) : (
          // Hours are a time axis: left to right in both languages, like the charts.
          <div className="reports__heat rop-table-wrap" dir="ltr">
            <table>
              <caption className="rop-sr-only">{tr('reports.heat.caption')}</caption>
              <thead>
                <tr>
                  <th scope="col">
                    <span className="rop-sr-only">{tr('reports.heat.day')}</span>
                  </th>
                  {grid.hours.map((h) => (
                    <th key={h} scope="col">
                      {String(h).padStart(2, '0')}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {grid.rows.map((row) => (
                  <tr key={row.dow}>
                    <th scope="row">{formatWeekdayShort(weekdayDate(row.dow), locale)}</th>
                    {row.cells.map((c) => (
                      <td key={c.hour} data-level={c.level} title={formatIQD(c.value, locale)}>
                        <span className="rop-sr-only">{formatIQD(c.value, locale)}</span>
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </ReportSection>

      <ReportSection title={tr('reports.turns.title')} hint={tr('reports.turns.hint')}>
        {turns.isError ? (
          <ErrorState error={turns.error} onRetry={() => void turns.refetch()} />
        ) : turns.data && turns.data.tabs === 0 ? (
          <p className="reports__clear">{tr('reports.turns.none')}</p>
        ) : (
          <DataTable columns={turnCols} rows={turns.data?.areas} rowKey={(r) => r.area_id} caption={tr('reports.turns.title')} loading={turns.isPending} />
        )}
      </ReportSection>
    </>
  );
}
