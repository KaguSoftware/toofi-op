/**
 * The guest site's security envelope: fixed headers, the per-request CSP, the cookies and
 * the request guards. Pure: next.config.ts, proxy.ts and the route handlers all read it.
 *
 * The guest site has no login and is reached by scanning a sticker, so it is the most
 * exposed surface we run. The browser never talks to Supabase; only this site's server does.
 */

/** Fixed headers on every response (next.config.ts `headers()`), static files included. */
export const STATIC_SECURITY_HEADERS: ReadonlyArray<{ key: string; value: string }> = [
  // Two years. Stops a hostile hotspot serving a fake menu over http and harvesting table links.
  { key: 'Strict-Transport-Security', value: 'max-age=63072000; includeSubDomains' },
  { key: 'X-Content-Type-Options', value: 'nosniff' },
  // Legacy clickjacking guard; the CSP's frame-ancestors 'none' is the modern one.
  { key: 'X-Frame-Options', value: 'DENY' },
  { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
  {
    key: 'Permissions-Policy',
    value: [
      'accelerometer=()',
      'autoplay=()',
      'camera=()',
      'display-capture=()',
      'encrypted-media=()',
      'fullscreen=()',
      'geolocation=()',
      'gyroscope=()',
      'magnetometer=()',
      'microphone=()',
      'payment=()',
      'usb=()',
      'interest-cohort=()',
    ].join(', '),
  },
  { key: 'Cross-Origin-Opener-Policy', value: 'same-origin' },
];

/** Every guest response that touches a table session: never stored, never referred. */
export const NO_STORE = 'no-store, no-cache, must-revalidate, private';

/** Where dish photos live: the public `menu-photos` bucket of the one project we use. */
export const PHOTO_BUCKET_PATH = '/storage/v1/object/public/menu-photos/';

function originOf(url: string | undefined): string | null {
  if (!url) return null;
  try {
    return new URL(url).origin;
  } catch {
    return null;
  }
}

/**
 * The Content-Security-Policy for one request. Scripts run only with this request's nonce
 * (Next stamps it on its own inline bootstrap scripts), never 'unsafe-inline'. Images come
 * from this site and the photo bucket only. The browser connects to this site only.
 * Styles allow 'unsafe-inline' because React writes style attributes; that is not a
 * script-execution path. Dev adds 'unsafe-eval' and ws: for React Refresh and HMR.
 */
export function buildCsp(nonce: string, opts: { isDev: boolean; supabaseUrl?: string | undefined }): string {
  const origin = originOf(opts.supabaseUrl);
  const directives: Array<[string, Array<string | null>]> = [
    ['default-src', ["'self'"]],
    ['script-src', [`'nonce-${nonce}'`, "'strict-dynamic'", "'self'", opts.isDev ? "'unsafe-eval'" : null]],
    ['style-src', ["'self'", "'unsafe-inline'"]],
    ['font-src', ["'self'"]],
    // data: is the tokens' inline SVG ornaments (CSS backgrounds count as images).
    ['img-src', ["'self'", 'data:', origin ? `${origin}${PHOTO_BUCKET_PATH}` : null]],
    ['connect-src', ["'self'", opts.isDev ? 'ws:' : null]],
    ['frame-ancestors', ["'none'"]],
    ['form-action', ["'self'"]],
    ['base-uri', ["'none'"]],
    ['object-src', ["'none'"]],
    ['manifest-src', ["'self'"]],
  ];
  if (!opts.isDev) directives.push(['upgrade-insecure-requests', []]);
  return directives
    .map(([name, values]) => [name, ...values.filter((v): v is string => v !== null)].join(' '))
    .join('; ');
}

/** The table session cookie: the id `open_table_session` returns, HttpOnly so no script can read it. */
export const TABLE_COOKIE = 'rop-table';
/** Two hours covers a visit; a guest still at the table after that scans again. */
export const TABLE_COOKIE_MAX_AGE_S = 2 * 60 * 60;

/** SameSite=Lax, not Strict: a guest arriving from the camera app is a cross-site navigation. */
export function tableCookieOptions(isDev: boolean) {
  return { httpOnly: true, secure: !isDev, sameSite: 'lax' as const, path: '/', maxAge: TABLE_COOKIE_MAX_AGE_S };
}

export const LOCALE_COOKIE = 'rop-locale';
export const LOCALE_COOKIE_MAX_AGE_S = 365 * 24 * 60 * 60;

export function localeCookieOptions(isDev: boolean) {
  return { httpOnly: true, secure: !isDev, sameSite: 'lax' as const, path: '/', maxAge: LOCALE_COOKIE_MAX_AGE_S };
}

/**
 * Sent by our own script on every /api call. A cross-site form cannot add a custom header,
 * and a cross-site fetch that adds one needs a CORS preflight we never answer.
 */
export const GUEST_HEADER = 'x-rop-guest';
export const GUEST_HEADER_VALUE = '1';

export function hasGuestHeader(headers: Headers): boolean {
  return headers.get(GUEST_HEADER) === GUEST_HEADER_VALUE;
}

/** A table link token: 16 random bytes in base64url, exactly 22 characters. */
const TOKEN_RE = /^[A-Za-z0-9_-]{22}$/;

export function isTableToken(value: string): boolean {
  return TOKEN_RE.test(value);
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function isUuid(value: unknown): value is string {
  return typeof value === 'string' && UUID_RE.test(value);
}
