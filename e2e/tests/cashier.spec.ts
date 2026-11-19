import { expect, test, type Page } from '@playwright/test';
import { addItems, openDay, openTabOn, resetDb, ROLES, sql } from '../support/db';
import { digits, enterPin, setLang, signIn, stubPrint, typeOnPad } from '../support/ui';

test.describe.configure({ mode: 'serial' });
test.beforeAll(resetDb);

const dueOf = async (page: Page) => digits(await page.locator('.rop-till-totals dd').last().innerText());

test('cashier: shift, discount with PIN, even split cash+card, receipt, refund, blind close', async ({ page, context }) => {
  await openDay();
  const tab = await openTabOn('T3', 2);
  // 15000 + 4000 + 3000 + 2000 = 24000
  await addItems(tab, [{ name: 'Lamb Kebab', modifiers: ['Medium'] }, { name: 'Hummus' }, { name: 'Falafel Sandwich' }, { name: 'Cola' }]);
  await setLang(page, 'en');
  await stubPrint(context);

  await signIn(page, 'cashier');
  await page.goto('/till/shift');
  const open = page.locator('section[aria-labelledby=shift-open-title]');
  await typeOnPad(open, 50000);
  await open.getByRole('button').last().click();
  await expect(page.locator('section[aria-labelledby=shift-close-title]')).toBeVisible();

  await page.goto('/till');
  await page.locator('.rop-till-tabs button', { hasText: 'T3' }).click();
  await expect(page.locator('.rop-till-bill')).toBeVisible();
  expect(await dueOf(page)).toBe(24000);

  // 10% discount with the manager PIN.
  await page.getByRole('button', { name: 'Discount', exact: true }).click();
  await page.locator('dialog[open] input[type=text]').fill('10');
  await page.locator('dialog[open] button[type=submit]').click();
  await enterPin(page, ROLES.manager.pin, 'regular customer');
  await expect.poll(() => dueOf(page)).toBe(21600);

  // Split evenly 2 ways: share 1 in cash with change.
  await page.getByRole('button', { name: /Pay this share/ }).click();
  const pay = page.locator('.rop-till-pay');
  await expect(pay.locator('input[type=text]')).toHaveValue('10800');
  await typeOnPad(pay.locator('.rop-till-cash'), 20000);
  await expect(pay.locator('.rop-till-change strong')).toContainText('9,200');
  await pay.getByRole('button', { name: 'Take payment' }).click();
  await expect(page.locator('.rop-till-paid')).toContainText('9,200');
  await expect.poll(() => dueOf(page)).toBe(10800);

  // Share 2 by card.
  await page.getByRole('button', { name: /Pay this share/ }).click();
  await expect(pay.locator('input[type=text]')).toHaveValue('10800');
  await pay.getByLabel('Card').check();
  await pay.getByRole('button', { name: 'Take payment' }).click();
  await expect(page.locator('.rop-till-bill')).toContainText('Tab settled');
  await page.locator('.rop-till-list').getByRole('button', { name: 'Open tabs' }).click();
  await expect(page.locator('.rop-till-tabs')).toHaveCount(1);
  await expect(page.locator('.rop-till-tabs button', { hasText: 'T3' })).toHaveCount(0);

  // Settled list; print the receipt.
  await page.getByRole('button', { name: 'Settled today' }).click();
  await page.locator('.rop-till-tabs button', { hasText: 'T3' }).click();
  await page.getByRole('button', { name: 'Print receipt' }).click();
  const printed = () => page.evaluate(() => (window as unknown as { __printed: string[] }).__printed.filter((h) => h.includes('Lamb Kebab')));
  await expect.poll(async () => (await printed()).length).toBeGreaterThan(0);
  const html = (await printed())[0]!;
  expect(html).toContain('Restaurant');
  expect(html).toContain('Baghdad, Iraq');
  for (const n of ['Lamb Kebab', 'Hummus', 'Falafel Sandwich', 'Cola']) expect(html).toContain(n);
  expect(html).toContain('Thank you for dining with us');

  // Partial refund of the card payment with the manager PIN.
  const card = page.locator('.rop-till-payments li', { hasText: 'Card' });
  await card.locator('input[type=text]').fill('3000');
  await card.getByRole('button', { name: 'Refund', exact: true }).click();
  await enterPin(page, ROLES.manager.pin, 'cold food');
  await expect(card).toContainText('3,000');
  const refunds = await sql<{ amount: string }>('select amount from refunds');
  expect(refunds.map((r) => Number(r.amount))).toEqual([3000]);

  // Blind close: counted 60000 vs expected 50000 + 10800 cash = 60800 -> short 800.
  await page.goto('/till/shift');
  const close = page.locator('section[aria-labelledby=shift-close-title]');
  await expect(close).not.toContainText('60,800');
  await typeOnPad(close, 60000);
  await close.getByRole('button', { name: 'Close shift' }).click();
  await page.locator('dialog[open]').getByRole('button', { name: 'Close shift' }).click();
  const res = page.locator('.rop-shift-result');
  await expect(res).toContainText('60,800');
  await expect(res).toContainText('Short');
  await expect(res).toContainText('800');
});
