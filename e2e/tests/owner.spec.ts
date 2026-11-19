import { expect, test } from '@playwright/test';
import { resetDb, sql } from '../support/db';
import { setLang, signIn, signOut } from '../support/ui';

test.describe.configure({ mode: 'serial' });
test.beforeAll(resetDb);

test('owner manages staff through the edge function and the RPCs', async ({ page, browser }) => {
  await setLang(page, 'en');
  await signIn(page, 'owner');
  await page.goto('/manage/staff');

  // Create a waiter (edge function).
  await page.getByRole('button', { name: 'Add staff member' }).click();
  const dlg = page.locator('dialog[open]');
  await dlg.getByLabel('Full name').fill('Nour Test');
  await dlg.getByLabel('Email').fill('nour@demo.local');
  await dlg.getByLabel(/password/i).fill('nour-pass-123');
  await dlg.getByLabel('Role', { exact: true }).selectOption({ label: 'Waiter' });
  await dlg.locator('button.rop-btn--primary').last().click();
  const row = page.locator('tr', { hasText: 'Nour Test' });
  await expect(row).toBeVisible();

  // The new waiter can sign in.
  const ctx = await browser.newContext();
  await setLang(ctx, 'en');
  const w = await ctx.newPage();
  await signIn(w, { email: 'nour@demo.local' }, 'nour-pass-123');
  await expect(w.locator('.rop-topbar__user')).toContainText('Nour Test');
  await signOut(w);

  // Change the role, set the PIN, deactivate.
  await row.getByLabel(/Role of/).selectOption({ label: 'Cashier' });
  await expect.poll(async () => (await sql<{ role: string }>("select role from staff where full_name = 'Nour Test'"))[0]?.role).toBe('cashier');
  await row.getByRole('button', { name: 'Set PIN' }).click();
  await page.locator('dialog[open]').locator('input[type=password]').fill('385720');
  await page.locator('dialog[open] button.rop-btn--primary').last().click();
  await expect(page.locator('dialog[open]')).toHaveCount(0);
  const [pin] = await sql<{ ok: boolean }>("select pin_hash is not null as ok from staff where full_name = 'Nour Test'");
  expect(pin!.ok).toBe(true);
  await row.getByRole('button', { name: 'Deactivate' }).click();
  await expect.poll(async () => (await sql<{ is_active: boolean }>("select is_active from staff where full_name = 'Nour Test'"))[0]?.is_active).toBe(false);

  // They can no longer get in.
  await signIn(w, { email: 'nour@demo.local' }, 'nour-pass-123').catch(() => undefined);
  await expect(w.locator('.rop-field__error, [role=alert]').first()).toContainText(/not active/i);
  await expect(w.locator('nav.rop-nav')).toHaveCount(0);
  await ctx.close();
});

test('the edge function refuses a duplicate email with a readable code', async ({ page }) => {
  await setLang(page, 'en');
  await signIn(page, 'owner');
  await page.goto('/manage/staff');
  await page.getByRole('button', { name: 'Add staff member' }).click();
  const dlg = page.locator('dialog[open]');
  await dlg.getByLabel('Full name').fill('Dup');
  await dlg.getByLabel('Email').fill('waiter@demo.local');
  await dlg.getByLabel(/password/i).fill('dup-pass-12345');
  await dlg.getByLabel('Role', { exact: true }).selectOption({ label: 'Waiter' });
  await dlg.locator('button.rop-btn--primary').last().click();
  await expect(page.locator('.rop-toasts--errors')).toContainText('A login with that email already exists.');
});
