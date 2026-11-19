// Pure logic for the management panel: business-date ranges, change percentages, CSV.
// Business dates are calendar dates in the venue zone (Asia/Baghdad, no DST), never UTC.
import { VENUE_TZ } from '@rop/i18n';

export type Preset = 'today' | 'yesterday' | 'last7' | 'month' | 'custom';
export const PRESETS: readonly Preset[] = ['today', 'yesterday', 'last7', 'month', 'custom'];

export interface DateRange {
  from: string;
  to: string;
}

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
/** The analytics functions refuse a span over 366 days (INVALID_RANGE). */
export const MAX_RANGE_DAYS = 366;

/** 'YYYY-MM-DD' of `now` in the venue time zone. */
export function businessDate(now: Date, timeZone: string = VENUE_TZ): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(now);
}

function toUtc(date: string): Date {
  const [y = 0, m = 1, d = 1] = date.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d));
}

export function addDays(date: string, n: number): string {
  const d = toUtc(date);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

/** Days from `from` to `to`, inclusive. */
export function rangeDays(r: DateRange): number {
  return Math.round((toUtc(r.to).getTime() - toUtc(r.from).getTime()) / 86_400_000) + 1;
}

/** The range a preset stands for at `now`. 'custom' starts at today..today. */
export function presetRange(preset: Preset, now: Date): DateRange {
  const today = businessDate(now);
  switch (preset) {
    case 'yesterday': {
      const y = addDays(today, -1);
      return { from: y, to: y };
    }
    case 'last7':
      return { from: addDays(today, -6), to: today };
    case 'month':
      return { from: `${today.slice(0, 8)}01`, to: today };
    default:
      return { from: today, to: today };
  }
}

export type RangeError = 'invalid' | 'order' | 'tooLong';

export function validateRange(r: DateRange): RangeError | null {
  if (!DATE_RE.test(r.from) || !DATE_RE.test(r.to)) return 'invalid';
  if (r.to < r.from) return 'order';
  if (rangeDays(r) > MAX_RANGE_DAYS) return 'tooLong';
  return null;
}

/**
 * Percent change from `previous` to `current`, rounded to one decimal.
 * A previous value of 0 has no meaningful percentage: null, except 0 -> 0 which is 0.
 */
export function changePct(current: number, previous: number): number | null {
  if (previous === 0) return current === 0 ? 0 : null;
  return Math.round(((current - previous) / Math.abs(previous)) * 1000) / 10;
}

export interface DailyRow {
  date: string;
  gross: number;
  discounts: number;
  voids: number;
  refunds: number;
  net: number;
  cash: number;
  card: number;
  tabs: number;
  covers: number;
}

export const DAILY_CSV_COLUMNS = [
  'date',
  'gross',
  'discounts',
  'voids',
  'refunds',
  'net',
  'cash',
  'card',
  'tabs',
  'covers',
] as const;

function csvCell(v: string | number): string {
  const s = String(v);
  return /[",\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

/** RFC 4180 CSV of the daily table: header row, one row per day, CRLF line ends. */
export function dailyCsv(days: readonly DailyRow[]): string {
  const lines: string[] = [DAILY_CSV_COLUMNS.join(',')];
  for (const d of days) lines.push(DAILY_CSV_COLUMNS.map((c) => csvCell(d[c])).join(','));
  return lines.join('\r\n') + '\r\n';
}

export interface HeadlineFigure {
  current: number;
  previous: number;
}
export const HEADLINE_KEYS = ['revenue', 'covers', 'tabs', 'avg_ticket', 'discounts', 'voids', 'refunds'] as const;
export type HeadlineKey = (typeof HEADLINE_KEYS)[number];
export type Headline = Record<HeadlineKey, HeadlineFigure> & {
  from: string;
  to: string;
  prev_from: string;
  prev_to: string;
};
