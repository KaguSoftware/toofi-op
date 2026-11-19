// Till reads. Writes go through appRpc in the screens. RLS lets any active staff read
// these tables; the totals come from the server (v_open_tabs, compute_tab_totals).
import { appRpc } from '../../lib/appRpc';
import { supabase } from '../../lib/supabase';
import type { ReceiptSettings } from './receiptLogic';
import { parseShiftStatus, parseTotals, startOfBusinessDay, type Method, type ShiftStatus, type Totals } from './tillLogic';

export interface OpenTab {
  tabId: string;
  tableLabel: string | null;
  openedAt: string;
  waiterName: string | null;
  total: number;
  due: number;
}

export interface SettledTab {
  tabId: string;
  tableLabel: string | null;
  closedAt: string;
}

export interface BillLine {
  id: string;
  nameEn: string;
  nameAr: string;
  qty: number;
  unitPrice: number;
  lineTotal: number;
  voided: boolean;
}

export interface BillPayment {
  id: string;
  method: Method;
  amount: number;
  tendered: number | null;
  change: number;
  createdAt: string;
  refunded: number;
}

export interface Bill {
  tabId: string;
  status: 'open' | 'settled' | 'void';
  tableLabel: string | null;
  openedAt: string;
  closedAt: string | null;
  lines: BillLine[];
  payments: BillPayment[];
  totals: Totals;
}

export interface OpenShift {
  shiftId: string;
  staffId: string;
  staffName: string;
  deviceId: string;
  openedAt: string;
  openingFloat: number;
}

type Row = Record<string, unknown>;

async function rows(q: PromiseLike<{ data: unknown; error: { message: string; code?: string } | null }>): Promise<Row[]> {
  const { data, error } = await q;
  if (error) throw Object.assign(new Error(error.message), { code: error.code });
  return (data ?? []) as Row[];
}

const str = (v: unknown): string => (typeof v === 'string' ? v : '');
const n = (v: unknown): number => (typeof v === 'number' ? v : Number(v ?? 0) || 0);
const labelOf = (v: unknown): string | null => {
  const t = Array.isArray(v) ? v[0] : v;
  return t && typeof t === 'object' ? str((t as Row).label) || null : null;
};

export async function fetchOpenTabs(): Promise<OpenTab[]> {
  const data = await rows(
    supabase
      .from('v_open_tabs')
      .select('tab_id, table_label, opened_at, waiter_name, total, due')
      .order('opened_at', { ascending: true }),
  );
  return data.map((r) => ({
    tabId: str(r.tab_id),
    tableLabel: str(r.table_label) || null,
    openedAt: str(r.opened_at),
    waiterName: str(r.waiter_name) || null,
    total: n(r.total),
    due: n(r.due),
  }));
}

export async function fetchSettledToday(): Promise<SettledTab[]> {
  const since = startOfBusinessDay(new Date()).toISOString();
  const data = await rows(
    supabase
      .from('tabs')
      .select('id, closed_at, dining_tables(label)')
      .eq('status', 'settled')
      .gte('closed_at', since)
      .order('closed_at', { ascending: false }),
  );
  return data.map((r) => ({ tabId: str(r.id), tableLabel: labelOf(r.dining_tables), closedAt: str(r.closed_at) }));
}

export async function fetchBill(tabId: string): Promise<Bill> {
  const [tabRows, lineRows, payRows, refundRows, totals] = await Promise.all([
    rows(supabase.from('tabs').select('id, status, opened_at, closed_at, dining_tables(label)').eq('id', tabId)),
    rows(
      supabase
        .from('order_items')
        .select('id, name_en, name_ar, qty, unit_price, line_total, voided_at')
        .eq('tab_id', tabId)
        .order('created_at', { ascending: true }),
    ),
    rows(
      supabase
        .from('payments')
        .select('id, method, amount, tendered, change, created_at')
        .eq('tab_id', tabId)
        .order('created_at', { ascending: true }),
    ),
    rows(supabase.from('refunds').select('payment_id, amount').eq('tab_id', tabId)),
    appRpc('compute_tab_totals', { p_tab_id: tabId }),
  ]);
  const tab = tabRows[0];
  if (!tab) throw Object.assign(new Error('TAB_NOT_FOUND'), { code: 'TAB_NOT_FOUND' });
  const refundedBy = new Map<string, number>();
  for (const r of refundRows) refundedBy.set(str(r.payment_id), (refundedBy.get(str(r.payment_id)) ?? 0) + n(r.amount));
  const status = str(tab.status);
  return {
    tabId,
    status: status === 'settled' ? 'settled' : status === 'void' ? 'void' : 'open',
    tableLabel: labelOf(tab.dining_tables),
    openedAt: str(tab.opened_at),
    closedAt: str(tab.closed_at) || null,
    lines: lineRows.map((r) => ({
      id: str(r.id),
      nameEn: str(r.name_en),
      nameAr: str(r.name_ar),
      qty: n(r.qty),
      unitPrice: n(r.unit_price),
      lineTotal: n(r.line_total),
      voided: r.voided_at != null,
    })),
    payments: payRows.map((r) => ({
      id: str(r.id),
      method: r.method === 'card' ? 'card' : 'cash',
      amount: n(r.amount),
      tendered: r.tendered == null ? null : n(r.tendered),
      change: n(r.change),
      createdAt: str(r.created_at),
      refunded: refundedBy.get(str(r.id)) ?? 0,
    })),
    totals: parseTotals(totals),
  };
}

export async function fetchReceiptSettings(): Promise<ReceiptSettings | null> {
  const { data, error } = await supabase
    .from('venue_settings')
    .select('receipt_header_en, receipt_header_ar, receipt_footer_en, receipt_footer_ar')
    .maybeSingle();
  if (error) throw Object.assign(new Error(error.message), { code: error.code });
  return data as ReceiptSettings | null;
}

export async function fetchShiftStatus(deviceId: string): Promise<ShiftStatus> {
  return parseShiftStatus(await appRpc('till_shift_status', { p_device_id: deviceId }));
}

/** Open shifts this person may see: their own, and everyone's for a manager. */
export async function fetchOpenShifts(): Promise<OpenShift[]> {
  const data = await rows(
    supabase
      .from('till_shifts')
      .select('id, staff_id, device_id, opened_at, opening_float, staff:staff!till_shifts_staff_id_fkey(full_name)')
      .is('closed_at', null)
      .order('opened_at', { ascending: true }),
  );
  return data.map((r) => {
    const s = Array.isArray(r.staff) ? r.staff[0] : r.staff;
    return {
      shiftId: str(r.id),
      staffId: str(r.staff_id),
      staffName: s && typeof s === 'object' ? str((s as Row).full_name) : '',
      deviceId: str(r.device_id),
      openedAt: str(r.opened_at),
      openingFloat: n(r.opening_float),
    };
  });
}
