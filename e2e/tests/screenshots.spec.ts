/**
 * One full-page screenshot per screen, in EN and AR (the project decides), for the design team:
 * docs/screenshots/<lang>/<screen>.png at 1280x800. Runs against a day with a settled tab,
 * an open tab with sent lines, and a count in progress, so the screens are not empty.
 */
import path from 'node:path';
import { expect, test, type Page } from '@playwright/test';
import { addItems, openDay, openTabOn, resetDb, settleInCash } from '../support/db';
import { setLang, signIn, type Lang } from '../support/ui';

test.describe.configure({ mode: 'serial' });

const OUT = path.resolve(__dirname, '../../docs/screenshots');
let openTabId = '';

test.beforeAll(async () => {
  await resetDb();
  await openDay();
  const paid = await openTabOn('T4', 2);
  await addItems(paid, [{ name: 'Lamb Kebab', modifiers: ['Medium'] }, { name: 'Hummus', qty: 2 }, { name: 'Iraqi Tea', qty: 2 }]);
  await settleInCash(paid, 27000);
  openTabId = await openTabOn('T3', 3);
  await addItems(openTabId, [{ name: 'Mixed Grill', modifiers: ['Well done'] }, { name: 'Fresh Lemonade', modifiers: ['Large'] }, { name: 'Falafel Sandwich' }]);
});

async function shot(page: Page, lang: Lang, name: string, ready = 'main h1'): Promise<void> {
  await expect(page.locator(ready).first()).toBeVisible();
  await expect(page.locator('.rop-loading, [aria-busy=true]')).toHaveCount(0);
  await page.waitForTimeout(400);
  await page.screenshot({ path: path.join(OUT, lang, `${name}.png`), fullPage: true, animations: 'disabled' });
}

test('screenshots of every screen', async ({ page }, testInfo) => {
  test.setTimeout(180_000);
  const lang = testInfo.project.name as Lang;
  await setLang(page, lang);

  await page.goto('/login');
  await expect(page.locator('input[type=email]')).toBeVisible();
  await shot(page, lang, 'login');

  await signIn(page, 'owner');
  const visit = async (route: string, name: string, ready?: string) => {
    await page.goto(route);
    await shot(page, lang, name, ready);
  };

  await visit('/floor', 'floor', '.floor__table');
  await visit(`/tab/${openTabId}`, 'tab', '.tab__order');
  // Items with nothing to choose add in one tap; the sheet opens for an item with modifiers (Grills).
  await page.locator('.tab__category').nth(1).click();
  await page.locator('.tab__item').first().click();
  await expect(page.locator('dialog[open]')).toBeVisible();
  await page.screenshot({ path: path.join(OUT, lang, 'tab-item-sheet.png'), fullPage: true, animations: 'disabled' });
  await page.keyboard.press('Escape');

  await visit('/till/shift', 'till-shift');
  await page.goto('/till');
  await page.locator('.rop-till-tabs button').first().click();
  await shot(page, lang, 'till', '.rop-till-bill');
  await page.locator('.rop-till-list [aria-pressed]').nth(1).click();
  await page.locator('.rop-till-tabs button').first().click();
  await shot(page, lang, 'till-settled', '.rop-till-bill');

  await visit('/manage', 'manage', '.manage__cards');
  await visit('/manage/day', 'manage-day');
  await visit('/manage/menu', 'manage-menu');
  await visit('/manage/floor', 'manage-floor');
  await visit('/manage/staff', 'manage-staff');
  await visit('/stock', 'stock-on-hand');
  await visit('/stock/receive', 'stock-receive');
  await visit('/stock/waste', 'stock-waste');
  await visit('/stock/count', 'stock-count');
  await visit('/stock/recipes', 'stock-recipes');
  await visit('/stock/margins', 'stock-margins');
  await visit('/stock/admin', 'stock-admin');
});
