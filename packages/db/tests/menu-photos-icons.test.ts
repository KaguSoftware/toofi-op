/**
 * Dish photos and category icons (0150+): the icon column and its fixed keys,
 * set_menu_category_icon, the photo path and set_menu_item_photo, guest_menu
 * carrying both, and the `menu-photos` storage bucket's policy. Role gates are in
 * rls-matrix.ts.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { CATEGORY_ICONS } from '@rop/core';
import {
  SUPABASE_URL,
  VENUE_ID,
  anonClient,
  appRpc,
  cleanupStaff,
  createStaffOfRole,
  endDb,
  serviceClient,
  sql,
  stackAvailable,
  type TestStaff,
} from './helpers';
import { makeMenu, type Menu } from './money-fixtures';
import { guestRpc } from './guest-fixtures';

const up = await stackAvailable();

const BUCKET = 'menu-photos';
const OTHER_VENUE = '00000000-0000-4000-8000-0000000000ff';

type MenuJson = {
  categories: { id: string; icon: string; items: { id: string; photo_path: string | null }[] }[];
};

/** A tiny body of the given type and size (the bucket checks type and size, not content). */
function blob(type: string, bytes = 64): Blob {
  return new Blob([new Uint8Array(bytes)], { type });
}

let fileCounter = 0;
const uploaded: string[] = [];

function itemPhotoPath(itemId: string, venue = VENUE_ID): string {
  return `${venue}/items/${itemId}/${Date.now()}-${fileCounter++}.webp`;
}

