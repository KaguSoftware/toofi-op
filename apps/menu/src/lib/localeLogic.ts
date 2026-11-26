import type { Locale } from '@rop/i18n';

/** Arabic unless the guest chose English or the phone asks for it (owner decision). */
export const DEFAULT_LOCALE: Locale = 'ar';

export function asLocale(value: unknown): Locale | null {
  return value === 'en' || value === 'ar' ? value : null;
}

/** The first of our languages the Accept-Language header names, in the order it lists them. */
export function fromAcceptLanguage(header: string | null | undefined): Locale | null {
  for (const part of (header ?? '').split(',')) {
    const tag = part.split(';')[0]?.trim().toLowerCase() ?? '';
    if (tag === 'en' || tag.startsWith('en-')) return 'en';
    if (tag === 'ar' || tag.startsWith('ar-')) return 'ar';
  }
  return null;
}

/** The `rop-locale` cookie, then Accept-Language, then Arabic. No locale in the path. */
export function negotiateLocale(cookie: string | null | undefined, acceptLanguage: string | null | undefined): Locale {
  return asLocale(cookie) ?? fromAcceptLanguage(acceptLanguage) ?? DEFAULT_LOCALE;
}
