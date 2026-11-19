// Pure: reading app.verify_manager_pin's answer and validating the form.

export type PinResult = { ok: true; authorizedBy: string | null } | { ok: false; code: string };

/** `{ok:true, authorized_by}` or `{ok:false, code}`; anything unreadable is a failure. */
export function parsePinResult(raw: unknown): PinResult {
  const o = (typeof raw === 'object' && raw !== null ? raw : {}) as Record<string, unknown>;
  if (o.ok === true) {
    return { ok: true, authorizedBy: typeof o.authorized_by === 'string' ? o.authorized_by : null };
  }
  return { ok: false, code: typeof o.code === 'string' ? o.code : 'UNKNOWN' };
}

export function pinFormReady(pin: string, reason: string, reasonRequired: boolean): boolean {
  return pin.trim().length > 0 && (!reasonRequired || reason.trim().length > 0);
}
