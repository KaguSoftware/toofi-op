import { Link, Outlet } from '@tanstack/react-router';
import { Button, Loading } from '../components';
import { useAuth } from '../lib/auth';
import { productName } from '../lib/brand';
import { isDesktop } from '../lib/bridge';
import { useLocale } from '../lib/i18n';
import { navGroupsFor, navLayoutFor } from '../lib/navLogic';
import { IdleLock } from './IdleLock';
import { KioskControls } from './KioskControls';

export function RootLayout() {
  const { status, staff, signOut } = useAuth();
  const { tr, toggle } = useLocale();

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
        {productName && <p className="rop-brand">{productName}</p>}
        {signedIn && (
          <nav className="rop-nav" aria-label={tr('nav.main')}>
            {navGroupsFor(staff.role).map((group) => (
              <div key={group.id} className="rop-nav__group" role="group" aria-labelledby={`nav-group-${group.id}`}>
                <p id={`nav-group-${group.id}`} className="rop-nav__heading">
                  {tr(group.labelKey)}
                </p>
                {group.items.map((item) => (
                  <Link key={item.to} to={item.to} activeOptions={{ exact: true }}>
                    {tr(item.labelKey)}
                  </Link>
                ))}
              </div>
            ))}
          </nav>
        )}
        <header className="rop-topbar">
          {signedIn && (
            <p className="rop-topbar__user">
              <strong>{staff.fullName}</strong> <span className="rop-topbar__role">{tr(`auth.role.${staff.role}`)}</span>
            </p>
          )}
          <Button onClick={toggle} aria-label={tr('auth.languageLabel')}>
            {tr('auth.language')}
          </Button>
          {signedIn && isDesktop() && <KioskControls />}
          {signedIn && <Button onClick={() => void signOut()}>{tr('auth.signOut')}</Button>}
        </header>
      </div>
      <main id="main" className="rop-main" tabIndex={-1}>
        <Outlet />
      </main>
      {signedIn && <IdleLock />}
    </div>
  );
}
