import { expect, test } from '@playwright/test';
import { addItems, openDay, openTabOn, resetDb, sql } from '../support/db';
import { digits, setLang, signIn } from '../support/ui';

test.describe.configure({ mode: 'serial' });
test.beforeEach(resetDb);

async function seedTab(): Promise<string> {
  await openDay();
  const tab = await openTabOn('T6', 3);
  await addItems(tab, [{ name: 'Lamb Kebab', modifiers: ['Medium'] }, { name: 'Hummus' }, { name: 'Cola' }]); // 21000
  return tab;
}

test('payment is taken on the open tab, and every part payment shows on the floor and the tab without realtime', async ({ page }) => {
  await seedTab();
  await page.routeWebSocket(/realtime/, () => undefined); // no refetch signal ever arrives
  await setLang(page, 'en');
  await signIn(page, 'cashier');
  await expect(page).toHaveURL(/\/floor$/);
  await page.getByRole('link', { name: 'Shift' }).click();
  await page.locator('section[aria-labelledby=shift-open-title]').getByRole('button', { name: 'Open shift' }).click();
  await expect(page.locator('section[aria-labelledby=shift-close-title]')).toBeVisible();

  const floorLink = page.locator('nav.rop-nav').getByRole('link', { name: 'Floor', exact: true });
  const table = page.locator('.floor__table', { hasText: 'T6' }).first();
  const pay = page.locator('.rop-till-pay');
  await floorLink.click();
  let paid = 0;
  for (const n of [5000, 5000, 3000]) {
    await table.click();
    await page.getByRole('button', { name: 'Collect payment' }).click();
    await pay.locator('input[type=text]').fill(String(n));
    await pay.getByRole('button', { name: 'Exact' }).click();
    await pay.getByRole('button', { name: 'Take payment' }).click();
    paid += n;
    await expect(page.locator('.rop-till-paid')).toContainText(`${((21000 - paid) / 1000).toFixed(0)},000`);

    await page.getByRole('button', { name: 'Back to the order' }).click();
    await expect.poll(async () => digits(await page.locator('.tab__totals dd').last().innerText())).toBe(21000 - paid);
    await floorLink.click();
    await expect.poll(async () => digits(await table.locator('.floor__due').innerText())).toBe(21000 - paid);
  }

  // The rest by card settles the tab: the receipt stays on screen and the table frees up.
  await table.click();
  await page.getByRole('button', { name: 'Collect payment' }).click();
  await pay.getByLabel('Card').check();
  await pay.getByRole('button', { name: 'Take payment' }).click();
  await expect(page.getByRole('button', { name: 'Print receipt' })).toBeVisible();
  await page.getByRole('button', { name: 'Back to floor' }).click();
  await expect(table).toHaveAttribute('data-state', 'free');
  const rows = await sql<{ method: string; amount: string }>('select method, amount from payments order by created_at');
  expect(rows.map((r) => [r.method, Number(r.amount)])).toEqual([['cash', 5000], ['cash', 5000], ['cash', 3000], ['card', 8000]]);
});

test('an unsent basket must be sent before collecting; a waiter cannot collect', async ({ page, browser }) => {
  const tab = await seedTab();
  await setLang(page, 'en');
  await signIn(page, 'cashier');
  await page.goto(`/tab/${tab}`);
  const collect = page.getByRole('button', { name: 'Collect payment' });
  await expect(collect).toBeEnabled();
  await page.locator('.tab__item', { hasText: 'Hummus' }).click();
  await expect(collect).toBeDisabled();

  const ctx = await browser.newContext();
  await setLang(ctx, 'en');
  const waiter = await ctx.newPage();
  await signIn(waiter, 'waiter');
  await waiter.goto(`/tab/${tab}`);
  await expect(waiter.locator('.tab__totals')).toBeVisible();
  await expect(waiter.getByRole('button', { name: 'Collect payment' })).toHaveCount(0);
  await ctx.close();
});
