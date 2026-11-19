// Pure logic for staff admin forms and the staff-admin edge function's error shape.
import { STAFF_ROLES, type StaffRole } from '@rop/core';
import type { MessageKey } from '@rop/i18n';

export const MIN_PASSWORD = 8;
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export interface CreateStaffForm {
  email: string;
  password: string;
  fullName: string;
  role: StaffRole | '';
}
export type CreateStaffErrors = Partial<Record<keyof CreateStaffForm, MessageKey>>;

export function validateCreateStaff(f: CreateStaffForm): CreateStaffErrors {
  const e: CreateStaffErrors = {};
  if (!EMAIL.test(f.email.trim())) e.email = 'manage.err.emailInvalid';
  if (f.password.length < MIN_PASSWORD) e.password = 'manage.err.passwordShort';
  if (!f.fullName.trim()) e.fullName = 'manage.err.nameRequired';
  if (!f.role || !(STAFF_ROLES as readonly string[]).includes(f.role)) e.role = 'manage.err.roleRequired';
  return e;
}

/** Server rule: 6 to 12 digits (weak PINs are refused by the server as PIN_WEAK). */
export function validatePin(pin: string): MessageKey | null {
  return /^\d{6,12}$/.test(pin) ? null : 'manage.err.pinFormat';
}

/**
 * functions.invoke puts a non-2xx answer in error.context (a Response) whose body is
 * { error: CODE }. Returns that CODE, or 'UNKNOWN'.
 */
export async function edgeErrorCode(error: unknown): Promise<string> {
  try {
    const ctx = (error as { context?: unknown } | null)?.context;
    if (ctx && typeof (ctx as Response).json === 'function') {
      const body = (await (ctx as Response).json()) as { error?: unknown };
      if (typeof body.error === 'string' && /^[A-Z][A-Z0-9_]*$/.test(body.error)) return body.error;
    }
  } catch {
    /* not JSON: a transport or gateway failure */
  }
  return 'UNKNOWN';
}

/** The variance-alert field: '' leaves the threshold unchanged; otherwise a whole IQD amount, 0 or more. */
export function parseVarianceAlert(text: string): number | 'unset' | 'invalid' {
  const t = text.trim();
  if (t === '') return 'unset';
  return /^\d{1,12}$/.test(t) ? Number(t) : 'invalid';
}
