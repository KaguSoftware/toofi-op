/**
 * Analytics v2 over one seeded scenario (Baghdad is UTC+3). Expected figures are worked
 * out by hand from the literals below, not recomputed.
 *
 * One category, five items:
 *   Burger 8000, recipe 150 g beef   -> cost 1500, margin 6500
 *   Steak 20000, recipe 300 g beef   -> cost 3000, margin 17000
 *   Soup   3000, recipe 100 g veg    -> cost  500, margin 2500
 *   Pasta  3000, recipe 200 g flour  -> cost  200, margin 2800 (never sold)
 *   Salad  4000, no recipe           -> uncosted
 * beef 10 IQD/g, veg 5, flour 1.
 *
 * 2031-03-10 (a Monday):
 *   tab A  waiter1, 4 covers, 12:00 to 13:00. Burger x10, Steak x1 = 100,000.
 *          discount 5,000 by the cashier. cash 95,000 at 13:00, taken by the cashier.
 *   tab B  waiter2, 2 covers, 20:00 to 21:30. Soup x6, Salad x2 = 26,000; three more
 *          Salad x1 lines voided by waiter2 (12,000). discount 1,000 by the cashier.
 *          card 26,000 at 21:30 taken by the cashier, card refund 2,000 at 22:10 by the cashier.
 * 2031-03-03 (the Monday before): tab P, 2 covers, Burger x1, cash 8,000.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { cleanupStaff, createStaffOfRole, endDb, stackAvailable, withRollback, type Query, type TestStaff } from './helpers';
import { call, discount, ingredient, line, payment, recipeLine, refund, tab, voidLine } from './stock-fixtures';

const up = await stackAvailable();

type Row = Record<string, unknown>;
const B = (local: string) => `${local}+03:00`;
const D1 = '2031-03-10';
const D0 = '2031-03-03';

describe.skipIf(!up)('analytics v2', () => {
  let manager: TestStaff;
  let cashier: TestStaff;
  let waiter1: TestStaff;
  let waiter2: TestStaff;

  beforeAll(async () => {
    manager = await createStaffOfRole('manager');
    cashier = await createStaffOfRole('cashier');
    waiter1 = await createStaffOfRole('waiter');
    waiter2 = await createStaffOfRole('waiter');
  });

  afterAll(async () => {
    await cleanupStaff();
    await endDb();
  });

  async function seed(q: Query) {
    const [tax] = await q<{ id: string }>(`insert into tax_groups (name, rate_bps) values ('VAT', 0) returning id`);
    const [cat] = await q<{ id: string }>(`insert into menu_categories (name_en, name_ar) values ('Mains', 'رئيسي') returning id`);
    const item = async (name: string, price: number) => {
      const [r] = await q<{ id: string }>(
        `insert into menu_items (category_id, name_en, name_ar, price, tax_group_id) values ($1, $2, $2, $3, $4) returning id`,
        [cat!.id, name, price, tax!.id],
      );
      return r!.id;
    };
    const burger = await item('Burger', 8000);
    const steak = await item('Steak', 20000);
    const soup = await item('Soup', 3000);
    const pasta = await item('Pasta', 3000);
    const salad = await item('Salad', 4000);
    const beef = await ingredient(q, { cost: 10 });
    const veg = await ingredient(q, { cost: 5 });
    const flour = await ingredient(q, { cost: 1 });
    await recipeLine(q, burger, beef, 150);
    await recipeLine(q, steak, beef, 300);
    await recipeLine(q, soup, veg, 100);
    await recipeLine(q, pasta, flour, 200);

    const [area] = await q<{ id: string }>(`insert into floor_areas (name_en, name_ar) values ('Hall', 'صالة') returning id`);
    const table = async (label: string) => {
      const [r] = await q<{ id: string }>(`insert into dining_tables (area_id, label, seats) values ($1, $2, 4) returning id`, [area!.id, label]);
      return r!.id;
    };
    const seat = (tabId: string, tableId: string, closedAt: string) =>
      q(`update tabs set table_id = $2, status = 'settled', closed_at = $3 where id = $1`, [tabId, tableId, closedAt]);

    const a = await tab(q, waiter1.id, { openedAt: B(`${D1}T12:00:00`), covers: 4 });
    await line(q, a, waiter1.id, burger, 10, 8000, B(`${D1}T12:05:00`));
    await line(q, a, waiter1.id, steak, 1, 20000, B(`${D1}T12:06:00`));
    await discount(q, a, cashier.id, 5000, B(`${D1}T12:55:00`));
    await payment(q, a, cashier.id, 95000, 'cash', B(`${D1}T13:00:00`));
    await seat(a, await table('A1'), B(`${D1}T13:00:00`));

    const b = await tab(q, waiter2.id, { openedAt: B(`${D1}T20:00:00`), covers: 2 });
    await line(q, b, waiter2.id, soup, 6, 3000, B(`${D1}T20:05:00`));
    await line(q, b, waiter2.id, salad, 2, 4000, B(`${D1}T20:06:00`));
    for (const minute of ['10', '11', '12']) {
      const v = await line(q, b, waiter2.id, salad, 1, 4000, B(`${D1}T20:${minute}:00`));
      await voidLine(q, v, waiter2.id, B(`${D1}T20:30:00`));
    }
    await discount(q, b, cashier.id, 1000, B(`${D1}T21:25:00`));
    const pb = await payment(q, b, cashier.id, 26000, 'card', B(`${D1}T21:30:00`));
    await refund(q, pb, b, cashier.id, 2000, 'card', B(`${D1}T22:10:00`));
    await seat(b, await table('A2'), B(`${D1}T21:30:00`));

    const p = await tab(q, waiter1.id, { openedAt: B(`${D0}T12:00:00`), covers: 2 });
    await line(q, p, waiter1.id, burger, 1, 8000, B(`${D0}T12:05:00`));
    await payment(q, p, cashier.id, 8000, 'cash', B(`${D0}T13:00:00`));

    return { burger, steak, soup, pasta, salad, beef, veg, area: area!.id };
  }

  const range = (q: Query, fn: string, from = D1, to = D1) => call<Row>(q, fn, [from, to], ['date', 'date']);
  const byName = <T extends { name_en: string }>(rows: T[]) => Object.fromEntries(rows.map((r) => [r.name_en, r]));

  it('overview: figures against the same weekday a week before, and food cost on costed sales', async () => {
    await withRollback(manager.id, async (q) => {
      await seed(q);
      const out = await range(q, 'analytics_overview');
      expect(out).toMatchObject({
        from: D1, to: D1, prev_from: D0, prev_to: D0, weeks_back: 1,
        // 95,000 + 26,000 - 2,000 refund; the week before, 8,000.
        net: { current: 119000, previous: 8000 },
        covers: { current: 6, previous: 2 },
        tabs: { current: 2, previous: 1 },
        // 119,000 / 6 = 19,833.3; 8,000 / 2.
        spend_per_cover: { current: 19833, previous: 4000 },
        // Non-voided lines before discount: 100,000 + 26,000.
        item_sales: { current: 126000, previous: 8000 },
        // 10 x 1,500 + 3,000 + 6 x 500; one burger the week before.
        cogs: { current: 21000, previous: 1500 },
        // 21,000 / 118,000 (the salad has no recipe and is left out); 1,500 / 8,000.
        food_cost_bps: { current: 1780, previous: 1875 },
        discounts: { current: 6000, previous: 0 },
        voids: { current: 12000, previous: 0 },
        refunds: { current: 2000, previous: 0 },
      });
    });
  });

  it('overview: a longer range moves back by whole weeks, and no costed sales means no food cost', async () => {
    await withRollback(manager.id, async (q) => {
      const out = await range(q, 'analytics_overview', '2031-04-01', '2031-04-10');
      expect(out).toMatchObject({ prev_from: '2031-03-18', prev_to: '2031-03-27', weeks_back: 2 });
      expect(out.food_cost_bps).toEqual({ current: null, previous: null });
      expect(out.spend_per_cover).toEqual({ current: 0, previous: 0 });
    });
  });

  it('menu engineering: classes each item inside its category', async () => {
    await withRollback(manager.id, async (q) => {
      const ids = await seed(q);
      const out = await range(q, 'analytics_menu_engineering');
      const items = byName((out.items as (Row & { name_en: string; category_id: string })[]).filter((i) =>
        [ids.burger, ids.steak, ids.soup, ids.pasta, ids.salad].includes(i.menu_item_id as string),
      ));
      // Category: 19 sold over 5 items, so popular from 0.7 x 19 / 5 = 2.66.
      // Average unit margin over costed items: (65,000 + 17,000 + 15,000) / 17 = 5,706.
      expect(items.Burger).toMatchObject({ qty: 10, revenue: 80000, cost: 15000, margin: 65000, unit_margin: 6500, share_bps: 5263, class: 'star' });
      expect(items.Soup).toMatchObject({ qty: 6, revenue: 18000, cost: 3000, unit_margin: 2500, class: 'plowhorse' });
      expect(items.Steak).toMatchObject({ qty: 1, unit_margin: 17000, class: 'puzzle' });
      expect(items.Pasta).toMatchObject({ qty: 0, revenue: 0, unit_margin: 2800, class: 'dog' });
      expect(items.Salad).toMatchObject({ qty: 2, revenue: 8000, cost: 0, class: 'uncosted' });

      const cat = (out.categories as Row[]).find((c) => c.category_id === items.Burger!.category_id);
      expect(cat).toMatchObject({ name_en: 'Mains', items: 5, qty: 19, revenue: 126000, margin: 97000, avg_unit_margin: 5706, popular_from: 2.7 });
    });
  });

  it('stock losses: waste plus what counts wrote off, against usage', async () => {
    await withRollback(manager.id, async (q) => {
      const ids = await seed(q);
      const at = B(`${D1}T23:00:00`);
      const move = (ing: string, kind: string, qty: number, cost: number) =>
        q(`insert into stock_movements (ingredient_id, kind, qty, unit_cost, created_at) values ($1, $2::movement_kind, $3, $4, $5)`, [ing, kind, qty, cost, at]);
      // Sale movements written by the trigger are stamped now(), outside this window, so usage is planted here.
      await move(ids.beef, 'sale', -1800, 10); // 18,000 used
      await move(ids.veg, 'sale', -600, 5); // 3,000 used
      await move(ids.beef, 'waste', -200, 10); // 2,000 wasted
      await move(ids.beef, 'count_adjust', 50, 10); // a surplus of 500
      await move(ids.veg, 'count_adjust', -100, 5); // 500 missing

      const out = await range(q, 'analytics_stock_losses');
      const rows = (out.items as Row[]).filter((r) => [ids.beef, ids.veg].includes(r.ingredient_id as string));
      expect(rows).toEqual([
        expect.objectContaining({ ingredient_id: ids.beef, waste_qty: 200, waste_value: 2000, missing_qty: -50, missing_value: -500, loss_value: 1500, usage_value: 18000, loss_bps: 833 }),
        expect.objectContaining({ ingredient_id: ids.veg, waste_qty: 0, waste_value: 0, missing_qty: 100, missing_value: 500, loss_value: 500, usage_value: 3000, loss_bps: 1667 }),
      ]);
      expect(out.totals).toEqual({ waste_value: 2000, missing_value: 0, loss_value: 2000, usage_value: 21000, loss_bps: 952 });
    });
  });

  it('staff: waiter figures, who voided, discounted and refunded, and who stands out', async () => {
    await withRollback(manager.id, async (q) => {
      await seed(q);
      const out = await range(q, 'analytics_staff');
      // Exceptions 6,000 + 2,000 + 12,000 over 119,000 revenue = 16.81%.
      expect(out.venue_exception_bps).toBe(1681);
      const staff = Object.fromEntries((out.staff as (Row & { staff_id: string })[]).map((s) => [s.staff_id, s]));

      expect(staff[waiter1.id]).toMatchObject({
        tabs: 1, covers: 4, revenue: 95000, items: 11, spend_per_cover: 23750, items_per_cover_x100: 275,
        exception_count: 0, exception_value: 0, exception_bps: 0, flagged: false,
      });
      // 12,000 voided on 24,000 handled is 50%, at least twice the venue rate, with 3 events.
      expect(staff[waiter2.id]).toMatchObject({
        tabs: 1, covers: 2, revenue: 24000, items: 8, spend_per_cover: 12000, items_per_cover_x100: 400,
        voids_count: 3, voids_value: 12000, exception_count: 3, exception_value: 12000, exception_bps: 5000, flagged: true,
      });
      // The cashier took 121,000 and has three exceptions worth 8,000 (6.61%): below twice the venue rate.
      expect(staff[cashier.id]).toMatchObject({
        tabs: 0, revenue: 0, payments_taken: 121000,
        discounts_count: 2, discounts_value: 6000, refunds_count: 1, refunds_value: 2000,
        exception_count: 3, exception_value: 8000, exception_bps: 661, flagged: false,
      });
    });
  });

  it('staff: drawer opens, paid-outs and cash variance per person', async () => {
    await withRollback(manager.id, async (q) => {
      const at = B(`${D1}T22:00:00`);
      const [shift] = await q<{ id: string }>(
        `insert into till_shifts (staff_id, device_id, opened_at, opening_float, closed_at, closed_by, counted_cash, expected_cash, variance)
         values ($1, 'T-1', $2, 0, $2, $1, 40000, 50000, -10000) returning id`,
        [cashier.id, at],
      );
      await q(`insert into drawer_events (till_shift_id, staff_id, reason, created_at) values ($1, $2, 'change', $3)`, [shift!.id, cashier.id, at]);
      await q(
        `insert into cash_movements (till_shift_id, kind, amount, reason, staff_id, idempotency_key, created_at)
         values ($1, 'paid_out', 7000, 'ice', $2, gen_random_uuid()::text, $3)`,
        [shift!.id, cashier.id, at],
      );
      const out = await range(q, 'analytics_staff');
      const me = (out.staff as (Row & { staff_id: string })[]).find((s) => s.staff_id === cashier.id);
      expect(me).toMatchObject({ drawer_opens: 1, paid_outs_count: 1, paid_outs_value: 7000, shifts: 1, cash_variance: -10000, variance_alerts: 1 });
    });
  });

  it('weekday and hour: cells by Baghdad weekday and hour, with the number of each weekday in range', async () => {
    await withRollback(manager.id, async (q) => {
      await seed(q);
      const out = await range(q, 'analytics_weekday_hour');
      // 2031-03-10 is a Monday (dow 1).
      expect(out.days).toEqual([0, 1, 0, 0, 0, 0, 0]);
      expect(out.cells).toEqual([
        { dow: 1, hour: 12, net: 0, tabs: 1 },
        { dow: 1, hour: 13, net: 95000, tabs: 0 },
        { dow: 1, hour: 20, net: 0, tabs: 1 },
        { dow: 1, hour: 21, net: 26000, tabs: 0 },
        { dow: 1, hour: 22, net: -2000, tabs: 0 },
      ]);
      const week = await range(q, 'analytics_weekday_hour', D0, D1);
      expect(week.days).toEqual([1, 2, 1, 1, 1, 1, 1]);
    });
  });

  it('price changes: the latest delivery in range against the one before it', async () => {
    await withRollback(manager.id, async (q) => {
      const ids = await seed(q);
      const deliver = async (ing: string, cost: number, at: string) => {
        const [d] = await q<{ id: string }>(
          `insert into deliveries (received_by, received_at, idempotency_key) values ($1, $2, gen_random_uuid()::text) returning id`,
          [manager.id, at],
        );
        await q(`insert into delivery_lines (delivery_id, ingredient_id, qty, unit_cost) values ($1, $2, 1000, $3)`, [d!.id, ing, cost]);
      };
      await deliver(ids.beef, 10, B('2031-02-20T10:00:00'));
      await deliver(ids.beef, 12, B(`${D1}T09:00:00`)); // up 20%
      await deliver(ids.veg, 5, B('2031-02-20T10:00:00'));
      await deliver(ids.veg, 5, B(`${D1}T09:00:00`)); // unchanged: not listed

      const out = await range(q, 'analytics_price_changes');
      const rows = (out.items as Row[]).filter((r) => [ids.beef, ids.veg].includes(r.ingredient_id as string));
      expect(rows).toHaveLength(1);
      expect(rows[0]).toMatchObject({ ingredient_id: ids.beef, old_cost: 10, new_cost: 12, change_bps: 2000 });
      expect((rows[0]!.menu_items as Row[]).map((m) => m.name_en)).toEqual(['Burger', 'Steak']);
      // The first delivery has nothing before it: a range holding only that one lists nothing.
      const earlier = await range(q, 'analytics_price_changes', '2031-02-20', '2031-02-20');
      expect((earlier.items as Row[]).filter((r) => r.ingredient_id === ids.beef)).toEqual([]);
    });
  });

  it('table turns: time at the table per area', async () => {
    await withRollback(manager.id, async (q) => {
      const ids = await seed(q);
      const out = await range(q, 'analytics_table_turns');
      // 60 minutes and 90 minutes.
      expect((out.areas as Row[]).find((a) => a.area_id === ids.area)).toMatchObject({ name_en: 'Hall', tables: 2, tabs: 2, avg_minutes: 75 });
      expect(out).toMatchObject({ tabs: 2, avg_minutes: 75 });
    });
  });

  it('attention: reports what is wrong now, and only that', async () => {
    await withRollback(manager.id, async (q) => {
      const count = async (kind: string) => {
        const out = await call<{ items: (Row & { kind: string; count: number })[] }>(q, 'analytics_attention');
        return out.items.find((i) => i.kind === kind)?.count ?? 0;
      };
      const before = {
        low: await count('low_stock'),
        negative: await count('negative_stock'),
        uncosted: await count('uncosted_items'),
        cash: await count('cash_variance'),
        prices: await count('price_rises'),
      };

      const low = await ingredient(q, { cost: 1, reorder: 10 });
      await q(`insert into stock_movements (ingredient_id, kind, qty, unit_cost) values ($1, 'delivery', 5, 1)`, [low]);
      const negative = await ingredient(q, { cost: 1 });
      await q(`insert into stock_movements (ingredient_id, kind, qty, unit_cost) values ($1, 'sale', -5, 1)`, [negative]);
      const [tax] = await q<{ id: string }>(`insert into tax_groups (name, rate_bps) values ('VAT', 0) returning id`);
      const [cat] = await q<{ id: string }>(`insert into menu_categories (name_en, name_ar) values ('X', 'س') returning id`);
      await q(`insert into menu_items (category_id, name_en, name_ar, price, tax_group_id) values ($1, 'No recipe', 'بدون', 1000, $2)`, [cat!.id, tax!.id]);
      await q(
        `insert into till_shifts (staff_id, device_id, opened_at, opening_float, closed_at, closed_by, counted_cash, expected_cash, variance)
         values ($1, 'T-9', now(), 0, now(), $1, 0, 90000, -90000)`,
        [cashier.id],
      );
      const rising = await ingredient(q, { cost: 10 });
      // In stock, so it is not also counted as low (low means on hand at or below the reorder point, as on the stock screen).
      await q(`insert into stock_movements (ingredient_id, kind, qty, unit_cost) values ($1, 'delivery', 100, 10)`, [rising]);
      for (const [cost, ago] of [[10, '3 days'], [13, '1 hour']] as const) {
        const [d] = await q<{ id: string }>(
          `insert into deliveries (received_by, received_at, idempotency_key) values ($1, now() - $2::interval, gen_random_uuid()::text) returning id`,
          [manager.id, ago],
        );
        await q(`insert into delivery_lines (delivery_id, ingredient_id, qty, unit_cost) values ($1, $2, 1, $3)`, [d!.id, rising, cost]);
      }

      expect(await count('low_stock')).toBe(before.low + 1);
      expect(await count('negative_stock')).toBe(before.negative + 1);
      expect(await count('uncosted_items')).toBe(before.uncosted + 1);
      expect(await count('cash_variance')).toBe(before.cash + 1);
      expect(await count('price_rises')).toBe(before.prices + 1);

      const out = await call<{ items: (Row & { kind: string })[] }>(q, 'analytics_attention');
      const cash = out.items.find((i) => i.kind === 'cash_variance');
      expect(cash).toMatchObject({ worst: { variance: -90000 } });
      expect(Number(cash?.value)).toBeGreaterThanOrEqual(90000);
    });
  });

  it('is for managers and owners only, and refuses a bad range', async () => {
    await withRollback(waiter1.id, async (q) => {
      await expect(range(q, 'analytics_overview')).rejects.toThrow('FORBIDDEN');
      await expect(call(q, 'analytics_attention')).rejects.toThrow('FORBIDDEN');
    });
    await withRollback(manager.id, async (q) => {
      await expect(range(q, 'analytics_staff', D1, D0)).rejects.toThrow('INVALID_RANGE');
    });
  });
});
