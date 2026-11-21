/**
 * The four staff roles, which screens each may open, and what each may do.
 *
 * This is UX only: it decides which screens and buttons a person sees. The wall is
 * the server, where every `app.*` function checks the role itself. Keep these tables
 * in step with docs/SPEC.md (Roles) and the guards in the migrations.
 *
 * Pure: no supabase, no react.
 */

/** Every value of the `staff_role` enum, in the enum's own order. */
export const STAFF_ROLES = ['waiter', 'cashier', 'manager', 'owner'] as const;

export type StaffRole = (typeof STAFF_ROLES)[number];

const ALL: readonly StaffRole[] = STAFF_ROLES;
const CASHIER_UP: readonly StaffRole[] = ['cashier', 'manager', 'owner'];
const MANAGER_UP: readonly StaffRole[] = ['manager', 'owner'];
const OWNER: readonly StaffRole[] = ['owner'];

/** True for a value of the `staff_role` enum. */
export function isStaffRole(value: unknown): value is StaffRole {
  return typeof value === 'string' && (STAFF_ROLES as readonly string[]).includes(value);
}

/**
 * Which roles may open each route. A route not listed here inherits from its closest
 * listed ancestor (`/tab/123` from `/tab`); an unlisted top-level route is closed.
 */
export const ROUTE_ROLES: Readonly<Record<string, readonly StaffRole[]>> = {
  '/floor': ALL,
  '/tab': ALL,
  '/till': CASHIER_UP,
  '/manage': MANAGER_UP,
  '/stock': MANAGER_UP,
  '/manage/staff': OWNER,
};

/**
 * Capabilities inside screens, from the SPEC role table: the roles that may act
 * directly. Where SPEC says "PIN", the role is in PIN_CAPABILITY_ROLES instead and
 * needs a manager PIN (verify_manager_pin, then the server consumes the grant).
 */
export const CAPABILITY_ROLES = {
  /** See the floor, open tabs, add items, transfer and merge their own open tabs. */
  openTab: ALL,
  /** Void a line that was already sent. */
  voidSentLine: MANAGER_UP,
  /** Take payments, settle, split, open the drawer, run their own till shift. */
  takePayment: CASHIER_UP,
  discount: MANAGER_UP,
  refund: MANAGER_UP,
  /** Cancel (void) a tab that has lines on it. */
  cancelTab: MANAGER_UP,
  /** Close another person's till shift. */
  closeOthersShift: MANAGER_UP,
  /** Record cash put in or taken out of the drawer without a sale (paid-out, pay-in, drop). */
  cashMovement: MANAGER_UP,
  /** Open and close the business day. */
  manageDay: MANAGER_UP,
  viewAnalytics: MANAGER_UP,
  manageStock: MANAGER_UP,
  /** Admin for menu, floor and stock items. */
  adminCatalog: MANAGER_UP,
  adminStaff: OWNER,
  editVenueSettings: OWNER,
  /** Set another staff member's PIN. */
  setStaffPin: OWNER,
} as const satisfies Record<string, readonly StaffRole[]>;

export type Capability = keyof typeof CAPABILITY_ROLES;

/** The roles that may do a capability only with a manager PIN. */
export const PIN_CAPABILITY_ROLES: Readonly<Partial<Record<Capability, readonly StaffRole[]>>> = {
  voidSentLine: ['waiter', 'cashier'],
  discount: ['cashier'],
  refund: ['cashier'],
  cancelTab: ['cashier'],
  closeOthersShift: ['cashier'],
  cashMovement: ['cashier'],
};

/** Strip query/hash and trailing slashes so '/till/?x' matches '/till'. */
function normalizeRoute(route: string): string {
  const bare = route.replace(/[?#].*$/, '').replace(/\/+$/, '');
  return bare === '' ? '/' : bare;
}

/** Longest ROUTE_ROLES key equal to the route or one of its path ancestors. */
function matchRouteKey(route: string): string | undefined {
  const target = normalizeRoute(route);
  let best: string | undefined;
  for (const key of Object.keys(ROUTE_ROLES)) {
    if (target === key || target.startsWith(`${key}/`)) {
      if (best === undefined || key.length > best.length) best = key;
    }
  }
  return best;
}

/** Whether a role may open a route. */
export function canAccess(role: StaffRole | null | undefined, route: string): boolean {
  if (!role) return false;
  const key = matchRouteKey(route);
  return key !== undefined && (ROUTE_ROLES[key]?.includes(role) ?? false);
}

/** Whether a role may do a capability directly, without a manager PIN. */
export function can(role: StaffRole | null | undefined, capability: Capability): boolean {
  if (!role) return false;
  return (CAPABILITY_ROLES[capability] as readonly StaffRole[]).includes(role);
}

/** Whether a role may do a capability, but only after a manager PIN. */
export function needsManagerPin(role: StaffRole | null | undefined, capability: Capability): boolean {
  if (!role) return false;
  return PIN_CAPABILITY_ROLES[capability]?.includes(role) ?? false;
}

const HOME: Record<StaffRole, string> = {
  waiter: '/floor',
  cashier: '/till',
  manager: '/manage',
  owner: '/manage',
};

/** The screen a role lands on after signing in. */
export function homeRouteFor(role: StaffRole): string {
  return HOME[role];
}
