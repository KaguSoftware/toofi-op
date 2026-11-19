/**
 * seed.sql: the demo staff sign in with the documented credentials, and the menu
 * and stock the seed creates are complete. Other catalog tests add rows of their
 * own (names starting `Item T`, `Area T`...), so seeded rows are matched by their
 * deterministic ids or names where a count matters.
 */
import { afterAll, describe, expect, it } from 'vitest';
import { anonClient, appRpc, endDb, sql, stackAvailable } from './helpers';

const up = await stackAvailable();

const DEMO = [
  { email: 'owner@demo.local', role: 'owner', pin: '482916' },
  { email: 'manager@demo.local', role: 'manager', pin: '735194' },
  { email: 'cashier@demo.local', role: 'cashier', pin: '264853' },
  { email: 'waiter@demo.local', role: 'waiter', pin: '917352' },
] as const;

describe.skipIf(!up)('seed', () => {
  afterAll(endDb);

  for (const d of DEMO) {
    it(`${d.email} signs in with demo-pass-123 as ${d.role} and the PIN works`, async () => {
      const c = anonClient();
      const { data, error } = await c.auth.signInWithPassword({ email: d.email, password: 'demo-pass-123' });
      expect(error).toBeNull();
      const me = await c.from('staff').select('role, is_active, venue_id').eq('id', data.user!.id);
      expect(me.data).toEqual([{ role: d.role, is_active: true, venue_id: '00000000-0000-4000-8000-000000000001' }]);
      expect((await appRpc(c, 'verify_own_pin', { p_pin: d.pin })).data).toEqual({ ok: true });
    });
  }

  it("each seeded PIN opens only its own demo account's hash", async () => {
    const rows = await sql<{ email: string; pin: string; matches: string[] }>(
      `select d.email, d.pin,
              array(select u.email from staff s join auth.users u on u.id = s.id
                     where u.email = any ($3) and s.pin_hash = extensions.crypt(d.pin, s.pin_hash)
                     order by u.email) as matches
         from unnest($1::text[], $2::text[]) as d(email, pin)`,
      [DEMO.map((d) => d.email), DEMO.map((d) => d.pin), DEMO.map((d) => d.email)],
    );
    expect(rows).toHaveLength(4);
    for (const r of rows) expect(r.matches, r.email).toEqual([r.email]);
  });

  it('every active menu item has a price, both names (Arabic in Arabic script), a category and a tax group', async () => {
    const items = await sql<{ n: string; bad: string; no_arabic: string }>(
      `select count(*) n,
              count(*) filter (where price is null or btrim(name_en) = '' or btrim(name_ar) = ''
                                 or category_id is null or tax_group_id is null) bad,
              count(*) filter (where name_ar !~ '[؀-ۿ]') no_arabic
         from menu_items where is_active and created_at <= (select created_at from staff where id = '00000000-0000-4000-8000-0000000000a1')`);
    expect(Number(items[0]!.n)).toBeGreaterThanOrEqual(28);
    expect(items[0]!.bad).toBe('0');
    expect(items[0]!.no_arabic).toBe('0');
    const priced = await sql<{ lo: string; hi: string }>(
      `select min(price)::text lo, max(price)::text hi from menu_items where is_active and created_at <= (select created_at from staff where id = '00000000-0000-4000-8000-0000000000a1')`);
    expect(Number(priced[0]!.lo)).toBeGreaterThanOrEqual(1000);
    expect(Number(priced[0]!.hi)).toBeLessThanOrEqual(25000);
  });

  it('tax groups, floor, modifiers and settings are seeded', async () => {
    const tax = await sql(
      `select name, rate_bps from tax_groups where id in (md5('tax:none')::uuid, md5('tax:service')::uuid) order by rate_bps`);
    expect(tax).toEqual([{ name: 'No tax', rate_bps: 0 }, { name: 'Service', rate_bps: 1000 }]);
    const areas = await sql<{ n: string }>(
      `select count(*) n from floor_areas where id in (md5('area:indoor')::uuid, md5('area:terrace')::uuid)`);
    expect(areas[0]!.n).toBe('2');
    const tables = await sql<{ n: string }>(`select count(*) n from dining_tables where id = any (
      array(select md5('table:T' || g)::uuid from generate_series(1, 12) g))`);
    expect(tables[0]!.n).toBe('12');
    const groups = await sql<{ min_select: number }>(`select min_select from modifier_groups`);
    expect(groups.length).toBeGreaterThanOrEqual(2);
    expect(groups.some((g) => g.min_select > 0)).toBe(true);
    const settings = await sql<{ h: string; f: string }>(
      `select receipt_header_ar h, receipt_footer_ar f from venue_settings`);
    expect(settings[0]!.h).not.toBe('');
    expect(settings[0]!.f).not.toBe('');
    const cats = await sql<{ n: string }>(`select count(*) n from menu_categories where id = any (
      array(select md5('cat:' || k)::uuid from unnest(array['mezze','grills','mains','sandwich','desserts','hot','cold']) k))`);
    expect(cats[0]!.n).toBe('7');
  });

  it('every ingredient has opening stock from the seed delivery, and most items have recipes', async () => {
    const ing = await sql<{ n: string; empty: string; low: string }>(
      `select count(*) n,
              count(*) filter (where on_hand <= 0) empty,
              count(*) filter (where on_hand <= reorder_point) low
         from (select i.reorder_point,
                      coalesce((select sum(m.qty) from stock_movements m where m.ingredient_id = i.id), 0) on_hand
                 from ingredients i) s`);
    expect(Number(ing[0]!.n)).toBeGreaterThanOrEqual(25);
    expect(ing[0]!.empty).toBe('0');
    expect(ing[0]!.low).toBe('0');
    const moves = await sql<{ kinds: string[]; refs: string }>(
      `select array_agg(distinct kind::text) kinds, count(distinct ref_id)::text refs
         from stock_movements where ref_table = 'deliveries'`);
    expect(moves[0]!.kinds).toEqual(['delivery']);
    expect(moves[0]!.refs).toBe('1');
    const recipes = await sql<{ with_recipe: string; total: string }>(
      `select count(*) filter (where exists (select 1 from recipe_lines r where r.menu_item_id = i.id))::text with_recipe,
              count(*)::text total from menu_items i where i.created_at <= (select created_at from staff where id = '00000000-0000-4000-8000-0000000000a1')`);
    expect(Number(recipes[0]!.with_recipe)).toBeGreaterThanOrEqual(Number(recipes[0]!.total) * 0.8);
  });
});
