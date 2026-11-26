import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import brand from '../../../brand.config.json';
import { GuestScreen } from '@/components/GuestScreen';
import { parseGuestStatus, type GuestStatus, type SessionState } from '@/lib/callLogic';
import { guestCopy } from '@/lib/copyLogic';
import { toMenuView } from '@/lib/menuViewLogic';
import { TABLE_COOKIE, isUuid } from '@/lib/securityLogic';
import { guestRpc } from '@/lib/server/guestRpc';
import { requestLocale } from '@/lib/server/locale';
import { getMenu } from '@/lib/server/menu';

/**
 * GET /: the menu, server-rendered from guest_menu(). With a table cookie it also reads
 * guest_status for the table label, the switches and any open call; with none it is a
 * browse-only menu. Everything the screen says is resolved here, for one language.
 */
export default async function MenuPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const [locale, params, jar] = await Promise.all([requestLocale(), searchParams, cookies()]);
  const scanAgain = params.notice === 'scan-again';

  let status: GuestStatus | null = null;
  let session: SessionState = scanAgain ? 'expired' : 'none';
  const sessionId = jar.get(TABLE_COOKIE)?.value;
  if (isUuid(sessionId)) {
    const answer = await guestRpc('guest_status', { p_session_id: sessionId });
    if (answer.ok) {
      status = parseGuestStatus(answer.data);
      session = 'live';
    }
    // A page cannot clear a cookie: /scan-again does, once the database confirms the session ended.
    else if (answer.code === 'SESSION_EXPIRED' && !scanAgain) redirect('/scan-again');
    // Any other failure (the database is slow): keep the table; the buttons still work through /api.
    else session = 'live';
  }

  const result = await getMenu();

  return (
    <GuestScreen
      copy={guestCopy(locale)}
      locale={locale}
      venueName={result.menu?.venueName || brand.productName}
      menuState={result.status}
      menu={result.menu ? toMenuView(result.menu, locale) : null}
      initialStatus={status}
      initialSession={session}
      serverNow={Date.now()}
    />
  );
}
