import { expect, test } from '@playwright/test';
import { openDay, openTabOn, resetDb } from '../support/db';
import { setLang, signIn } from '../support/ui';

test.beforeAll(resetDb);

test('a waiter sending an order updates the cashier till without a reload', async ({ browser }) => {
  await openDay();
  const tab = await openTabOn('T8', 2);

  const cashierCtx = await browser.newContext();
  await setLang(cashierCtx, 'en');
  const cashier = await cashierCtx.newPage();
  await signIn(cashier, 'cashier');
  await cashier.goto('/till');
  const row = cashier.locator('.rop-till-tabs button', { hasText: 'T8' });
  await expect(row).toBeVisible();
  await expect(row).not.toContainText('4,000');
  // Mark the page so a reload would be detected.
  await cashier.evaluate(() => ((window as unknown as { __noReload: boolean }).__noReload = true));

  const waiterCtx = await browser.newContext();
  await setLang(waiterCtx, 'en');
  const waiter = await waiterCtx.newPage();
  await signIn(waiter, 'waiter');
  await waiter.goto(`/tab/${tab}`);
  await waiter.locator('.tab__item', { hasText: 'Hummus' }).click();
  await waiter.locator('dialog[open] .rop-modal__footer button').last().click();
  await waiter.locator('.basket').getByRole('button').last().click();
  await expect(waiter.locator('.tab__order')).toHaveCount(1);

  await expect(row).toContainText('4,000', { timeout: 10_000 });
  expect(await cashier.evaluate(() => (window as unknown as { __noReload?: boolean }).__noReload)).toBe(true);
  await cashierCtx.close();
  await waiterCtx.close();
});
