import { expect, test } from '@playwright/test';
import { addItems, openDay, openTabOn, resetDb, sql } from '../support/db';
import { setLang, signIn, typeOnPad } from '../support/ui';

test.describe.configure({ mode: 'serial' });
test.beforeAll(resetDb);

test('split by item: paid lines stay paid, also after a reload', async ({ page }) => {
  await openDay();
  const tab = await openTabOn('T6', 3);
  await addItems(tab, [{ name: 'Lamb Kebab', modifiers: ['Medium'] }, { name: 'Hummus' }, { name: 'Cola' }]); // 15000 + 4000 + 2000
  await setLang(page, 'en');
  await signIn(page, 'cashier');
  await page.goto('/till/shift');
  await page.locator('section[aria-labelledby=shift-open-title]').getByRole('button', { name: 'Open shift' }).click();
  await expect(page.locator('section[aria-labelledby=shift-close-title]')).toBeVisible();

  await page.goto('/floor/bills');
  await page.locator('.rop-till-tabs button', { hasText: 'T6' }).click();
  await page.getByRole('button', { name: 'Split the bill' }).click();
  await page.getByRole('button', { name: 'By item' }).click();
  await page.getByLabel(/Lamb Kebab/).check();
  await page.getByLabel(/Cola/).check();
  await expect(page.getByText(/Selected lines/)).toContainText('17,000');
  await page.getByRole('button', { name: 'Pay selected lines' }).click();
  const pay = page.locator('.rop-till-pay');
  await expect(pay.locator('input[type=text]')).toHaveValue('17000');
  await typeOnPad(pay.locator('.rop-till-cash'), 17000);
  await pay.getByRole('button', { name: 'Take payment' }).click();
  await expect(page.locator('.rop-till-paid')).toBeVisible();

  // Paid lines cannot be picked again, before and after a reload.
  const checkbox = (name: RegExp) => page.getByLabel(name);
  await page.getByRole('button', { name: 'By item' }).click();
  await expect(checkbox(/Lamb Kebab/)).toBeDisabled();
  await expect(checkbox(/Cola/)).toBeDisabled();
  await expect(checkbox(/Hummus/)).toBeEnabled();

  await page.reload();
  await page.locator('.rop-till-tabs button', { hasText: 'T6' }).click();
  await page.getByRole('button', { name: 'By item' }).click();
  await expect(checkbox(/Lamb Kebab/)).toBeDisabled();
  await expect(checkbox(/Hummus/)).toBeEnabled();

  // The rest by card settles the tab.
  await checkbox(/Hummus/).check();
  await page.getByRole('button', { name: 'Pay selected lines' }).click();
  await pay.getByLabel('Card').check();
  await pay.getByRole('button', { name: 'Take payment' }).click();
  await expect(page.locator('.rop-till-bill')).toContainText('Tab settled');
  const rows = await sql<{ method: string; amount: string }>('select method, amount from payments order by created_at');
  expect(rows.map((r) => [r.method, Number(r.amount)])).toEqual([['cash', 17000], ['card', 4000]]);
});