describe.skipIf(!up)('dish photos and category icons', () => {
  let manager: TestStaff;
  let owner: TestStaff;
  let waiter: TestStaff;
  let menu: Menu;
  let categoryId: string;

  beforeAll(async () => {
    manager = await createStaffOfRole('manager');
    owner = await createStaffOfRole('owner');
    waiter = await createStaffOfRole('waiter');
    menu = await makeMenu();
    const [row] = await sql<{ category_id: string }>(`select category_id from menu_items where id = $1`, [menu.burger]);
    categoryId = row!.category_id;
  });

  afterAll(async () => {
    if (uploaded.length) await serviceClient().storage.from(BUCKET).remove(uploaded);
    await cleanupStaff();
    await endDb();
  });

  describe('category icons', () => {
    it('a new category gets the icon dish', async () => {
      const [row] = await sql<{ icon: string }>(`select icon from menu_categories where id = $1`, [categoryId]);
      expect(row!.icon).toBe('dish');
    });

    it('the column accepts exactly CATEGORY_ICONS from @rop/core', async () => {
      const [row] = await sql<{ def: string }>(
        `select pg_get_constraintdef(oid) as def from pg_constraint where conname = 'menu_categories_icon_check'`,
      );
      expect(row, 'menu_categories_icon_check exists').toBeDefined();
      const keys = [...row!.def.matchAll(/'([a-z_]+)'/g)].map((m) => m[1]);
      expect([...keys].sort()).toEqual([...CATEGORY_ICONS].sort());
    });

    it('set_menu_category_icon sets every key, returns it, and audits the change', async () => {
      for (const icon of CATEGORY_ICONS) {
        const { data, error } = await appRpc(manager.client, 'set_menu_category_icon', {
          p_category_id: categoryId,
          p_icon: icon,
        });
        expect(error, icon).toBeNull();
        expect(data).toEqual({ category_id: categoryId, icon });
      }
      const [row] = await sql<{ icon: string }>(`select icon from menu_categories where id = $1`, [categoryId]);
      expect(row!.icon).toBe(CATEGORY_ICONS[CATEGORY_ICONS.length - 1]);
      const [audit] = await sql<{ actor_id: string; before: { icon: string }; after: { icon: string } }>(
        `select actor_id, before, after from audit_log
          where action = 'menu_category.set_icon' and entity_id = $1 order by created_at desc limit 1`,
        [categoryId],
      );
      expect(audit).toMatchObject({ actor_id: manager.id, after: { icon: 'cold_drink' }, before: { icon: 'hot_drink' } });
    });

    it('an owner may set an icon too', async () => {
      const { error } = await appRpc(owner.client, 'set_menu_category_icon', { p_category_id: categoryId, p_icon: 'grill' });
      expect(error).toBeNull();
    });

    it('an unknown, blank or missing key is INVALID_ICON and changes nothing', async () => {
      await appRpc(manager.client, 'set_menu_category_icon', { p_category_id: categoryId, p_icon: 'mezze' });
      for (const icon of ['pizza', '', 'DISH', null]) {
        const { error } = await appRpc(manager.client, 'set_menu_category_icon', { p_category_id: categoryId, p_icon: icon });
        expect(error?.message, String(icon)).toBe('INVALID_ICON');
      }
      const [row] = await sql<{ icon: string }>(`select icon from menu_categories where id = $1`, [categoryId]);
      expect(row!.icon).toBe('mezze');
    });

    it('an unknown category is CATEGORY_NOT_FOUND', async () => {
      const { error } = await appRpc(manager.client, 'set_menu_category_icon', {
        p_category_id: '00000000-0000-4000-8000-00000000dead',
        p_icon: 'dish',
      });
      expect(error?.message).toBe('CATEGORY_NOT_FOUND');
    });

    it('each seed category has a fitting icon', async () => {
      const rows = await sql<{ k: string; icon: string }>(
        `select k, (select icon from menu_categories where id = md5('cat:' || k)::uuid) as icon
           from unnest(array['mezze','grills','mains','sandwich','desserts','hot','cold']) as k`,
      );
      expect(Object.fromEntries(rows.map((r) => [r.k, r.icon]))).toEqual({
        mezze: 'mezze',
        grills: 'grill',
        mains: 'main',
        sandwich: 'sandwich',
        desserts: 'dessert',
        hot: 'hot_drink',
        cold: 'cold_drink',
      });
    });
  });

  describe('dish photos', () => {
    it('a dish has no photo until one is set', async () => {
      const [row] = await sql<{ photo_path: string | null }>(`select photo_path from menu_items where id = $1`, [menu.tea]);
      expect(row!.photo_path).toBeNull();
    });

    it('set_menu_item_photo records a path under the venue and the item, audited; null clears it', async () => {
      const path = itemPhotoPath(menu.tea);
      const set = await appRpc(manager.client, 'set_menu_item_photo', { p_item_id: menu.tea, p_photo_path: path });
      expect(set.error).toBeNull();
      expect(set.data).toEqual({ menu_item_id: menu.tea, photo_path: path });
      const [audit] = await sql<{ actor_id: string; before: unknown; after: unknown }>(
        `select actor_id, before, after from audit_log
          where action = 'menu_item.set_photo' and entity_id = $1 order by created_at desc limit 1`,
        [menu.tea],
      );
      expect(audit).toMatchObject({ actor_id: manager.id, before: { photo_path: null }, after: { photo_path: path } });

      const clear = await appRpc(owner.client, 'set_menu_item_photo', { p_item_id: menu.tea, p_photo_path: null });
      expect(clear.error).toBeNull();
      expect(clear.data).toEqual({ menu_item_id: menu.tea, photo_path: null });
      const [row] = await sql<{ photo_path: string | null }>(`select photo_path from menu_items where id = $1`, [menu.tea]);
      expect(row!.photo_path).toBeNull();
    });

    it('a path outside {venue_id}/items/{item_id}/ is PHOTO_PATH_INVALID and changes nothing', async () => {
      const good = itemPhotoPath(menu.steak);
      await appRpc(manager.client, 'set_menu_item_photo', { p_item_id: menu.steak, p_photo_path: good });
      const bad = [
        `${OTHER_VENUE}/items/${menu.steak}/a.webp`, // another venue
        `${VENUE_ID}/items/${menu.burger}/a.webp`, // another dish
        `${VENUE_ID}/categories/${menu.steak}/a.webp`, // wrong folder
        `${VENUE_ID}/items/${menu.steak}/`, // no file name
        `${VENUE_ID}/items/${menu.steak}/../../../x.webp`, // climbs out
        `${VENUE_ID}/items/${menu.steak}/sub/a.webp`, // deeper folder
        `https://example.com/${VENUE_ID}/items/${menu.steak}/a.webp`, // a full URL
        '',
      ];
      for (const p of bad) {
        const { error } = await appRpc(manager.client, 'set_menu_item_photo', { p_item_id: menu.steak, p_photo_path: p });
        expect(error?.message, p).toBe('PHOTO_PATH_INVALID');
      }
      const [row] = await sql<{ photo_path: string }>(`select photo_path from menu_items where id = $1`, [menu.steak]);
      expect(row!.photo_path).toBe(good);
    });

    it('an unknown dish is ITEM_NOT_FOUND', async () => {
      const id = '00000000-0000-4000-8000-00000000dead';
      const { error } = await appRpc(manager.client, 'set_menu_item_photo', {
        p_item_id: id,
        p_photo_path: `${VENUE_ID}/items/${id}/a.webp`,
      });
      expect(error?.message).toBe('ITEM_NOT_FOUND');
    });
  });

  describe('guest_menu', () => {
    it('carries each category icon and each dish photo_path (null when none)', async () => {
      const path = itemPhotoPath(menu.burger);
      await appRpc(manager.client, 'set_menu_item_photo', { p_item_id: menu.burger, p_photo_path: path });
      await appRpc(manager.client, 'set_menu_item_photo', { p_item_id: menu.tea, p_photo_path: null });
      await appRpc(manager.client, 'set_menu_category_icon', { p_category_id: categoryId, p_icon: 'grill' });
      const { data, error } = await guestRpc('guest_menu');
      expect(error).toBeNull();
      const m = data as MenuJson;
      const cat = m.categories.find((c) => c.id === categoryId)!;
      expect(cat.icon).toBe('grill');
      expect(cat.items.find((i) => i.id === menu.burger)!.photo_path).toBe(path);
      const tea = cat.items.find((i) => i.id === menu.tea)!;
      expect(tea).toHaveProperty('photo_path', null);
      for (const c of m.categories) {
        expect(CATEGORY_ICONS as readonly string[]).toContain(c.icon);
        for (const i of c.items) expect(i).toHaveProperty('photo_path');
      }
    });
  });

  describe('menu-photos bucket', () => {
    it('is public, 1 MB, WebP and JPEG only', async () => {
      const [b] = await sql<{ public: boolean; file_size_limit: string; allowed_mime_types: string[] }>(
        `select public, file_size_limit, allowed_mime_types from storage.buckets where id = $1`,
        [BUCKET],
      );
      expect(b).toBeDefined();
      expect(b!.public).toBe(true);
      expect(Number(b!.file_size_limit)).toBe(1024 * 1024);
      expect([...b!.allowed_mime_types].sort()).toEqual(['image/jpeg', 'image/webp']);
    });

    it('a manager uploads under the venue folder, and anyone can read it', async () => {
      const path = itemPhotoPath(menu.burger);
      const up1 = await manager.client.storage.from(BUCKET).upload(path, blob('image/webp'), { contentType: 'image/webp' });
      expect(up1.error).toBeNull();
      uploaded.push(path);
      const res = await fetch(`${SUPABASE_URL}/storage/v1/object/public/${BUCKET}/${path}`);
      expect(res.status).toBe(200);
      const listed = await anonClient().storage.from(BUCKET).download(path);
      expect(listed.error).toBeNull();
    });

    it('an owner can upload a JPEG, replace it and delete it', async () => {
      const path = `${VENUE_ID}/items/${menu.steak}/${Date.now()}-${fileCounter++}.jpg`;
      const s = owner.client.storage.from(BUCKET);
      expect((await s.upload(path, blob('image/jpeg'), { contentType: 'image/jpeg' })).error).toBeNull();
      uploaded.push(path);
      expect((await s.upload(path, blob('image/jpeg', 128), { contentType: 'image/jpeg', upsert: true })).error).toBeNull();
      const del = await s.remove([path]);
      expect(del.error).toBeNull();
      expect(del.data).toHaveLength(1);
    });

    it('a waiter and anon cannot upload', async () => {
      for (const c of [waiter.client, anonClient()]) {
        const path = itemPhotoPath(menu.burger);
        const { error } = await c.storage.from(BUCKET).upload(path, blob('image/webp'), { contentType: 'image/webp' });
        expect(error, 'upload was allowed').not.toBeNull();
        uploaded.push(path);
      }
    });

    it('nobody can write outside their own venue folder', async () => {
      for (const path of [itemPhotoPath(menu.burger, OTHER_VENUE), `items/${menu.burger}/a.webp`, 'a.webp']) {
        const { error } = await manager.client.storage
          .from(BUCKET)
          .upload(path, blob('image/webp'), { contentType: 'image/webp' });
        expect(error, `${path} was allowed`).not.toBeNull();
        uploaded.push(path);
      }
    });

    it('a waiter cannot replace or delete a photo', async () => {
      const path = itemPhotoPath(menu.burger);
      await manager.client.storage.from(BUCKET).upload(path, blob('image/webp'), { contentType: 'image/webp' });
      uploaded.push(path);
      const w = waiter.client.storage.from(BUCKET);
      const replace = await w.upload(path, blob('image/webp', 128), { contentType: 'image/webp', upsert: true });
      expect(replace.error, 'replace was allowed').not.toBeNull();
      const del = await w.remove([path]);
      expect(del.data ?? []).toHaveLength(0);
      const [row] = await sql<{ n: string }>(`select count(*) n from storage.objects where bucket_id = $1 and name = $2`, [
        BUCKET,
        path,
      ]);
      expect(row!.n).toBe('1');
    });

    it('refuses another file type and anything over 1 MB', async () => {
      const s = manager.client.storage.from(BUCKET);
      const png = itemPhotoPath(menu.burger).replace(/\.webp$/, '.png');
      expect((await s.upload(png, blob('image/png'), { contentType: 'image/png' })).error).not.toBeNull();
      const big = itemPhotoPath(menu.burger);
      expect((await s.upload(big, blob('image/webp', 1024 * 1024 + 1), { contentType: 'image/webp' })).error).not.toBeNull();
      uploaded.push(png, big);
    });
  });
});
