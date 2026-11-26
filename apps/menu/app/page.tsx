import Link from 'next/link';
import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { formatNumber, makeT } from '@rop/i18n';
import { getMenu } from '@/lib/server/menu';
import { guestRpc } from '@/lib/server/guestRpc';
import { requestLocale } from '@/lib/server/locale';
import { parseBinding, type TableBinding } from '@/lib/sessionLogic';
import { TABLE_COOKIE, isUuid } from '@/lib/securityLogic';

/**
 * GET /: the menu, server-rendered from guest_menu(). With a table cookie it also reads
 * guest_status for the table label and the switches; with none it is a browse-only menu.
 * Ticket 04 replaces the markup below with the designed screen.
 */
export default async function MenuPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const [locale, params, jar] = await Promise.all([requestLocale(), searchParams, cookies()]);
  const tr = makeT(locale);
  const scanAgain = params.notice === 'scan-again';

  let binding: TableBinding | null = null;
  const sessionId = jar.get(TABLE_COOKIE)?.value;
  if (isUuid(sessionId)) {
    const status = await guestRpc('guest_status', { p_session_id: sessionId });
    if (status.ok) binding = parseBinding(status.data);
    // A page cannot clear a cookie: /scan-again does, once the database confirms the session ended.
    else if (status.code === 'SESSION_EXPIRED' && !scanAgain) redirect('/scan-again');
  }

  const result = await getMenu();
  const ar = locale === 'ar';

  return (
    <main className="guest">
      <header className="guest__top">
        {binding && (
          <span className="guest__table" aria-label={tr('guest.table.label', { label: binding.tableLabel })}>
            {binding.tableLabel}
          </span>
        )}
        <h1>{result.menu?.venueName}</h1>
      </header>

      {scanAgain && <p className="guest__notice" role="status">{tr('guest.notice.scanAgain')}</p>}
      {binding && !binding.dayOpen && <p className="guest__notice" role="status">{tr('guest.notice.closed')}</p>}

      {result.status === 'error' && (
        <div className="guest__state" role="alert">
          <p>{tr('guest.menu.failed')}</p>
          <Link href="/" prefetch={false}>{tr('guest.menu.retry')}</Link>
        </div>
      )}
      {result.status === 'empty' && <p className="guest__state">{tr('guest.menu.empty')}</p>}
      {result.status === 'ok' &&
        result.menu.categories.map((category) => (
          <section key={category.id} className="guest__section" aria-labelledby={`cat-${category.id}`}>
            <h2 id={`cat-${category.id}`}>{ar ? category.nameAr : category.nameEn}</h2>
            <ul className="guest__items">
              {category.items.map((item) => (
                <li key={item.id} className="guest__item">
                  <span>{ar ? item.nameAr : item.nameEn}</span>
                  <span>{formatNumber(item.price, locale)}</span>
                </li>
              ))}
            </ul>
          </section>
        ))}
    </main>
  );
}
