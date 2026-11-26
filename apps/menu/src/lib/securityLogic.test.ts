import { describe, expect, it } from 'vitest';
import {
  STATIC_SECURITY_HEADERS,
  buildCsp,
  hasGuestHeader,
  isTableToken,
  isUuid,
  tableCookieOptions,
} from './securityLogic';

const header = (key: string) => STATIC_SECURITY_HEADERS.find((h) => h.key === key)?.value;

describe('static headers', () => {
  it('sets HSTS, nosniff, DENY and a locked-down Permissions-Policy', () => {
    expect(header('Strict-Transport-Security')).toMatch(/max-age=\d{8}/);
    expect(header('X-Content-Type-Options')).toBe('nosniff');
    expect(header('X-Frame-Options')).toBe('DENY');
    for (const feature of ['camera', 'microphone', 'geolocation', 'payment']) {
      expect(header('Permissions-Policy')).toContain(`${feature}=()`);
    }
  });
});

describe('buildCsp', () => {
  const prod = buildCsp('abc123', { isDev: false, supabaseUrl: 'https://proj.supabase.co' });
  const directive = (csp: string, name: string) => csp.split('; ').find((d) => d.startsWith(`${name} `) || d === name);

  it('allows scripts only by nonce, never unsafe-inline or eval in production', () => {
    const scripts = directive(prod, 'script-src') ?? '';
    expect(scripts).toContain("'nonce-abc123'");
    expect(scripts).not.toContain('unsafe-inline');
    expect(scripts).not.toContain('unsafe-eval');
  });

  it('allows images from the photo bucket only, and connects to this site only', () => {
    expect(directive(prod, 'img-src')).toBe("img-src 'self' data: https://proj.supabase.co/storage/v1/object/public/menu-photos/");
    expect(directive(prod, 'connect-src')).toBe("connect-src 'self'");
    expect(prod).not.toContain('*');
  });

  it('refuses framing, plugins and third-party fonts', () => {
    expect(directive(prod, 'frame-ancestors')).toBe("frame-ancestors 'none'");
    expect(directive(prod, 'object-src')).toBe("object-src 'none'");
    expect(directive(prod, 'font-src')).toBe("font-src 'self'");
    expect(directive(prod, 'upgrade-insecure-requests')).toBeDefined();
  });

  it('adds eval and the HMR socket in dev only', () => {
    const dev = buildCsp('n', { isDev: true, supabaseUrl: 'http://127.0.0.1:55421' });
    expect(directive(dev, 'script-src')).toContain("'unsafe-eval'");
    expect(directive(dev, 'connect-src')).toBe("connect-src 'self' ws:");
    expect(directive(dev, 'img-src')).toContain('http://127.0.0.1:55421/storage/v1/object/public/menu-photos/');
    expect(directive(dev, 'upgrade-insecure-requests')).toBeUndefined();
  });

  it('drops the photo source when the Supabase URL is missing or malformed', () => {
    expect(directive(buildCsp('n', { isDev: false }), 'img-src')).toBe("img-src 'self' data:");
    expect(directive(buildCsp('n', { isDev: false, supabaseUrl: 'not a url' }), 'img-src')).toBe("img-src 'self' data:");
  });
});

describe('table cookie', () => {
  it('is HttpOnly, Lax, site-wide, two hours, and Secure outside dev', () => {
    expect(tableCookieOptions(false)).toEqual({ httpOnly: true, secure: true, sameSite: 'lax', path: '/', maxAge: 7200 });
    expect(tableCookieOptions(true).secure).toBe(false);
  });
});

describe('guards', () => {
  it('accepts exactly 22 base64url characters as a token', () => {
    expect(isTableToken('AbCdEfGhIjKlMnOpQrSt_-')).toBe(true);
    expect(isTableToken('AbCdEfGhIjKlMnOpQrSt_')).toBe(false); // 21
    expect(isTableToken('AbCdEfGhIjKlMnOpQrSt_-x')).toBe(false); // 23
    expect(isTableToken('AbCdEfGhIjKlMnOpQrSt+/')).toBe(false); // base64, not base64url
    expect(isTableToken('AbCdEfGhIjKlMnOpQrSt%2')).toBe(false);
    expect(isTableToken('')).toBe(false);
  });

  it('wants the guest header with the exact value', () => {
    expect(hasGuestHeader(new Headers({ 'x-rop-guest': '1' }))).toBe(true);
    expect(hasGuestHeader(new Headers({ 'x-rop-guest': 'true' }))).toBe(false);
    expect(hasGuestHeader(new Headers())).toBe(false);
  });

  it('recognises a uuid', () => {
    expect(isUuid('6f1c2a8e-3b4d-4e5f-8a9b-0c1d2e3f4a5b')).toBe(true);
    expect(isUuid('6f1c2a8e')).toBe(false);
    expect(isUuid(42)).toBe(false);
  });
});
