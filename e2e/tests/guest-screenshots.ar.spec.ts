/**
 * Screenshots of the guest site for the design docs: docs/screenshots/guest/<name>.png at a
 * 390 x 844 phone, in the light and dark sets and in English and Arabic. The `.ar.spec.ts`
 * name runs it once, in the Arabic project, and it makes its own phones for every language
 * and colour scheme. Dishes have no photos in the seed, so rows show the category icon tile.
 */
import path from 'node:path';
import { expect, test, type Browser, type Page } from '@playwright/test';
import { makeT, type Locale } from '../../packages/i18n/src';
import { MENU_URL } from '../playwright.config';
import { clientAs, openDay, resetDb, rpc, sql } from '../support/db';

test.describe.configure({ mode: 'serial' });

const OUT = path.resolve(__dirname, '../../docs/screenshots/guest');
let token = '';

test.beforeAll(async () => {
  await resetDb();
  await openDay();
  const owner = await clientAs('owner');
  const codes = await rpc<{ label: string; token: string }[]>(owner, 'table_qr_tokens');
  token = codes.find((c) => c.label === 'T5')!.token;
});

async function phone(browser: Browser, lang: Locale, scheme: 'light' | 'dark'): Promise<Page> {
  const ctx = await browser.newContext({
    baseURL: MENU_URL,
    locale: lang === 'ar' ? 'ar-IQ' : 'en-US',
    colorScheme: scheme,
    reducedMotion: 'reduce',
    viewport: { width: 390, height: 844 },
    deviceScaleFactor: 2,
  });
  const page = await ctx.newPage();
  await page.goto(`/t/${token}`);
  await expect(page.getByRole('img', { name: makeT(lang)('guest.table.label', { label: 'T5' }) })).toBeVisible();
  await page.evaluate(() => document.fonts.ready);
  return page;
}

async function addDishes(page: Page, lang: Locale): Promise<void> {
  const tr = makeT(lang);
  const col = lang === 'ar' ? 'name_ar' : 'name_en';
  const names = await sql<{ n: string }>(`select ${col} as n from menu_items where name_en in ('Hummus', 'Iraqi Tea') order by name_en`);
  const [hummus, tea] = [names[0]!.n, names[1]!.n];
  const add = (n: string) => page.getByRole('button', { name: tr('guest.item.add', { name: n }) });
  await add(hummus).click();
  await add(hummus).click();
  await add(tea).click();
}

async function shot(page: Page, name: string): Promise<void> {
  await page.waitForTimeout(300);
  await page.screenshot({ path: path.join(OUT, `${name}.png`), animations: 'disabled' });
}

for (const [lang, scheme] of [['en', 'light'], ['en', 'dark'], ['ar', 'light'], ['ar', 'dark']] as const) {
  test(`guest menu, order and call: ${lang} ${scheme}`, async ({ browser }) => {
    const tr = makeT(lang);
    const page = await phone(browser, lang, scheme);
    const suffix = lang === 'ar' ? `ar-${scheme}` : scheme;
    await shot(page, `menu-${suffix}`);

    await addDishes(page, lang);
    await shot(page, `menu-with-order-${suffix}`);

    await page.locator('.bar__order').click();
    await expect(page.getByRole('button', { name: tr('guest.order.send') })).toBeVisible();
    await shot(page, `order-${suffix}`);
    await page.locator('.sheet__close').click();

    await page.locator('.bar__call').click();
    await expect(page.getByText(tr('guest.call.title'))).toBeVisible();
    await shot(page, `call-${suffix}`);
    await page.context().close();
  });
}
