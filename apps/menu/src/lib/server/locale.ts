import 'server-only';
import { cookies, headers } from 'next/headers';
import type { Locale } from '@rop/i18n';
import { negotiateLocale } from '../localeLogic';
import { LOCALE_COOKIE } from '../securityLogic';

/** The guest's language for this request: the cookie, then Accept-Language, then Arabic. */
export async function requestLocale(): Promise<Locale> {
  const [jar, hdrs] = await Promise.all([cookies(), headers()]);
  return negotiateLocale(jar.get(LOCALE_COOKIE)?.value, hdrs.get('accept-language'));
}
