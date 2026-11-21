// Pure: which nav links a role sees, and where a visitor must be sent.
import { canAccess, homeRouteFor, type StaffRole } from '@rop/core';
import type { MessageKey } from '@rop/i18n';

export type NavGroupId = 'service' | 'business' | 'setup';

export interface NavItem {
  to: string;
  labelKey: MessageKey;
  group: NavGroupId;
}

/** Every top-level link. Visibility comes from @rop/core canAccess; nothing is hard-coded per role. */
export const NAV_ITEMS: readonly NavItem[] = [
  { to: '/floor', labelKey: 'nav.floor', group: 'service' },
  { to: '/till', labelKey: 'nav.till', group: 'service' },
  { to: '/till/shift', labelKey: 'nav.shift', group: 'service' },
  { to: '/manage', labelKey: 'nav.manage', group: 'business' },
  { to: '/manage/day', labelKey: 'nav.day', group: 'business' },
  { to: '/stock', labelKey: 'nav.stock', group: 'business' },
  { to: '/manage/menu', labelKey: 'nav.menu', group: 'setup' },
  { to: '/manage/floor', labelKey: 'nav.floorPlan', group: 'setup' },
  { to: '/manage/staff', labelKey: 'nav.staff', group: 'setup' },
];

export function navFor(role: StaffRole | null | undefined): NavItem[] {
  return NAV_ITEMS.filter((item) => canAccess(role, item.to));
}

export interface NavGroup {
  id: NavGroupId;
  labelKey: MessageKey;
  items: NavItem[];
}

const GROUP_LABELS: Record<NavGroupId, MessageKey> = {
  service: 'nav.group.service',
  business: 'nav.group.business',
  setup: 'nav.group.setup',
};

/** The role's links in their groups, in NAV_ITEMS order; a group with no visible link is left out. */
export function navGroupsFor(role: StaffRole | null | undefined): NavGroup[] {
  const groups: NavGroup[] = [];
  for (const item of navFor(role)) {
    const last = groups[groups.length - 1];
    if (last && last.id === item.group) last.items.push(item);
    else groups.push({ id: item.group, labelKey: GROUP_LABELS[item.group], items: [item] });
  }
  return groups;
}

/** A rail only earns its width when there are several destinations; one link sits in the bar. */
export const navLayoutFor = (role: StaffRole | null | undefined): 'rail' | 'bar' => (navFor(role).length > 1 ? 'rail' : 'bar');

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
