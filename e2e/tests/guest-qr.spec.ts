/**
 * The QR menu, end to end, in English and Arabic (the project name is the language, as in
 * screenshots.spec.ts): a guest's phone on the guest site beside a waiter, a cashier and the
 * owner on the staff app, all against the local stack.
 *
 *   1. the owner's printed code opens the menu on the right table
 *   2. a call: the waiter taps OK, the guest sees "on the way"
 *   3. an order: the waiter accepts it and picks the guest count; the tab, the bill and the
 *      stock all move once
 *   4. a second order: declined, the guest is told to ask a waiter, nothing reaches the tab
 *   5. the owner replaces the code: the old address and the old session stop working
 *
 * Every line of text is read from the @rop/i18n catalogs, never typed here, so a reworded
 * string cannot break this file and an untranslated one fails it.
 */
import { expect, test, type BrowserContext, type Locator, type Page } from '@playwright/test';
import { makeT, type Locale } from '../../packages/i18n/src';
import { MENU_URL } from '../playwright.config';
import { clientAs, onHand, openDay, resetDb, rpc, sql } from '../support/db';
import { digits, setLang, signIn } from '../support/ui';

test.describe.configure({ mode: 'serial' });

const TABLE = 'T5';
const GUEST_VIEWPORT = { width: 390, height: 844 };
type Tr = ReturnType<typeof makeT>;

let lang: Locale;
let tr: Tr;
let token = '';
let tableId = '';
let guestCtx: BrowserContext;
let guest: Page;
let staffCtx: BrowserContext;
let waiter: Page;

/** The table's current code, read the way the owner's print screen reads it. */
async function codeOf(label: string): Promise<string> {
  const owner = await clientAs('owner');
  const codes = await rpc<{ label: string; token: string }[]>(owner, 'table_qr_tokens');
  return codes.find((c) => c.label === label)!.token;
}

const dishName = async (nameEn: string): Promise<string> => {
  const [row] = await sql<{ n: string }>(`select ${lang === 'ar' ? 'name_ar' : 'name_en'} as n from menu_items where name_en = $1`, [nameEn]);
  return row!.n;
};

const fillText = (template: string, values: Record<string, string>): string => template.replace(/\{(\w+)\}/g, (_, k: string) => values[k] ?? '');

/** The guest's plus button for a dish (a dish with no options adds in one tap). */
async function addDish(name: string, times = 1): Promise<void> {
  const plus = guest.getByRole('button', { name: fillText(tr('guest.item.add'), { name }) });
  for (let i = 0; i < times; i++) await plus.click();
}

const row = (page: Page, kind: 'call' | 'order'): Locator => page.locator(`.guest-inbox__row[data-kind=${kind}]`, { hasText: tr('guestInbox.table', { label: TABLE }) });

async function expectGuestChrome(page: Page): Promise<void> {
  await expect(page.locator('html')).toHaveAttribute('dir', lang === 'ar' ? 'rtl' : 'ltr');
  await expect(page.locator('html')).toHaveAttribute('lang', lang);
  const leaked = (await page.locator('body').innerText()).match(/\bguest\.[A-Za-z_][A-Za-z0-9_.]*/g);
  expect(leaked, `message keys shown instead of text: ${String(leaked)}`).toBeNull();
}

test.beforeAll(async ({ browser }, testInfo) => {
  lang = testInfo.project.name as Locale;
  tr = makeT(lang);
  await resetDb();
  await openDay();
  tableId = (await sql<{ id: string }>('select id from dining_tables where label = $1', [TABLE]))[0]!.id;
  token = await codeOf(TABLE);

  // A phone (the guest site follows the phone's language) and a waiter's screen that stays open all test.
  guestCtx = await browser.newContext({ locale: lang === 'ar' ? 'ar-IQ' : 'en-US', viewport: GUEST_VIEWPORT, baseURL: MENU_URL });
  guest = await guestCtx.newPage();
  staffCtx = await browser.newContext({ locale: lang === 'ar' ? 'ar-IQ' : 'en-US', viewport: { width: 1280, height: 800 } });
  await setLang(staffCtx, lang);
  waiter = await staffCtx.newPage();
  await signIn(waiter, 'waiter');
  await waiter.goto('/floor');
  await expect(waiter.locator('.floor__table').first()).toBeVisible();
});

test.afterAll(async () => {
  await guestCtx?.close();
  await staffCtx?.close();
});

