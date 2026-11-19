import { expect, test } from '@playwright/test';
import { openDay, openTabOn, resetDb, sql } from '../support/db';
import { expectArabicChrome, setLang, signIn, typeOnPad } from '../support/ui';

test.describe.configure({ mode: 'serial' });
test.beforeAll(resetDb);

const ARABIC = /[؀-ۿ]/;

test('Arabic: waiter flow, an error toast in Arabic, then the cashier settles', async ({ page, context, browser }) => {
  await openDay();
  await setLang(context, 'ar');
  await signIn(page, 'waiter');
  // Freeze the floor status the waiter sees, so the next table taken behind their back is stale.
  let frozen: { body: string; headers: Record<string, string> } | null = null;
  await page.route('**/rest/v1/v_floor_status*', async (route) => {
    if (!frozen) {
      const r = await route.fetch();
      frozen = { body: await r.text(), headers: r.headers() };
    }
    await route.fulfill({ status: 200, headers: frozen.headers, body: frozen.body });
  });
  await page.goto('/floor');
  await expectArabicChrome(page);

  // A table taken behind the waiter's back: the refusal is a toast in Arabic.
  await expect(page.locator('.floor__table[data-state=free]').first()).toBeVisible();
  await openTabOn('T1', 2);
  await page.locator('.floor__table[data-state=free]', { has: page.locator('.floor__label', { hasText: /^T1$/ }) }).click();
  await page.locator('dialog[open] button.rop-btn--primary').click();
  const toast = page.locator('.rop-toasts--errors');
  await expect(toast).toContainText(ARABIC);
  await expect(toast).not.toContainText(/[A-Za-z]{4,}/);

  // Open T2, order a lamb kebab (doneness required) and send it.
  await page.unroute('**/rest/v1/v_floor_status*');
  await page.locator('.floor__table[data-state=free]', { has: page.locator('.floor__label', { hasText: /^T2$/ }) }).click();
  await page.locator('dialog[open] button.rop-btn--primary').click();
  await expect(page).toHaveURL(/\/tab\//);
  await page.locator('.tab__categories [role=tab]').nth(1).click();
  await page.locator('.tab__item', { hasText: 'كباب لحم' }).first().click();
  await page.locator('dialog[open] input[type=radio]').first().check();
  await page.locator('dialog[open] .rop-modal__footer button').last().click();
  await expectArabicChrome(page);
  await page.locator('.basket > button, .basket button.rop-btn--primary').last().click();
  await expect(page.locator('.tab__order')).toContainText('كباب لحم');
  await expectArabicChrome(page);

  // The cashier takes the cash.
  const cashierCtx = await browser.newContext();
  await setLang(cashierCtx, 'ar');
  const cashierPage = await cashierCtx.newPage();
  await signIn(cashierPage, 'cashier');
  await cashierPage.goto('/till/shift');
  await cashierPage.locator('section[aria-labelledby=shift-open-title] button.rop-btn--primary').click();
  await expect(cashierPage.locator('section[aria-labelledby=shift-close-title]')).toBeVisible();
  await cashierPage.goto('/till');
  await cashierPage.locator('.rop-till-tabs button', { hasText: 'T2' }).click();
  const pay = cashierPage.locator('.rop-till-pay');
  await expect(pay.locator('input[type=text]')).toHaveValue('15000');
  await typeOnPad(pay.locator('.rop-till-cash'), 15000);
  await pay.locator('button.rop-btn--primary').click();
  await expect(cashierPage.locator('.rop-till-bill h2').last()).toBeVisible();
  await expectArabicChrome(cashierPage);
  expect((await sql<{ status: string }>("select status from tabs where table_id = (select id from dining_tables where label = 'T2')"))[0]!.status).toBe('settled');
});

test('Arabic: manager screens render right to left without missing keys', async ({ page, context }) => {
  await setLang(context, 'ar');
  await signIn(page, 'owner');
  for (const path of ['/manage', '/manage/day', '/manage/menu', '/manage/floor', '/manage/staff', '/stock', '/stock/receive', '/stock/waste', '/stock/count', '/stock/recipes', '/stock/margins', '/stock/admin']) {
    await page.goto(path);
    await expect(page.locator('main h1').first()).toBeVisible();
    await expectArabicChrome(page);
  }
});
