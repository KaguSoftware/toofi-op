// Pure logic for the reports: shapes of the analytics v2 functions and the small
// calculations the screens need. Nothing here formats text or touches the network.

export interface Pair {
  current: number;
  previous: number;
}
export interface NullablePair {
  current: number | null;
  previous: number | null;
}

export interface Overview {
  from: string;
  to: string;
  prev_from: string;
  prev_to: string;
  weeks_back: number;
  net: Pair;
  covers: Pair;
  tabs: Pair;
  spend_per_cover: Pair;
  item_sales: Pair;
  cogs: Pair;
  food_cost_bps: NullablePair;
  discounts: Pair;
  voids: Pair;
  refunds: Pair;
}

export type ReportTab = 'overview' | 'sales' | 'menu' | 'stock' | 'staff';
export const REPORT_TABS: readonly ReportTab[] = ['overview', 'sales', 'menu', 'stock', 'staff'];

/** Basis points as a percent number: 1780 -> 17.8. */
export const bpsToPercent = (bps: number): number => bps / 100;

export type Trend = { dir: 'up' | 'down' | 'same'; pct: number } | null;

/** Change from the previous figure as a direction and a percent; null when there is nothing to compare with. */
export function trend(p: Pair): Trend {
  if (p.previous === 0) return p.current === 0 ? { dir: 'same', pct: 0 } : null;
  const pct = Math.round(((p.current - p.previous) / Math.abs(p.previous)) * 1000) / 10;
  return { dir: pct > 0 ? 'up' : pct < 0 ? 'down' : 'same', pct: Math.abs(pct) };
}

/** Change between two rates in percentage points (17.8% to 18.8% is +1); null when either is unknown. */
export function pointsTrend(p: NullablePair): { dir: 'up' | 'down' | 'same'; points: number } | null {
  if (p.current === null || p.previous === null) return null;
  const diff = p.current - p.previous;
  // Rounded on the size, so a rise and a fall of the same amount read the same.
  const points = Math.round(Math.abs(diff) / 10) / 10;
  return { dir: points === 0 ? 'same' : diff > 0 ? 'up' : 'down', points };
}

// --- attention ---

export type AttentionKind =
  | 'day_left_open'
  | 'shifts_left_open'
  | 'cash_variance'
  | 'staff_flags'
  | 'low_stock'
  | 'negative_stock'
  | 'uncosted_items'
  | 'price_rises';

export interface AttentionItem {
  kind: AttentionKind;
  count: number;
  value?: number;
  business_date?: string;
  worst?: { staff_name: string; variance: number; closed_at: string };
}

/** Money and control problems are red; things to tidy are amber. Text always says which. */
export const ATTENTION_TONE: Record<AttentionKind, 'danger' | 'warning'> = {
  day_left_open: 'danger',
  shifts_left_open: 'danger',
  cash_variance: 'danger',
  staff_flags: 'danger',
  negative_stock: 'warning',
  low_stock: 'warning',
  price_rises: 'warning',
  uncosted_items: 'warning',
};

/** Where each item is dealt with: a route, or a tab of this screen. */
export const ATTENTION_TARGET: Record<AttentionKind, { to: string } | { tab: ReportTab }> = {
  day_left_open: { to: '/manage/day' },
  shifts_left_open: { to: '/till/shift' },
  cash_variance: { to: '/manage/day' },
  staff_flags: { tab: 'staff' },
  negative_stock: { to: '/stock' },
  low_stock: { to: '/stock' },
  price_rises: { tab: 'stock' },
  uncosted_items: { to: '/stock/recipes' },
};

const ATTENTION_KINDS = Object.keys(ATTENTION_TONE) as AttentionKind[];

/** Known kinds only, red before amber, each group in the fixed order above. */
export function parseAttention(raw: unknown): AttentionItem[] {
  const items = (raw as { items?: unknown } | null)?.items;
  if (!Array.isArray(items)) return [];
  const known = items.filter((i): i is AttentionItem => ATTENTION_KINDS.includes((i as AttentionItem | null)?.kind as AttentionKind));
  const rank = (i: AttentionItem) => (ATTENTION_TONE[i.kind] === 'danger' ? 0 : 100) + ATTENTION_KINDS.indexOf(i.kind);
  return [...known].sort((a, b) => rank(a) - rank(b));
}

// --- menu engineering ---

export type MenuClass = 'star' | 'plowhorse' | 'puzzle' | 'dog' | 'uncosted';
export const MENU_CLASSES: readonly MenuClass[] = ['star', 'plowhorse', 'puzzle', 'dog', 'uncosted'];

export interface MenuItemRow {
  menu_item_id: string;
  name_en: string;
  name_ar: string;
  category_id: string;
  is_active: boolean;
  qty: number;
  revenue: number;
  cost: number;
  margin: number;
  unit_margin: number;
  share_bps: number;
  class: MenuClass;
}
export interface MenuCategory {
  category_id: string;
  name_en: string;
  name_ar: string;
  items: number;
  qty: number;
  revenue: number;
  margin: number;
  avg_unit_margin: number;
  popular_from: number;
}
export interface MenuReport {
  categories: MenuCategory[];
  items: MenuItemRow[];
  counts: Record<MenuClass, number>;
}

