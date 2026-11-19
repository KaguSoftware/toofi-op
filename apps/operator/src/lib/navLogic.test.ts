import { describe, expect, it } from 'vitest';
import { guardRedirect, navFor } from './navLogic';

const tos = (role: Parameters<typeof navFor>[0]) => navFor(role).map((i) => i.to);

describe('navFor', () => {
  it('waiter sees only the floor', () => expect(tos('waiter')).toEqual(['/floor']));
  it('cashier adds till and shift', () => expect(tos('cashier')).toEqual(['/floor', '/till', '/till/shift']));
  it('manager sees manage and stock but not staff', () => {
    expect(tos('manager')).toContain('/manage/day');
    expect(tos('manager')).toContain('/stock');
    expect(tos('manager')).not.toContain('/manage/staff');
  });
  it('owner sees everything', () => expect(tos('owner')).toContain('/manage/staff'));
  it('nobody signed in sees nothing', () => expect(tos(null)).toEqual([]));
});

describe('guardRedirect', () => {
  it('does not move anyone while loading', () => expect(guardRedirect('loading', null, '/till')).toBeNull());
  it('sends signed-out visitors to /login', () => {
    expect(guardRedirect('signedOut', null, '/till')).toBe('/login');
    expect(guardRedirect('signedOut', null, '/login')).toBeNull();
  });
  it('sends signed-in people home from / and /login', () => {
    expect(guardRedirect('ready', 'waiter', '/')).toBe('/floor');
    expect(guardRedirect('ready', 'owner', '/login')).toBe('/manage');
  });
  it('sends a role away from a route it may not open', () => {
    expect(guardRedirect('ready', 'waiter', '/till')).toBe('/floor');
    expect(guardRedirect('ready', 'manager', '/manage/staff')).toBe('/manage');
    expect(guardRedirect('ready', 'cashier', '/manage')).toBe('/till');
  });
  it('lets a role stay where it may be', () => {
    expect(guardRedirect('ready', 'waiter', '/tab/abc')).toBeNull();
    expect(guardRedirect('ready', 'owner', '/manage/staff')).toBeNull();
  });
});
