import { expect, type Page, type BrowserContext } from '@playwright/test';
import { PASSWORD, ROLES, type Role } from './db';

export type Lang = 'en' | 'ar';

/** Fix the app locale before any page script runs. */
export async function setLang(ctx: BrowserContext | Page, lang: Lang): Promise<void> {
  await ctx.addInitScript((l) => {
    try {
      localStorage.setItem('rop.locale', l);
    } catch {
      /* ignore */
    }
  }, lang);
}

export async function signIn(page: Page, role: Role | { email: string }, password = PASSWORD): Promise<void> {
  const email = typeof role === 'string' ? ROLES[role].email : role.email;
  await page.goto('/login');
  await page.locator('input[type=email]').fill(email);
  await page.locator('input[type=password]').fill(password);
  await page.locator('form button[type=submit]').click();
  await expect(page.locator('nav.rop-nav')).toBeVisible();
}

export async function signOut(page: Page): Promise<void> {
  await page.locator('header.rop-topbar button').last().click();
  await expect(page.locator('input[type=email]')).toBeVisible();
}

/** Enter a manager PIN (and a reason, where the dialog asks) and submit the open dialog. */
export async function enterPin(page: Page, pin: string, reason?: string): Promise<void> {
  const dlg = page.locator('dialog[open]').last();
  await dlg.locator('input[type=password]').fill(pin);
  if (reason !== undefined) await dlg.locator('input[type=text]').fill(reason);
  await dlg.locator('button[type=submit]').click();
}

/** Locale-independent money text to digits: "12,500 IQD" / Arabic-Indic digits -> 12500. */
export function digits(text: string): number {
  const ascii = text.replace(/[٠-٩]/g, (d) => String(d.charCodeAt(0) - 0x660)).replace(/[۰-۹]/g, (d) => String(d.charCodeAt(0) - 0x6f0));
  return Number(ascii.replace(/[^0-9]/g, ''));
}

/** Type a whole-IQD number on the AmountPad inside `scope`, one digit key at a time. */
export async function typeOnPad(scope: import('@playwright/test').Locator, n: number): Promise<void> {
  await scope.locator('.rop-pad button').filter({ hasText: /^C|Clear|مسح/ }).first().click().catch(() => undefined);
  for (const d of String(n)) await scope.locator('.rop-pad__keys button', { hasText: new RegExp(`^${d}$`) }).click();
}

/** Capture what the app sends to window.print (the browser fallback of printReceipt). */
export async function stubPrint(ctx: BrowserContext): Promise<void> {
  await ctx.addInitScript(() => {
    const w = window as unknown as { __printed?: string[] };
    const top = window.top as unknown as { __printed?: string[] };
    top.__printed ??= [];
    w.__printed ??= top.__printed;
    window.print = () => {
      top.__printed?.push(document.documentElement.outerHTML);
    };
  });
}

/** The page is laid out right to left and shows no untranslated message key (a dotted id like "tab.sent"). */
export async function expectArabicChrome(page: Page): Promise<void> {
  await expect(page.locator('html')).toHaveAttribute('dir', 'rtl');
  await expect(page.locator('html')).toHaveAttribute('lang', 'ar');
  const text = await page.locator('body').innerText();
  const leaked = text.match(/\b(?:auth|common|floor|tab|till|manage|stock|nav|errors)\.[A-Za-z_][A-Za-z0-9_.]*/g);
  expect(leaked, `message keys shown instead of text: ${String(leaked)}`).toBeNull();
}
