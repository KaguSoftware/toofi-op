import { expect, test } from '@playwright/test';
import { openDay, resetDb, sql, ROLES } from '../support/db';
import { digits, enterPin, setLang, signIn, signOut } from '../support/ui';

test.describe.configure({ mode: 'serial' });
test.beforeAll(resetDb);

test('waiter: open a tab, order, reload, send, transfer, void with the manager PIN', async ({ page }) => {
  await setLang(page, 'en');

  // Day is closed: the waiter is told so; the manager opens it.
  await signIn(page, 'waiter');
  await page.goto('/floor');
  const t1 = page.locator('.floor__table', { has: page.locator('.floor__label', { hasText: /^T1$/ }) });
  await t1.click();
  await page.getByRole('dialog').locator('input[type=number]').fill('3');
  await page.getByRole('dialog').getByRole('button').last().click();
  await expect(page.locator('.floor__notice')).toBeVisible();

  await signOut(page);
  await signIn(page, 'manager');
  await page.goto('/manage/day');
  await page.getByRole('button', { name: /open/i }).first().click();
  await expect(page.locator('.manage p[role=status]')).toContainText(/since|open since/i);
  await signOut(page);

  // Open a tab on T1 with 3 covers.
  await signIn(page, 'waiter');
  await page.goto('/floor');
  await t1.click();
  await page.getByRole('dialog').locator('input[type=number]').fill('3');
  await page.getByRole('dialog').getByRole('button').last().click();
  await expect(page).toHaveURL(/\/tab\//);
  await expect(page.locator('.tab__header h1')).toContainText('T1');

  // Add a Lamb Kebab (Doneness required) with a note.
  await page.getByRole('tab', { name: 'Grills' }).click();
  await page.locator('.tab__item', { hasText: 'Lamb Kebab' }).click();
  const addBtn = page.locator('dialog[open] .rop-modal__footer button, dialog[open] footer button').last();
  await expect(addBtn).toBeDisabled(); // doneness is required
  await page.getByLabel('Well done').check();
  await page.locator('dialog[open]').getByLabel('Note').fill('no onions');
  await addBtn.click();
  // Fresh Lemonade (Size required).
  await page.getByRole('tab', { name: 'Cold Drinks' }).click();
  await page.locator('.tab__item', { hasText: 'Fresh Lemonade' }).click();
  await page.getByLabel('Large').check();
  await page.locator('dialog[open] .rop-modal__footer button, dialog[open] footer button').last().click();
  await expect(page.locator('.basket__line')).toHaveCount(2);

  // The basket survives a reload.
  await page.reload();
  await expect(page.locator('.basket__line')).toHaveCount(2);
  await expect(page.locator('.basket__line').first()).toContainText('Lamb Kebab');

  // Send.
  await page.locator('.basket').getByRole('button').last().click();
  await expect(page.locator('.basket__line')).toHaveCount(0);
  const order = page.locator('.tab__order');
  await expect(order).toHaveCount(1);
  await expect(order).toContainText('Lamb Kebab');
  await expect(order).toContainText('Well done');
  await expect(order).toContainText('no onions');
  await expect(order).toContainText('Large');
  // Lamb kebab 15000 + lemonade 3500+1500 = 20000.
  const total = digits(await page.locator('.tab__totals dd').nth(2).innerText());
  expect(total).toBe(20000);

  // Transfer to T2.
  await page.getByRole('button', { name: /transfer/i }).first().click();
  await page.getByRole('dialog').locator('select').selectOption({ label: 'T2' });
  await page.getByRole('dialog').getByRole('button').last().click();
  await expect(page.locator('.tab__header h1')).toContainText('T2');
  expect((await sql('select 1 from tabs t join dining_tables d on d.id = t.table_id where d.label = $1', ['T2'])).length).toBe(1);

  // Void the lemonade with the manager PIN.
  await page.locator('.tab__sent-line', { hasText: 'Fresh Lemonade' }).getByRole('button').click();
  await enterPin(page, ROLES.manager.pin, 'customer changed mind');
  await expect(page.locator('.tab__sent-line[data-voided=true]')).toContainText('Fresh Lemonade');
  const voided = await sql<{ n: string }>('select count(*) n from order_items where voided_at is not null');
  expect(Number(voided[0]!.n)).toBe(1);
});
