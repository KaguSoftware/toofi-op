import { describe, expect, it } from 'vitest';
import { guardRedirect, navFor, navGroupsFor, navLayoutFor } from './navLogic';

const tos = (role: Parameters<typeof navFor>[0]) => navFor(role).map((i) => i.to);

describe('navFor', () => {
  it('waiter sees only the floor', () => expect(tos('waiter')).toEqual(['/floor']));
  it('cashier adds the shift', () => expect(tos('cashier')).toEqual(['/floor', '/till/shift']));
  it('manager sees manage and stock but not staff', () => {
    expect(tos('manager')).toContain('/manage/day');
    expect(tos('manager')).toContain('/stock');
    expect(tos('manager')).not.toContain('/manage/staff');
  });
  it('owner sees everything', () => expect(tos('owner')).toContain('/manage/staff'));
  it('nobody signed in sees nothing', () => expect(tos(null)).toEqual([]));
});

describe('navGroupsFor', () => {
  const shape = (role: Parameters<typeof navGroupsFor>[0]) => navGroupsFor(role).map((g) => [g.id, g.items.map((i) => i.to)]);
  it('waiter gets one group with the floor', () => expect(shape('waiter')).toEqual([['service', ['/floor']]]));
  it('cashier stays inside service', () => expect(shape('cashier')).toEqual([['service', ['/floor', '/till/shift']]]));
  it('manager gets service, business and setup without staff', () =>
    expect(shape('manager')).toEqual([
      ['service', ['/floor', '/till/shift']],
      ['business', ['/manage', '/manage/day', '/stock']],
      ['setup', ['/manage/menu', '/manage/floor']],
    ]));
  it('owner also gets staff under setup', () => expect(shape('owner')[2]).toEqual(['setup', ['/manage/menu', '/manage/floor', '/manage/staff']]));
  it('every link of the role appears exactly once', () =>
    expect(navGroupsFor('owner').flatMap((g) => g.items)).toEqual(navFor('owner')));
  it('nobody signed in gets no groups', () => expect(navGroupsFor(null)).toEqual([]));
});

describe('navLayoutFor', () => {
  it('a single destination uses the bar', () => expect(navLayoutFor('waiter')).toBe('bar'));
  it('several destinations use the rail', () => {
    expect(navLayoutFor('cashier')).toBe('rail');
    expect(navLayoutFor('owner')).toBe('rail');
  });
  it('nobody signed in uses the bar', () => expect(navLayoutFor(null)).toBe('bar'));
});

describe('guardRedirect', () => {
  it('does not move anyone while loading', () => expect(guardRedirect('loading', null, '/floor/bills')).toBeNull());
  it('sends signed-out visitors to /login', () => {
    expect(guardRedirect('signedOut', null, '/floor/bills')).toBe('/login');
    expect(guardRedirect('signedOut', null, '/login')).toBeNull();
  });
  it('sends signed-in people home from / and /login', () => {
    expect(guardRedirect('ready', 'waiter', '/')).toBe('/floor');
    expect(guardRedirect('ready', 'owner', '/login')).toBe('/manage');
  });
  it('sends a role away from a route it may not open', () => {
    expect(guardRedirect('ready', 'waiter', '/floor/bills')).toBe('/floor');
    expect(guardRedirect('ready', 'waiter', '/till/shift')).toBe('/floor');
    expect(guardRedirect('ready', 'manager', '/manage/staff')).toBe('/manage');
    expect(guardRedirect('ready', 'cashier', '/manage')).toBe('/floor');
  });
  it('lets a role stay where it may be', () => {
    expect(guardRedirect('ready', 'waiter', '/tab/abc')).toBeNull();
    expect(guardRedirect('ready', 'owner', '/manage/staff')).toBeNull();
  });
});
