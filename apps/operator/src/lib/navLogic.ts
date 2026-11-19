// Pure: which nav links a role sees, and where a visitor must be sent.
import { canAccess, homeRouteFor, type StaffRole } from '@rop/core';
import type { MessageKey } from '@rop/i18n';

export interface NavItem {
  to: string;
  labelKey: MessageKey;
}

/** Every top-level link. Visibility comes from @rop/core canAccess; nothing is hard-coded per role. */
export const NAV_ITEMS: readonly NavItem[] = [
  { to: '/floor', labelKey: 'nav.floor' },
  { to: '/till', labelKey: 'nav.till' },
  { to: '/till/shift', labelKey: 'nav.shift' },
  { to: '/manage', labelKey: 'nav.manage' },
  { to: '/manage/day', labelKey: 'nav.day' },
  { to: '/manage/menu', labelKey: 'nav.menu' },
  { to: '/manage/floor', labelKey: 'nav.floorPlan' },
  { to: '/manage/staff', labelKey: 'nav.staff' },
  { to: '/stock', labelKey: 'nav.stock' },
];

export function navFor(role: StaffRole | null | undefined): NavItem[] {
  return NAV_ITEMS.filter((item) => canAccess(role, item.to));
}

export type AuthStatus = 'loading' | 'signedOut' | 'ready';

/**
 * Where to send a visitor, or null to let them stay.
 * Signed out: everything but /login goes to /login. Signed in: /login and / go home,
 * and a route the role may not open goes home too. While loading nobody is moved.
 */
export function guardRedirect(
  status: AuthStatus,
  role: StaffRole | null,
  pathname: string,
): string | null {
  if (status === 'loading') return null;
  if (status === 'signedOut' || !role) return pathname === '/login' ? null : '/login';
  if (pathname === '/login' || pathname === '/') return homeRouteFor(role);
  return canAccess(role, pathname) ? null : homeRouteFor(role);
}
