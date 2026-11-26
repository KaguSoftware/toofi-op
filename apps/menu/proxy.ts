import { NextResponse, type NextRequest } from 'next/server';
import { NO_STORE, buildCsp } from '@/lib/securityLogic';

const isDev = process.env.NODE_ENV !== 'production';

/**
 * The per-request CSP (Next 16 `proxy`, the old middleware). A fresh nonce on every request:
 * Next reads it back from the request's own CSP header and stamps it on its inline bootstrap
 * scripts, which is what lets the policy refuse 'unsafe-inline' for scripts. The fixed
 * headers come from next.config.ts.
 */
export function proxy(req: NextRequest): NextResponse {
  const nonce = Buffer.from(crypto.getRandomValues(new Uint8Array(16))).toString('base64');
  const csp = buildCsp(nonce, { isDev, supabaseUrl: process.env.SUPABASE_URL });

  const requestHeaders = new Headers(req.headers);
  requestHeaders.set('x-nonce', nonce);
  requestHeaders.set('content-security-policy', csp);

  const res = NextResponse.next({ request: { headers: requestHeaders } });
  res.headers.set('content-security-policy', csp);
  // The menu page may carry one guest's table: never keep a copy for the next person.
  if (req.nextUrl.pathname === '/') res.headers.set('cache-control', NO_STORE);
  return res;
}

export const config = {
  // Everything except Next's own files and real files (a dot in the last segment).
  matcher: ['/((?!_next/|(?:.*/)?[^/]*\\.[^/]*$).*)'],
};
