import { expect, test } from '@playwright/test';
import { addItems, onHand, openDay, openTabOn, resetDb, settleInCash, sql } from '../support/db';
import { setLang, signIn } from '../support/ui';

test.describe.configure({ mode: 'serial' });
test.beforeAll(async () => {
  await resetDb();
  await openDay();
  const paid = await openTabOn('T4', 2);
  await addItems(paid, [{ name: 'Lamb Kebab', modifiers: ['Medium'] }, { name: 'Hummus', qty: 2 }]); // 15000 + 8000
  await settleInCash(paid, 23000);
  const open = await openTabOn('T5', 2);
  await addItems(open, [{ name: 'Cola' }]);
});
test.beforeEach(async ({ page }) => {
  await setLang(page, 'en');
  await signIn(page, 'manager');
});

test('dashboard shows what the cashier took, and the best sellers', async ({ page }) => {
  await page.goto('/manage');
  // Overview: net sales in the key figures.
  await expect(page.locator('.manage__cards')).toContainText('23,000');
  // Best sellers live in the Sales section.
  await page.getByRole('tab', { name: 'Sales' }).click();
  const best = page.locator('.manage__section', { has: page.getByRole('heading', { name: 'Best sellers' }) });
  await expect(best).toContainText('Hummus');
  await expect(best).toContainText('Lamb Kebab');
});

test('stock: recipe deduction, delivery, waste, blind count', async ({ page }) => {
  // Sold: 1 lamb kebab (250 g lamb), 2 hummus (160 g chickpeas).
  expect(await onHand('Lamb meat')).toBe(19750);
  expect(await onHand('Chickpeas')).toBe(9840);
  await page.goto('/stock');
  const row = (name: string) => page.locator('tr', { hasText: name });
  await expect(row('Lamb meat')).toContainText('19,750');

  // Receive 1000 g of lamb.
  await page.getByRole('link', { name: 'Receive' }).click();
  await page.getByLabel('Ingredient').selectOption({ label: 'Lamb meat (g)' });
  await page.getByLabel(/^Quantity/).fill('1000');
  await page.getByLabel(/^Cost per unit/).fill('18');
  await page.locator('form button[type=submit]').click();
  await expect.poll(() => onHand('Lamb meat')).toBe(20750);

  // Waste 500 g of rice.
  await page.getByRole('link', { name: 'Waste', exact: true }).click();
  await page.getByLabel('Ingredient').selectOption({ label: 'Rice (g)' });
  await page.getByLabel(/^Quantity/).fill('500');
  await page.getByLabel('Reason').fill('spilled');
  await page.locator('form button[type=submit]').click();
  await expect.poll(() => onHand('Rice')).toBe(39500);
  await page.getByRole('link', { name: 'On hand' }).click();
  await expect(row('Lamb meat')).toContainText('20,750');
  await expect(row('Rice')).toContainText('39,500');

  // Blind count: no on-hand or expected quantities anywhere on the screen.
  await page.getByRole('link', { name: 'Count' }).click();
  await page.getByRole('button', { name: /Start/ }).click();
  const input = (name: string) => page.getByLabel(new RegExp(`^Counted.*${name}`, 'i'));
  await expect(input('Lamb meat')).toBeVisible();
  const text = await page.locator('main').innerText();
  expect(text).not.toMatch(/20,750|39,500|9,840/);
  expect(await page.locator('table').innerText()).not.toMatch(/[0-9]/); // the sheet has no figures but the ones typed
  await input('Lamb meat').fill('20000');
  await input('Rice').fill('39500');
  await expect(page.getByText(/Saved/i)).toBeVisible();
  await page.getByRole('button', { name: 'Finish count' }).click();
  await page.locator('dialog[open]').getByRole('button', { name: 'Finish count' }).click();
  const adjustments = page.locator('table', { hasText: 'Lamb meat' });
  await expect(adjustments).toContainText('-750');
  await expect(adjustments).not.toContainText('Rice'); // counted equal to the system: no adjustment
  expect(await onHand('Lamb meat')).toBe(20000);
});

test('menu admin: a new item appears for the waiter', async ({ page, browser }) => {
  await page.goto('/manage/menu');
  await page.getByRole('button', { name: 'Items' }).click();
  await page.getByRole('button', { name: /Add item/ }).click();
  const dlg = page.locator('dialog[open]');
  await dlg.getByLabel('Name (English)').fill('Test Soup');
  await dlg.getByLabel('Name (Arabic)').fill('شوربة تجريبية');
  await dlg.getByLabel(/^Price/).fill('6500');
  await dlg.getByLabel('Category', { exact: true }).selectOption({ label: 'Mezze' });
  await dlg.getByLabel(/Tax/).selectOption({ index: 1 });
  await dlg.locator('button.rop-btn--primary').last().click();
  await expect(page.locator('tr', { hasText: 'Test Soup' })).toBeVisible();

  const ctx = await browser.newContext();
  await setLang(ctx, 'en');
  const w = await ctx.newPage();
  await signIn(w, 'waiter');
  const tab = await openTabOn('T7', 2);
  await w.goto(`/tab/${tab}`);
  await w.getByRole('tab', { name: 'Mezze' }).click();
  await expect(w.locator('.tab__item', { hasText: 'Test Soup' })).toContainText('6,500');
  await ctx.close();
  await sql("update tabs set status = 'void', closed_at = now() where status = 'open' and id = $1", [tab]);
});

test('floor admin adds a table', async ({ page }) => {
  await page.goto('/manage/floor');
  await page.getByRole('button', { name: /Add table/ }).click();
  const dlg = page.locator('dialog[open]');
  await dlg.getByLabel('Label').fill('T99');
  await dlg.getByLabel('Area').selectOption({ label: 'Indoor' });
  await dlg.getByLabel('Seats').fill('5');
  await dlg.locator('button.rop-btn--primary').last().click();
  await expect(page.locator('tr', { hasText: 'T99' })).toBeVisible();
  expect((await sql('select 1 from dining_tables where label = $1', ['T99'])).length).toBe(1);
});

test('close the day: refused while a tab is open, then succeeds with a summary', async ({ page }) => {
  await page.goto('/manage/day');
  await page.getByRole('button', { name: 'Close the day', exact: true }).click();
  await page.locator('dialog[open] button.rop-btn--danger').click();
  await expect(page.locator('.manage__notice')).toBeVisible();

  const [t] = await sql<{ id: string }>("select t.id from tabs t join dining_tables d on d.id = t.table_id where d.label = 'T5' and t.status = 'open'");
  await settleInCash(t!.id, 2000);
  await page.reload();
  await page.getByRole('button', { name: 'Close the day', exact: true }).click();
  await page.locator('dialog[open] button.rop-btn--danger').click();
  const summary = page.locator('section[aria-labelledby=day-summary]');
  await expect(summary).toBeVisible();
  await expect(summary).toContainText('25,000');
});