/** Items per class, best total margin first; within equal margin the better seller first. */
export function groupByClass(items: readonly MenuItemRow[]): Record<MenuClass, MenuItemRow[]> {
  const out: Record<MenuClass, MenuItemRow[]> = { star: [], plowhorse: [], puzzle: [], dog: [], uncosted: [] };
  for (const i of items) out[i.class]?.push(i);
  for (const c of MENU_CLASSES) out[c].sort((a, b) => b.margin - a.margin || b.qty - a.qty || a.name_en.localeCompare(b.name_en));
  return out;
}

// --- stock ---

export interface StockLossRow {
  ingredient_id: string;
  name_en: string;
  name_ar: string;
  unit: string;
  waste_qty: number;
  waste_value: number;
  missing_qty: number;
  missing_value: number;
  loss_value: number;
  usage_value: number;
  loss_bps: number | null;
}
export interface StockLosses {
  items: StockLossRow[];
  totals: { waste_value: number; missing_value: number; loss_value: number; usage_value: number; loss_bps: number | null };
}
export interface PriceChange {
  ingredient_id: string;
  name_en: string;
  name_ar: string;
  unit: string;
  old_cost: number;
  new_cost: number;
  change_bps: number;
  received_at: string;
  menu_items: { name_en: string; name_ar: string }[];
}

/** A rise of 10% or more is worth a mark; smaller moves and falls are just listed. */
export const PRICE_RISE_ALERT_BPS = 1000;

// --- staff ---

export interface StaffRow {
  staff_id: string;
  full_name: string;
  role: string;
  tabs: number;
  covers: number;
  revenue: number;
  items: number;
  spend_per_cover: number;
  items_per_cover_x100: number;
  payments_taken: number;
  voids_count: number;
  voids_value: number;
  discounts_count: number;
  discounts_value: number;
  refunds_count: number;
  refunds_value: number;
  exception_count: number;
  exception_value: number;
  exception_bps: number | null;
  drawer_opens: number;
  paid_outs_count: number;
  paid_outs_value: number;
  shifts: number;
  cash_variance: number;
  variance_alerts: number;
  flagged: boolean;
}
export interface StaffReport {
  venue_exception_bps: number;
  staff: StaffRow[];
}

/** The three views of the same people; a person appears only where they have something to show. */
export function staffViews(rows: readonly StaffRow[]) {
  return {
    service: rows.filter((r) => r.tabs > 0 || r.revenue !== 0).sort((a, b) => b.revenue - a.revenue),
    exceptions: rows.filter((r) => r.exception_count > 0).sort((a, b) => Number(b.flagged) - Number(a.flagged) || b.exception_value - a.exception_value),
    cash: rows
      .filter((r) => r.shifts > 0 || r.drawer_opens > 0 || r.paid_outs_count > 0)
      .sort((a, b) => b.variance_alerts - a.variance_alerts || Math.abs(b.cash_variance) - Math.abs(a.cash_variance)),
  };
}

// --- weekday and hour ---

export interface HeatCell {
  dow: number;
  hour: number;
  net: number;
  tabs: number;
}
export interface WeekdayHour {
  days: number[];
  cells: HeatCell[];
}
export interface HeatRow {
  dow: number;
  cells: { hour: number; value: number; level: 0 | 1 | 2 | 3 | 4 }[];
}

/** The week starts on Saturday in Iraq. */
export const WEEK_ORDER: readonly number[] = [6, 0, 1, 2, 3, 4, 5];

/** A service day runs past midnight, so the hour axis starts at 06:00 and ends at 05:00. */
export const HOUR_AXIS_START = 6;

/**
 * A weekday by hour grid of average net sales per day of that weekday. Hours run from
 * 06:00 round to 05:00 and are trimmed to the span that had any activity, so an evening
 * that ends after midnight stays in one piece. Levels 1 to 4 are quarters of the busiest
 * cell; 0 is none. Weekdays that do not occur in the range are left out.
 */
export function heatGrid(report: WeekdayHour): { hours: number[]; rows: HeatRow[]; max: number } {
  const active = report.cells.filter((c) => c.net > 0 || c.tabs > 0);
  if (active.length === 0) return { hours: [], rows: [], max: 0 };
  const slot = (hour: number) => (hour - HOUR_AXIS_START + 24) % 24;
  const first = Math.min(...active.map((c) => slot(c.hour)));
  const last = Math.max(...active.map((c) => slot(c.hour)));
  const hours = Array.from({ length: last - first + 1 }, (_, i) => (first + i + HOUR_AXIS_START) % 24);
  const avg = (dow: number, hour: number): number => {
    const cell = report.cells.find((c) => c.dow === dow && c.hour === hour);
    const days = report.days[dow] ?? 0;
    return cell && days > 0 ? Math.max(0, Math.round(cell.net / days)) : 0;
  };
  const dows = WEEK_ORDER.filter((d) => (report.days[d] ?? 0) > 0);
  const max = Math.max(0, ...dows.flatMap((d) => hours.map((h) => avg(d, h))));
  const level = (v: number): 0 | 1 | 2 | 3 | 4 => (v <= 0 || max <= 0 ? 0 : (Math.min(4, Math.ceil((v / max) * 4)) as 1 | 2 | 3 | 4));
  return {
    hours,
    max,
    rows: dows.map((dow) => ({ dow, cells: hours.map((hour) => ({ hour, value: avg(dow, hour), level: level(avg(dow, hour)) })) })),
  };
}

export interface TableTurns {
  areas: { area_id: string; name_en: string; name_ar: string; tables: number; tabs: number; avg_minutes: number }[];
  tabs: number;
  avg_minutes: number;
}
