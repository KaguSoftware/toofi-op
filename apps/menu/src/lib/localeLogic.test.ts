import { describe, expect, it } from 'vitest';
import { fromAcceptLanguage, negotiateLocale } from './localeLogic';

describe('negotiateLocale', () => {
  it('prefers the cookie', () => {
    expect(negotiateLocale('en', 'ar-IQ,ar;q=0.9')).toBe('en');
    expect(negotiateLocale('ar', 'en-US')).toBe('ar');
  });

  it('falls back to Accept-Language, then Arabic', () => {
    expect(negotiateLocale(undefined, 'en-GB,en;q=0.8')).toBe('en');
    expect(negotiateLocale('fr', 'fr-FR,de;q=0.5')).toBe('ar');
    expect(negotiateLocale(null, null)).toBe('ar');
  });

  it('takes the first supported language in the order listed', () => {
    expect(fromAcceptLanguage('fr-FR, en-US;q=0.8, ar;q=0.9')).toBe('en');
    expect(fromAcceptLanguage('ar-IQ,en;q=0.5')).toBe('ar');
    expect(fromAcceptLanguage('english')).toBeNull();
  });
});