test('1. the printed code opens the menu on the right table', async () => {
  await guest.goto(`/t/${token}`);
  await expect(guest).toHaveURL(`${MENU_URL}/`); // the token leaves the address bar at once
  expect(guest.url()).not.toContain(token);

  await expectGuestChrome(guest);
  await expect(guest.getByRole('img', { name: tr('guest.table.label', { label: TABLE }) })).toBeVisible();
  await expect(guest.getByText(await dishName('Hummus'), { exact: true })).toBeVisible();
  await expect(guest.getByText(await dishName('Lamb Kebab'), { exact: true })).toBeVisible();

  // The table session is the HttpOnly cookie; the page never holds it.
  const cookie = (await guestCtx.cookies()).find((c) => c.name === 'rop-table');
  expect(cookie?.httpOnly).toBe(true);
  expect(await guest.evaluate(() => document.cookie)).not.toContain('rop-table');
  expect(await guest.content()).not.toContain(cookie!.value);
});

test('2. a call reaches the waiter, one tap answers it, the guest sees it', async () => {
  await guest.locator('.bar__call').click();
  await guest.locator('.reason', { hasText: tr('guest.call.reason.water') }).click();
  await expect(guest.locator('.status', { hasText: tr('guest.strip.callWaiting') })).toBeVisible();

  const call = row(waiter, 'call');
  await expect(call).toContainText(tr('guestInbox.reason.water'));
  await call.getByRole('button', { name: tr('guestInbox.okCall', { label: TABLE }) }).click();
  await expect(call).toHaveCount(0);

  // The guest's phone asks every 5 seconds while a call is waiting.
  await expect(guest.locator('.status', { hasText: tr('guest.strip.callAnswered') })).toBeVisible({ timeout: 20_000 });
  const [c] = await sql<{ answered_by: string | null }>('select answered_by from waiter_calls where table_id = $1', [tableId]);
  expect(c!.answered_by).not.toBeNull();
});

test('3. an order waits for the waiter; accepting it opens the tab, the bill and the stock move once', async ({ browser }) => {
  const hummus = await dishName('Hummus');
  await addDish(hummus, 2);
  await guest.locator('.bar__order').click();
  const shownToGuest = digits(await guest.locator('.total__amount').innerText());
  await guest.getByRole('button', { name: tr('guest.order.send') }).click();
  await expect(guest.locator('.status', { hasText: tr('guest.order.strip.waiting') })).toBeVisible();

  // A guest order is a request: no tab, order or stock row exists until a waiter taps OK.
  const counts = () => sql<{ tabs: string; orders: string; moves: string }>(
    `select (select count(*) from tabs) tabs, (select count(*) from orders) orders, (select count(*) from stock_movements where kind = 'sale') moves`,
  );
  expect(await counts()).toEqual([{ tabs: '0', orders: '0', moves: '0' }]);
  const chickpeasBefore = await onHand('Chickpeas');

  const order = row(waiter, 'order');
  await expect(order).toContainText(hummus);
  await expect(order.locator('.guest-inbox__qty')).toContainText('2');
  await order.getByRole('button', { name: tr('guestInbox.okOrder', { label: TABLE }) }).click();
  // The table is free, so the waiter says how many guests sit there.
  const dialog = waiter.getByRole('dialog');
  await expect(dialog).toContainText(tr('guestInbox.coversTitle', { label: TABLE }));
  await dialog.getByRole('button', { name: tr('guestInbox.accept') }).click();
  await expect(order).toHaveCount(0);

  await expect(guest.locator('.status', { hasText: tr('guest.order.strip.accepted') })).toBeVisible({ timeout: 20_000 });

  // Exactly one tab, one order, two Hummus at 4,000: 8,000.
  const [go] = await sql<{ status: string; tab_id: string | null; order_id: string | null; decided_by: string | null }>(
    'select status, tab_id, order_id, decided_by from guest_orders',
  );
  expect(go).toMatchObject({ status: 'accepted' });
  expect(go!.tab_id && go!.order_id && go!.decided_by).toBeTruthy();
  expect(await counts()).toEqual([{ tabs: '1', orders: '1', moves: '4' }]); // four recipe lines, once each
  expect(await onHand('Chickpeas')).toBe(chickpeasBefore - 160); // 2 × 80 g
  const lines = await sql<{ qty: number; unit_price: string }>('select qty, unit_price from order_items');
  expect(lines.map((l) => [Number(l.qty), Number(l.unit_price)])).toEqual([[2, 4000]]);

  // The waiter's tab shows the lines.
  await waiter.goto(`/tab/${go!.tab_id}`);
  await expect(waiter.locator('.tab__order')).toContainText(hummus);

  // The cashier's bill is the same 8,000 the guest was shown.
  const cashierCtx = await browser.newContext({ locale: lang === 'ar' ? 'ar-IQ' : 'en-US', viewport: { width: 1280, height: 800 } });
  await setLang(cashierCtx, lang);
  const cashier = await cashierCtx.newPage();
  await signIn(cashier, 'cashier');
  await cashier.goto('/floor/bills');
  await cashier.locator('.rop-till-tabs button', { hasText: TABLE }).click();
  await expect(cashier.locator('.rop-till-pay input[type=text]')).toHaveValue('8000');
  expect(shownToGuest).toBe(8000);
  await cashierCtx.close();
  await waiter.goto('/floor');
});

