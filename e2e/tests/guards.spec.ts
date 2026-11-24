import { expect, test } from '@playwright/test';
import { resetDb } from '../support/db';
import { setLang, signIn } from '../support/ui';

test.beforeAll(resetDb);

for (const [role, blocked] of [
  ['waiter', ['/floor/bills', '/till', '/till/shift', '/manage', '/stock', '/manage/staff']],
  ['cashier', ['/manage', '/manage/staff', '/stock']],
  ['manager', ['/manage/staff']],
] as const) {
  test(`role guard: ${role} is kept out of ${blocked.join(', ')}`, async ({ page }) => {
    await setLang(page, 'en');
    await signIn(page, role);
    for (const path of blocked) {
      await page.goto(path);
      await expect(page).not.toHaveURL(new RegExp(`${path}$`));
      await expect(page.locator('h1')).not.toHaveCount(0);
    }
  });
}

test('signed out visitors land on the login page', async ({ page }) => {
  await page.goto('/floor/bills');
  await expect(page).toHaveURL(/\/login/);
});
