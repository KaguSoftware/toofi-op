import 'server-only';
import { NextResponse, type NextRequest } from 'next/server';
import { guestResultOf, httpStatusOf, type GuestResult } from '../guestErrorLogic';
import { MAX_BODY_BYTES } from '../requestLogic';
import { NO_STORE, TABLE_COOKIE, hasGuestHeader, isUuid } from '../securityLogic';

export const isDev = process.env.NODE_ENV !== 'production';

/** Every /api answer: JSON, never stored. */
export function json(body: unknown, status = 200): NextResponse {
  return NextResponse.json(body, { status, headers: { 'Cache-Control': NO_STORE } });
}

export function ok(data: unknown): NextResponse {
  return json({ ok: true, data });
}

/** A refusal the UI can act on. An expired session also loses its cookie. */
export function fail(code: string | null, result: GuestResult = guestResultOf(code), status = httpStatusOf(result, code)): NextResponse {
  const res = json({ ok: false, result, code }, status);
  if (result === 'expired') res.cookies.delete(TABLE_COOKIE);
  return res;
}

/** Refuse a call without our header (a cross-site form cannot add it), or an oversized body. */
export function guard(req: NextRequest): NextResponse | null {
  if (!hasGuestHeader(req.headers)) return fail('FORBIDDEN', 'error', 403);
  const length = Number(req.headers.get('content-length') ?? '0');
  if (length > MAX_BODY_BYTES) return fail('INVALID_ARGUMENT', 'error', 413);
  return null;
}

export async function readJson(req: NextRequest): Promise<unknown> {
  try {
    const text = await req.text();
    return text.length > MAX_BODY_BYTES ? null : JSON.parse(text);
  } catch {
    return null;
  }
}

/** The session id from the cookie, when it is one. */
export function sessionOf(req: NextRequest): string | null {
  const value = req.cookies.get(TABLE_COOKIE)?.value;
  return isUuid(value) ? value : null;
}
