import { useState } from 'react';
import { Link, Outlet } from '@tanstack/react-router';
import { BrandMark, Button, Icon, Loading, type IconName } from '../components';
import { useAuth } from '../lib/auth';
import { productName } from '../lib/brand';
import { isDesktop } from '../lib/bridge';
import { useLocale } from '../lib/i18n';
import { navGroupsFor, navLayoutFor } from '../lib/navLogic';
import { GuestInbox } from '../features/guest/GuestInbox';
import { IdleLock } from './IdleLock';
import { KioskControls } from './KioskControls';

/** One icon per destination; the label under it carries the name. */
const NAV_ICONS: Record<string, IconName> = {
  '/floor': 'floor',
  '/till/shift': 'shift',
  '/manage': 'reports',
  '/manage/day': 'day',
  '/stock': 'stock',
  '/manage/menu': 'menu',
  '/manage/floor': 'floorPlan',
  '/manage/staff': 'staff',
};

/** Up to two initials for the account mark. */
function initials(name: string): string {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0]?.toUpperCase() ?? '')
    .join('');
}

export function RootLayout() {
  const { status, staff, signOut } = useAuth();
  const { tr, toggle } = useLocale();
  // The guest list hides while the idle lock is up; its chime keeps playing.
  const [locked, setLocked] = useState(false);

  if (status === 'loading') {
    return (
      <main className="rop-main">
        <Loading label={tr('auth.loadingSession')} />
      </main>
    );
  }

  const signedIn = status === 'ready' && staff;
  return (
    <div className="rop-shell" data-nav={signedIn ? navLayoutFor(staff.role) : 'bar'}>
      <a href="#main" className="rop-skip rop-btn">
        {tr('nav.skipToContent')}
      </a>
      <div className="rop-side">
        {productName && (
          <p className="rop-brand">
            <BrandMark className="rop-brand__mark" />
            <span className="rop-brand__name">{productName}</span>
          </p>
        )}
        {signedIn && (
          <nav className="rop-nav" aria-label={tr('nav.main')}>
            {navGroupsFor(staff.role).map((group) => (
              <div
                key={group.id}
                className="rop-nav__group"
                role="group"
                aria-labelledby={`nav-group-${group.id}`}
              >
                <p id={`nav-group-${group.id}`} className="rop-nav__heading">
                  {tr(group.labelKey)}
                </p>
                {group.items.map((item) => (
                  <Link key={item.to} to={item.to} activeOptions={{ exact: item.to !== '/stock' && item.to !== '/floor' }}>
                    <Icon name={NAV_ICONS[item.to] ?? 'floor'} />
                    <span className="rop-nav__label">{tr(item.labelKey)}</span>
                  </Link>
                ))}
              </div>
            ))}
          </nav>
        )}
        <header className="rop-topbar">
          {signedIn && (
            <p className="rop-topbar__user">
              <span className="rop-avatar" aria-hidden="true" title={staff.fullName}>
                {initials(staff.fullName)}
              </span>
              <span className="rop-topbar__who">
                <strong>{staff.fullName}</strong>{' '}
                <span className="rop-topbar__role">{tr(`auth.role.${staff.role}`)}</span>
              </span>
            </p>
          )}
          <Button
            className="rop-topbar__btn"
            onClick={toggle}
            aria-label={tr('auth.languageLabel')}
          >
            <Icon name="language" size={20} />
            <span className="rop-topbar__label">{tr('auth.language')}</span>
          </Button>
          {signedIn && isDesktop() && <KioskControls />}
          {signedIn && (
            <Button className="rop-topbar__btn" onClick={() => void signOut()}>
              <Icon name="signOut" size={20} />
              <span className="rop-topbar__label">{tr('auth.signOut')}</span>
            </Button>
          )}
        </header>
      </div>
      <main id="main" className="rop-main" tabIndex={-1}>
        <Outlet />
      </main>
      {signedIn && <GuestInbox hidden={locked} />}
      {signedIn && <IdleLock onLockedChange={setLocked} />}
    </div>
  );
}
