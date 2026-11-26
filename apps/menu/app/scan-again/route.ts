import { NextResponse, type NextRequest } from 'next/server';
import { guestRpc } from '@/lib/server/guestRpc';
import { sessionOf } from '@/lib/server/respond';
import { NO_STORE, TABLE_COOKIE } from '@/lib/securityLogic';

/**
 * GET /scan-again: where the menu sends a guest whose session has ended (a page cannot clear a
 * cookie itself). The cookie is cleared only after the database confirms SESSION_EXPIRED, so a
 * link from another site cannot unbind a live table. Always lands on `/`.
 */
export async function GET(req: NextRequest): Promise<NextResponse> {
  const url = req.nextUrl.clone();
  url.pathname = '/';
  url.search = '?notice=scan-again';

  const sessionId = sessionOf(req);
  let expired = req.cookies.has(TABLE_COOKIE) && !sessionId;
  if (sessionId) {
    const answer = await guestRpc('guest_status', { p_session_id: sessionId });
    if (answer.ok) url.search = '';
    expired = !answer.ok && answer.code === 'SESSION_EXPIRED';
  }

  const res = NextResponse.redirect(url, 307);
  res.headers.set('Cache-Control', NO_STORE);
  if (expired) res.cookies.delete(TABLE_COOKIE);
  return res;
}
