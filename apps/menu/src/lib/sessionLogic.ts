/**
 * The table session, as the guest site's server reads it from `app.open_table_session` and
 * `app.guest_status`. The session id is the guest's bearer credential: it lives in the
 * HttpOnly `rop-table` cookie and is never put in a page or a response body.
 */
import { isUuid } from './securityLogic';

/** What a page needs about the table it is bound to. */
export interface TableBinding {
  tableLabel: string;
  dayOpen: boolean;
  callsEnabled: boolean;
  ordersEnabled: boolean;
}

type Row = Record<string, unknown>;
const isRow = (v: unknown): v is Row => typeof v === 'object' && v !== null && !Array.isArray(v);

/** The session id from `open_table_session`, or null when the answer has none. */
export function sessionIdOf(data: unknown): string | null {
  return isRow(data) && isUuid(data.session_id) ? data.session_id : null;
}

/** `guest_status` read for the page: the table label and the switches. */
export function parseBinding(data: unknown): TableBinding | null {
  if (!isRow(data) || typeof data.table_label !== 'string') return null;
  return {
    tableLabel: data.table_label,
    dayOpen: data.day_open === true,
    callsEnabled: data.calls_enabled === true,
    ordersEnabled: data.orders_enabled === true,
  };
}

/** Removes any key that could carry a credential before a database answer is sent on. */
export function withoutSecrets<T>(data: T): T {
  if (Array.isArray(data)) return data.map(withoutSecrets) as T;
  if (!isRow(data)) return data;
  const out: Row = {};
  for (const [k, v] of Object.entries(data)) {
    if (k === 'session_id' || k === 'guest_session_id' || k === 'token') continue;
    out[k] = withoutSecrets(v);
  }
  return out as T;
}
