import { Link, Outlet } from '@tanstack/react-router';
import { Button, Loading } from '../components';
import { useAuth } from '../lib/auth';
import { isDesktop } from '../lib/bridge';
import { useLocale } from '../lib/i18n';
import { navFor } from '../lib/navLogic';
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
    <>
      <a href="#main" className="rop-skip rop-btn">
        {tr('nav.skipToContent')}
      </a>
      <header className="rop-topbar">
        {signedIn && (
          <p className="rop-topbar__user">
            <strong>{staff.fullName}</strong> · {tr(`auth.role.${staff.role}`)}
          </p>
        )}
        {!signedIn && <span className="rop-topbar__user" />}
        <Button onClick={toggle} aria-label={tr('auth.languageLabel')}>
          {tr('auth.language')}
        </Button>
        {signedIn && isDesktop() && <KioskControls />}
        {signedIn && <Button onClick={() => void signOut()}>{tr('auth.signOut')}</Button>}
      </header>
      {signedIn && (
        <nav className="rop-nav" aria-label={tr('nav.main')}>
          {navFor(staff.role).map((item) => (
            <Link key={item.to} to={item.to} activeOptions={{ exact: true }}>
              {tr(item.labelKey)}
            </Link>
          ))}
        </nav>
      )}
      <main id="main" className="rop-main" tabIndex={-1}>
        <Outlet />
      </main>
      {signedIn && <IdleLock />}
    </>
  );
}
