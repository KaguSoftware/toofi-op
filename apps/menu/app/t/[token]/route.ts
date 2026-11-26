import { NextResponse, type NextRequest } from 'next/server';
import { guestRpc } from '@/lib/server/guestRpc';
import { isDev } from '@/lib/server/respond';
import { sessionIdOf } from '@/lib/sessionLogic';
import { NO_STORE, TABLE_COOKIE, isTableToken, tableCookieOptions } from '@/lib/securityLogic';

/**
 * GET /t/<token>: the address printed in the QR code. Exchanges the token for a table session
 * in the HttpOnly `rop-table` cookie and sends the guest to `/`, so the token leaves the address
 * bar at once. The token is never rendered, logged or put in the redirect.
 */
function home(req: NextRequest, notice?: 'scan-again'): NextResponse {
  const url = req.nextUrl.clone();
  url.pathname = '/';
  url.search = notice ? `?notice=${notice}` : '';
  const res = NextResponse.redirect(url, 307);
  res.headers.set('Cache-Control', NO_STORE);
  res.headers.set('Referrer-Policy', 'no-referrer');
  return res;
}

export async function GET(req: NextRequest, ctx: { params: Promise<{ token: string }> }): Promise<NextResponse> {
  const { token } = await ctx.params;
  if (!isTableToken(token)) return home(req, 'scan-again');

  const answer = await guestRpc('open_table_session', { p_token: token });
  const sessionId = answer.ok ? sessionIdOf(answer.data) : null;
  // TABLE_LINK_INVALID, too many opens, or no answer: the guest scans again. No cookie is set.
  if (!sessionId) return home(req, 'scan-again');

  const res = home(req);
  res.cookies.set(TABLE_COOKIE, sessionId, tableCookieOptions(isDev));
  return res;
}