test('4. a declined order tells the guest to ask a waiter and adds nothing', async () => {
  const tea = await dishName('Iraqi Tea');
  await addDish(tea);
  await guest.locator('.bar__order').click();
  await guest.getByRole('button', { name: tr('guest.order.send') }).click();
  await expect(guest.locator('.status', { hasText: tr('guest.order.strip.waiting') })).toBeVisible();

  const order = row(waiter, 'order');
  await expect(order).toContainText(tea);
  await order.getByRole('button', { name: tr('guestInbox.declineOrder', { label: TABLE }) }).click();
  await waiter.getByRole('dialog').getByRole('button', { name: tr('guestInbox.declineConfirm') }).click();
  await expect(order).toHaveCount(0);

  await expect(guest.locator('.status', { hasText: tr('guest.order.strip.declined') })).toBeVisible({ timeout: 20_000 });
  const rows = await sql<{ status: string }>('select status from guest_orders order by sent_at');
  expect(rows.map((r) => r.status)).toEqual(['accepted', 'declined']);
  const [after] = await sql<{ items: string; orders: string }>('select (select count(*) from order_items) items, (select count(*) from orders) orders');
  expect(after).toEqual({ items: '1', orders: '1' }); // still only the first order
});

test('5. the owner replaces the code: the old address and the old session stop working', async ({ browser }) => {
  const ownerCtx = await browser.newContext({ locale: lang === 'ar' ? 'ar-IQ' : 'en-US', viewport: { width: 1280, height: 800 } });
  await setLang(ownerCtx, lang);
  const owner = await ownerCtx.newPage();
  await signIn(owner, 'owner');
  await owner.goto('/manage/floor');
  await owner.getByRole('button', { name: tr('guestSetup.viewCodes') }).click();
  await owner.getByRole('button', { name: tr('guestSetup.replaceFor', { label: TABLE }) }).click();
  await owner.getByRole('dialog').getByRole('button', { name: tr('guestSetup.replaceConfirm') }).click();
  await expect(owner.locator('.rop-toasts[role=status]')).toContainText(tr('guestSetup.replaced', { label: TABLE }));
  await ownerCtx.close();

  const fresh = await codeOf(TABLE);
  expect(fresh).not.toBe(token);

  // The guest already at the table is signed out of it: the menu stays, the table is gone.
  await guest.goto('/');
  await expect(guest.locator('.status', { hasText: tr('guest.notice.scanAgain') })).toBeVisible();
  await expect(guest.getByRole('img', { name: tr('guest.table.label', { label: TABLE }) })).toHaveCount(0);
  expect((await guestCtx.cookies()).find((c) => c.name === 'rop-table')).toBeUndefined();

  // The old card opens no session.
  const oldCtx = await browser.newContext({ locale: lang === 'ar' ? 'ar-IQ' : 'en-US', viewport: GUEST_VIEWPORT, baseURL: MENU_URL });
  const old = await oldCtx.newPage();
  await old.goto(`/t/${token}`);
  await expect(old).toHaveURL(/notice=scan-again/);
  await expect(old.locator('.status', { hasText: tr('guest.notice.scanAgain') })).toBeVisible();
  expect((await oldCtx.cookies()).find((c) => c.name === 'rop-table')).toBeUndefined();
  await oldCtx.close();

  // The new card does.
  const newCtx = await browser.newContext({ locale: lang === 'ar' ? 'ar-IQ' : 'en-US', viewport: GUEST_VIEWPORT, baseURL: MENU_URL });
  const next = await newCtx.newPage();
  await next.goto(`/t/${fresh}`);
  await expect(next.getByRole('img', { name: tr('guest.table.label', { label: TABLE }) })).toBeVisible();
  await newCtx.close();
});
