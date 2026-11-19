import { describe, expect, it } from 'vitest';
import {
  STAFF_ROLES,
  ROUTE_ROLES,
  CAPABILITY_ROLES,
  canAccess,
  can,
  homeRouteFor,
  isStaffRole,
  needsManagerPin,
  type Capability,
  type StaffRole,
} from './roles';

describe('STAFF_ROLES', () => {
  it('is exactly the four roles of the staff_role enum, in enum order', () => {
    expect(STAFF_ROLES).toEqual(['waiter', 'cashier', 'manager', 'owner']);
  });

  it('isStaffRole accepts only those four', () => {
    expect(isStaffRole('waiter')).toBe(true);
    expect(isStaffRole('owner')).toBe(true);
    expect(isStaffRole('court_desk')).toBe(false);
    expect(isStaffRole('')).toBe(false);
    expect(isStaffRole(undefined)).toBe(false);
  });
});

describe('canAccess (SPEC routes)', () => {
  const table: Array<[route: string, allowed: StaffRole[]]> = [
    ['/floor', ['waiter', 'cashier', 'manager', 'owner']],
    ['/tab', ['waiter', 'cashier', 'manager', 'owner']],
    ['/till', ['cashier', 'manager', 'owner']],
    ['/manage', ['manager', 'owner']],
    ['/stock', ['manager', 'owner']],
    ['/manage/staff', ['owner']],
  ];

  for (const [route, allowed] of table) {
    for (const role of STAFF_ROLES) {
      const expected = allowed.includes(role);
      it(`${role} ${expected ? 'can' : 'cannot'} open ${route}`, () => {
        expect(canAccess(role, route)).toBe(expected);
      });
    }
  }

  it('a sub-route inherits its closest listed parent', () => {
    expect(canAccess('waiter', '/tab/123')).toBe(true);
    expect(canAccess('manager', '/manage/menu')).toBe(true);
    expect(canAccess('manager', '/manage/staff/abc')).toBe(false);
    expect(canAccess('owner', '/manage/staff/abc')).toBe(true);
  });

  it('ignores query strings, hashes and trailing slashes', () => {
    expect(canAccess('cashier', '/till/?x=1')).toBe(true);
    expect(canAccess('waiter', '/till#top')).toBe(false);
  });

  it('refuses unknown routes, look-alike prefixes and missing roles', () => {
    expect(canAccess('owner', '/nowhere')).toBe(false);
    expect(canAccess('owner', '/floorplan')).toBe(false);
    expect(canAccess(null, '/floor')).toBe(false);
    expect(canAccess(undefined, '/floor')).toBe(false);
  });

  it('lists every SPEC route', () => {
    expect(Object.keys(ROUTE_ROLES).sort()).toEqual(
      ['/floor', '/manage', '/manage/staff', '/stock', '/tab', '/till'].sort(),
    );
  });
});

describe('can / needsManagerPin (SPEC role table)', () => {
  // [capability, roles that may act directly, roles that may act with a manager PIN]
  const table: Array<[Capability, StaffRole[], StaffRole[]]> = [
    ['openTab', ['waiter', 'cashier', 'manager', 'owner'], []],
    ['voidSentLine', ['manager', 'owner'], ['waiter', 'cashier']],
    ['takePayment', ['cashier', 'manager', 'owner'], []],
    ['discount', ['manager', 'owner'], ['cashier']],
    ['refund', ['manager', 'owner'], ['cashier']],
    ['cancelTab', ['manager', 'owner'], ['cashier']],
    ['closeOthersShift', ['manager', 'owner'], ['cashier']],
    ['manageDay', ['manager', 'owner'], []],
    ['viewAnalytics', ['manager', 'owner'], []],
    ['manageStock', ['manager', 'owner'], []],
    ['adminCatalog', ['manager', 'owner'], []],
    ['adminStaff', ['owner'], []],
    ['editVenueSettings', ['owner'], []],
    ['setStaffPin', ['owner'], []],
  ];

  it('covers every capability', () => {
    expect(table.map(([c]) => c).sort()).toEqual(Object.keys(CAPABILITY_ROLES).sort());
  });

  for (const [capability, direct, withPin] of table) {
    it(`${capability}: direct ${direct.join(', ')}; with PIN ${withPin.join(', ') || 'nobody'}`, () => {
      for (const role of STAFF_ROLES) {
        expect(can(role, capability)).toBe(direct.includes(role));
        expect(needsManagerPin(role, capability)).toBe(withPin.includes(role));
      }
    });
  }

  it('nobody without a role can do anything', () => {
    for (const capability of Object.keys(CAPABILITY_ROLES) as Capability[]) {
      expect(can(null, capability)).toBe(false);
      expect(needsManagerPin(null, capability)).toBe(false);
    }
  });
});

describe('homeRouteFor', () => {
  it('sends each role to a screen it can open', () => {
    expect(homeRouteFor('waiter')).toBe('/floor');
    expect(homeRouteFor('cashier')).toBe('/till');
    expect(homeRouteFor('manager')).toBe('/manage');
    expect(homeRouteFor('owner')).toBe('/manage');
    for (const role of STAFF_ROLES) expect(canAccess(role, homeRouteFor(role))).toBe(true);
  });
});
