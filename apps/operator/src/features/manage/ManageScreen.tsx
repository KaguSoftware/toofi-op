import type { ReactElement, ReactNode } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { formatNumber, formatPercent, type Locale, type MessageKey } from '@rop/i18n';
import { Button, DataTable, ErrorState, Loading, Money, type Column } from '../../components';
import { appRpc } from '../../lib/appRpc';
import { useLocale } from '../../lib/i18n';
import { QK } from '../../lib/queryKeys';
import {
  HEADLINE_KEYS,
  changePct,
  dailyCsv,
  type DailyRow,
  type DateRange,
  type Headline,
  type HeadlineKey,
} from './manageLogic';
import { RangePicker, useRangeState, type RangeState } from './RangePicker';
import { downloadText } from './shared';
import './manage.css';

interface DailySales {
  days: (DailyRow & { voids_count: number; payments: number })[];
  totals: Omit<DailyRow, 'date'>;
}
interface Hourly {
  hours: { hour: number; gross: number; net: number; tabs: number }[];
}
interface BestSeller {
  menu_item_id: string;
  name_en: string;
  name_ar: string;
  qty: number;
  revenue: number;
}
interface Waiter {
  staff_id: string;
  full_name: string;
  tabs: number;
  covers: number;
  revenue: number;
  avg_ticket: number;
}
interface PaymentMix {
  methods: { method: 'cash' | 'card'; count: number; payments: number; refunds: number; net: number }[];
}

function useAnalytics<T>(fn: string, range: DateRange, enabled: boolean, extra: Record<string, unknown> = {}) {
  return useQuery({
    queryKey: QK.manage('analytics', fn, range.from, range.to),
    enabled,
    queryFn: () => appRpc<T>(fn as never, { p_from: range.from, p_to: range.to, ...extra }),
  });
}

const COUNT_KEYS: readonly HeadlineKey[] = ['covers', 'tabs'];
// Chart styling reads the CSS tokens, so a theme change recolours charts with no JS.
const TICK = { fill: 'var(--rop-text-muted)', fontSize: 12 };
const CURSOR = { fill: 'var(--rop-surface-2)' };
const BAR_RADIUS: [number, number, number, number] = [3, 3, 0, 0];

function fmtChange(pct: number | null, locale: Locale, tr: (k: MessageKey) => string): string {
  if (pct === null) return tr('manage.panel.noPrevious');
  const sign = pct > 0 ? '+' : pct < 0 ? '−' : '';
  return `${sign}${formatPercent(Math.abs(pct), locale)}%`;
}

function Section({ title, children, actions }: { title: string; children: ReactNode; actions?: ReactNode }) {
  return (
    <section className="manage__section">
      <header className="manage__section-head">
        <h2>{title}</h2>
        {actions}
      </header>
      {children}
    </section>
  );
}

/** A chart with a text summary for assistive tech; the table next to it is the full alternative. */
function ChartBox({ summary, children }: { summary: string; children: ReactElement }) {
  return (
    // Time and value axes read left to right in both languages (docs/DESIGN-RESEARCH.md), so the plot is LTR.
    <div className="manage__chart" role="img" aria-label={summary} dir="ltr">
      <ResponsiveContainer width="100%" height="100%">
        {children}
      </ResponsiveContainer>
    </div>
  );
}

/**
 * The sales report. On its own it carries a title and a range picker; inside the reports
 * screen it is one section and uses the range chosen there (`shared`).
 */
