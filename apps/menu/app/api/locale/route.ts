import type { NextRequest, NextResponse } from 'next/server';
import { fail, guard, isDev, ok, readJson } from '@/lib/server/respond';
import { parseLocaleBody } from '@/lib/requestLogic';
import { LOCALE_COOKIE, localeCookieOptions } from '@/lib/securityLogic';

/** POST /api/locale {locale} → sets the `rop-locale` cookie. */
export async function POST(req: NextRequest): Promise<NextResponse> {
  const blocked = guard(req);
  if (blocked) return blocked;
  const body = parseLocaleBody(await readJson(req));
  if (!body) return fail('INVALID_ARGUMENT');
  const res = ok({ locale: body.locale });
  res.cookies.set(LOCALE_COOKIE, body.locale, localeCookieOptions(isDev));
  return res;
}
