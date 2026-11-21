// The end-of-day summary printed after close_day.
import { formatIQD, formatNumber, type Locale } from '@rop/i18n';

export interface DaySummary {
  gross: number;
  discounts: number;
  refunds: number;
  net: number;
  cash: number;
  card: number;
  voids_count: number;
  voids_value: number;
  covers: number;
  tabs: number;
  /** Cash movements made during the day. Missing on days closed before they existed. */
  paid_outs?: number;
  pay_ins?: number;
  drops?: number;
}

export interface SummaryLabels {
  gross: string;
  discounts: string;
  refunds: string;
  net: string;
  cash: string;
  card: string;
  voids: string;
  covers: string;
  tabs: string;
  paidOuts: string;
  payIns: string;
  drops: string;
}

const esc = (s: string): string =>
  s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

/** Printable HTML for the day summary; every text is escaped. */
export function summaryHtml(
  date: string,
  s: DaySummary,
  o: { title: string; labels: SummaryLabels; locale: Locale },
): string {
  const money = (n: number) => formatIQD(n, o.locale);
  const rows: [string, string][] = [
    [o.labels.gross, money(s.gross)],
    [o.labels.discounts, money(s.discounts)],
    [o.labels.refunds, money(s.refunds)],
    [o.labels.net, money(s.net)],
    [o.labels.cash, money(s.cash)],
    [o.labels.card, money(s.card)],
    [o.labels.voids, `${formatNumber(s.voids_count, o.locale)} (${money(s.voids_value)})`],
    [o.labels.covers, formatNumber(s.covers, o.locale)],
    [o.labels.tabs, formatNumber(s.tabs, o.locale)],
    [o.labels.paidOuts, money(s.paid_outs ?? 0)],
    [o.labels.payIns, money(s.pay_ins ?? 0)],
    [o.labels.drops, money(s.drops ?? 0)],
  ];
  const dir = o.locale === 'ar' ? 'rtl' : 'ltr';
  return (
    `<!doctype html><html lang="${o.locale}" dir="${dir}"><head><meta charset="utf-8"><title>${esc(o.title)}</title>` +
    `<style>body{font:14px system-ui,sans-serif;margin:1rem}td{padding:2px 8px}td:last-child{text-align:end}</style></head>` +
    `<body><h1>${esc(o.title)}</h1><p>${esc(date)}</p><table>` +
    rows.map(([k, v]) => `<tr><td>${esc(k)}</td><td>${esc(v)}</td></tr>`).join('') +
    `</table></body></html>`
  );
}

// ---- till shift variances (app.shift_variances) ----

export interface ShiftVariance {
  staff_name: string;
  device_id: string;
  opened_at: string;
  closed_at: string | null;
  opening_float: number;
  expected_cash: number | null;
  counted_cash: number | null;
  variance: number | null;
  alert: boolean;
}

const num = (v: unknown): number | null => (typeof v === 'number' && Number.isFinite(v) ? v : null);

/** app.shift_variances returns {from, to, threshold, shifts: [...]}; anything unreadable is an empty list, never a throw. */
export function parseShiftVariances(raw: unknown): ShiftVariance[] {
  const shifts = (raw as { shifts?: unknown } | null)?.shifts;
  const list = Array.isArray(raw) ? raw : Array.isArray(shifts) ? shifts : [];
  const out: ShiftVariance[] = [];
  for (const r of list) {
    if (typeof r !== 'object' || r === null) continue;
    const o = r as Record<string, unknown>;
    if (typeof o.opened_at !== 'string') continue;
    out.push({
      staff_name: typeof o.staff_name === 'string' ? o.staff_name : '',
      device_id: typeof o.device_id === 'string' ? o.device_id : '',
      opened_at: o.opened_at,
      closed_at: typeof o.closed_at === 'string' ? o.closed_at : null,
      opening_float: num(o.opening_float) ?? 0,
      expected_cash: num(o.expected_cash),
      counted_cash: num(o.counted_cash),
      variance: num(o.variance),
      alert: o.alert === true,
    });
  }
  return out;
}

export const alertCount = (rows: readonly ShiftVariance[]): number => rows.filter((r) => r.alert).length;
