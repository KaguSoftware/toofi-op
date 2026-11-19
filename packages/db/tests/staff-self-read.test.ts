/**
 * Migration 0100: an inactive staff member can still read their own staff row (so the app can say
 * "inactive"), but nobody else's, and nothing else.
 */
import { afterAll, describe, expect, it } from 'vitest';
import { cleanupStaff, createStaffOfRole, endDb, serviceClient, stackAvailable } from './helpers';

const up = await stackAvailable();

describe.skipIf(!up)('staff self read', () => {
  afterAll(async () => {
    await cleanupStaff();
    await endDb();
  });

  it('an inactive account sees exactly its own row, flagged inactive, and no other staff', async () => {
    const waiter = await createStaffOfRole('waiter');
    await serviceClient().from('staff').update({ is_active: false }).eq('id', waiter.id);
    const own = await waiter.client.from('staff').select('id, is_active').eq('id', waiter.id);
    expect(own.error).toBeNull();
    expect(own.data).toEqual([{ id: waiter.id, is_active: false }]);
    const all = await waiter.client.from('staff').select('id');
    expect(all.data).toEqual([{ id: waiter.id }]);
    const menu = await waiter.client.from('menu_items').select('id');
    expect(menu.data).toEqual([]);
  });
});