export function ManageScreen({ shared }: { shared?: RangeState } = {}) {
  const { tr, locale } = useLocale();
  const own = useRangeState('last7');
  const rangeState = shared ?? own;
  const { range, error: rangeError } = rangeState;
  const ok = rangeError === null;

  const headline = useAnalytics<Headline>('panel_headline', range, ok);
  const daily = useAnalytics<DailySales>('analytics_daily_sales', range, ok);
  const hourly = useAnalytics<Hourly>('analytics_hourly', range, ok);
  const best = useAnalytics<{ items: BestSeller[] }>('analytics_best_sellers', range, ok, { p_limit: 10 });
  const waiters = useAnalytics<{ waiters: Waiter[] }>('analytics_by_waiter', range, ok);
  const mix = useAnalytics<PaymentMix>('analytics_payment_mix', range, ok);

  const name = (r: { name_en: string; name_ar: string }) => (locale === 'ar' ? r.name_ar : r.name_en);
  const num = (n: number) => formatNumber(n, locale);
  const method = (m: string) => tr(m === 'card' ? 'manage.panel.method_card' : 'manage.panel.method_cash');

  const failed = headline.error ?? daily.error ?? hourly.error ?? best.error ?? waiters.error ?? mix.error;

  const dailyCols: Column<DailySales['days'][number]>[] = [
    { key: 'date', header: tr('manage.panel.date'), cell: (r) => <bdi>{r.date}</bdi> },
    { key: 'gross', header: tr('manage.panel.gross'), align: 'end', cell: (r) => <Money amount={r.gross} /> },
    { key: 'discounts', header: tr('manage.panel.discounts'), align: 'end', cell: (r) => <Money amount={r.discounts} /> },
    { key: 'refunds', header: tr('manage.panel.refunds'), align: 'end', cell: (r) => <Money amount={r.refunds} /> },
    { key: 'net', header: tr('manage.panel.net'), align: 'end', cell: (r) => <Money amount={r.net} /> },
    { key: 'tabs', header: tr('manage.panel.tabs'), align: 'end', cell: (r) => num(r.tabs) },
    { key: 'covers', header: tr('manage.panel.covers'), align: 'end', cell: (r) => num(r.covers) },
  ];
  const hourCols: Column<Hourly['hours'][number]>[] = [
    { key: 'hour', header: tr('manage.panel.hour'), cell: (r) => <bdi>{String(r.hour).padStart(2, '0')}:00</bdi> },
    { key: 'net', header: tr('manage.panel.net'), align: 'end', cell: (r) => <Money amount={r.net} /> },
    { key: 'tabs', header: tr('manage.panel.tabs'), align: 'end', cell: (r) => num(r.tabs) },
  ];
  const bestCols: Column<BestSeller>[] = [
    { key: 'name', header: tr('manage.panel.item'), cell: (r) => name(r) },
    { key: 'qty', header: tr('manage.panel.qty'), align: 'end', cell: (r) => num(r.qty) },
    { key: 'revenue', header: tr('manage.panel.revenue'), align: 'end', cell: (r) => <Money amount={r.revenue} /> },
  ];
  const waiterCols: Column<Waiter>[] = [
    { key: 'name', header: tr('manage.panel.waiter'), cell: (r) => r.full_name },
    { key: 'tabs', header: tr('manage.panel.tabs'), align: 'end', cell: (r) => num(r.tabs) },
    { key: 'covers', header: tr('manage.panel.covers'), align: 'end', cell: (r) => num(r.covers) },
    { key: 'revenue', header: tr('manage.panel.revenue'), align: 'end', cell: (r) => <Money amount={r.revenue} /> },
    { key: 'avg', header: tr('manage.panel.avgTicket'), align: 'end', cell: (r) => <Money amount={r.avg_ticket} /> },
  ];
  const mixCols: Column<PaymentMix['methods'][number]>[] = [
    { key: 'method', header: tr('manage.panel.method'), cell: (r) => method(r.method) },
    { key: 'count', header: tr('manage.panel.count'), align: 'end', cell: (r) => num(r.count) },
    { key: 'payments', header: tr('manage.panel.payments'), align: 'end', cell: (r) => <Money amount={r.payments} /> },
    { key: 'refunds', header: tr('manage.panel.refunds'), align: 'end', cell: (r) => <Money amount={r.refunds} /> },
    { key: 'net', header: tr('manage.panel.net'), align: 'end', cell: (r) => <Money amount={r.net} /> },
  ];

  const dailyTotal = daily.data?.totals.net ?? 0;
  const peak = hourly.data?.hours.reduce((a, h) => (h.net > a.net ? h : a), { hour: 0, gross: 0, net: 0, tabs: 0 });
  const headlineLabel = (k: HeadlineKey) => tr(`manage.panel.h_${k}` as MessageKey);

  return (
    <section className="manage">
      {!shared && (
        <>
          <h1>{tr('manage.title')}</h1>
          <RangePicker state={rangeState} />
        </>
      )}

      {failed ? (
        <ErrorState
          error={failed}
          onRetry={() => {
            void headline.refetch();
            void daily.refetch();
            void hourly.refetch();
            void best.refetch();
            void waiters.refetch();
            void mix.refetch();
          }}
        />
      ) : (
        <>
          <Section title={tr('manage.panel.headline')}>
            <p className="manage__note">{tr('manage.panel.basisNote')}</p>
            {headline.isPending ? (
              <Loading />
            ) : headline.data ? (
              <dl className="manage__cards">
                {HEADLINE_KEYS.map((k) => {
                  const fig = headline.data[k];
                  const pct = changePct(fig.current, fig.previous);
                  const isCount = COUNT_KEYS.includes(k);
                  return (
                    <div key={k} className="manage__card">
                      <dt>{headlineLabel(k)}</dt>
                      <dd className="manage__figure">{isCount ? num(fig.current) : <Money amount={fig.current} />}</dd>
                      <dd className="manage__delta">
                        {tr('manage.panel.previous')} {isCount ? num(fig.previous) : <Money amount={fig.previous} />}
                        {' · '}
                        <bdi>{fmtChange(pct, locale, tr)}</bdi>
                      </dd>
                    </div>
                  );
                })}
              </dl>
            ) : null}
          </Section>

          <Section
            title={tr('manage.panel.dailySales')}
            actions={
              <Button
                disabled={!daily.data || daily.data.days.length === 0}
                onClick={() => daily.data && downloadText(`daily-sales-${range.from}_${range.to}.csv`, dailyCsv(daily.data.days))}
              >
                {tr('manage.panel.exportCsv')}
              </Button>
            }
          >
            {daily.isPending ? (
              <Loading />
            ) : (
              <>
                <ChartBox summary={tr('manage.panel.dailySummary', { days: daily.data?.days.length ?? 0, total: num(dailyTotal) })}>
                  <BarChart data={daily.data?.days ?? []}>
                    <CartesianGrid stroke="var(--rop-border)" vertical={false} />
                    <XAxis dataKey="date" stroke="var(--rop-border)" tickLine={false} tick={TICK} />
                    <YAxis axisLine={false} tickLine={false} tick={TICK} width={72} tickFormatter={(v: number) => num(v)} />
                    <Tooltip cursor={CURSOR} />
                    <Bar dataKey="net" name={tr('manage.panel.net')} fill="var(--rop-chart)" radius={BAR_RADIUS} maxBarSize={44} />
                  </BarChart>
                </ChartBox>
                <details>
                  <summary>{tr('manage.panel.showTable')}</summary>
                  <DataTable columns={dailyCols} rows={daily.data?.days} rowKey={(r) => r.date} caption={tr('manage.panel.dailySales')} />
                </details>
              </>
            )}
          </Section>

          <Section title={tr('manage.panel.hourly')}>
            {hourly.isPending ? (
              <Loading />
            ) : (
              <>
                <ChartBox summary={tr('manage.panel.hourlySummary', { hour: peak?.hour ?? 0, net: num(peak?.net ?? 0) })}>
                  <BarChart data={hourly.data?.hours ?? []}>
                    <CartesianGrid stroke="var(--rop-border)" vertical={false} />
                    <XAxis dataKey="hour" stroke="var(--rop-border)" tickLine={false} tick={TICK} />
                    <YAxis axisLine={false} tickLine={false} tick={TICK} width={72} tickFormatter={(v: number) => num(v)} />
                    <Tooltip cursor={CURSOR} />
                    <Bar dataKey="net" name={tr('manage.panel.net')} fill="var(--rop-chart)" radius={BAR_RADIUS} maxBarSize={44} />
                  </BarChart>
                </ChartBox>
                <details>
                  <summary>{tr('manage.panel.showTable')}</summary>
                  <DataTable columns={hourCols} rows={hourly.data?.hours} rowKey={(r) => String(r.hour)} caption={tr('manage.panel.hourly')} />
                </details>
              </>
            )}
          </Section>

          <Section title={tr('manage.panel.bestSellers')}>
            {best.isPending ? (
              <Loading />
            ) : (
              <>
                <ChartBox summary={tr('manage.panel.bestSummary', { count: best.data?.items.length ?? 0 })}>
                  <BarChart data={(best.data?.items ?? []).map((i) => ({ name: name(i), qty: i.qty }))}>
                    <CartesianGrid stroke="var(--rop-border)" vertical={false} />
                    <XAxis dataKey="name" stroke="var(--rop-border)" tickLine={false} tick={TICK} interval={0} />
                    <YAxis axisLine={false} tickLine={false} tick={TICK} allowDecimals={false} />
                    <Tooltip cursor={CURSOR} />
                    <Bar dataKey="qty" name={tr('manage.panel.qty')} fill="var(--rop-chart)" radius={BAR_RADIUS} maxBarSize={44} />
                  </BarChart>
                </ChartBox>
                <DataTable columns={bestCols} rows={best.data?.items} rowKey={(r) => r.menu_item_id} caption={tr('manage.panel.bestSellers')} />
              </>
            )}
          </Section>

          <Section title={tr('manage.panel.byWaiter')}>
            <DataTable
              columns={waiterCols}
              rows={waiters.data?.waiters}
              rowKey={(r) => r.staff_id}
              caption={tr('manage.panel.byWaiter')}
              loading={waiters.isPending}
            />
          </Section>

          <Section title={tr('manage.panel.paymentMix')}>
            {mix.isPending ? (
              <Loading />
            ) : (
              <>
                <ChartBox summary={(mix.data?.methods ?? []).map((m) => `${method(m.method)}: ${num(m.net)}`).join(', ')}>
                  <BarChart data={(mix.data?.methods ?? []).map((m) => ({ method: method(m.method), net: m.net }))}>
                    <CartesianGrid stroke="var(--rop-border)" vertical={false} />
                    <XAxis dataKey="method" stroke="var(--rop-border)" tickLine={false} tick={TICK} />
                    <YAxis axisLine={false} tickLine={false} tick={TICK} width={72} tickFormatter={(v: number) => num(v)} />
                    <Tooltip cursor={CURSOR} />
                    <Bar dataKey="net" name={tr('manage.panel.net')} fill="var(--rop-chart)" radius={BAR_RADIUS} maxBarSize={44} />
                  </BarChart>
                </ChartBox>
                <DataTable columns={mixCols} rows={mix.data?.methods} rowKey={(r) => r.method} caption={tr('manage.panel.paymentMix')} />
              </>
            )}
          </Section>
        </>
      )}
    </section>
  );
}
