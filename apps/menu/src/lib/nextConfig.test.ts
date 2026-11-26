import { describe, expect, it } from 'vitest';
import nextConfig from '../../next.config';

describe('next.config headers', () => {
  it('sends no Referer from the QR address, after the site-wide set so it wins', async () => {
    const rules = (await nextConfig.headers?.()) ?? [];
    const site = rules.findIndex((r) => r.source === '/:path*');
    const qr = rules.findIndex((r) => r.source === '/t/:path*');
    expect(site).toBeGreaterThanOrEqual(0);
    expect(qr).toBeGreaterThan(site);
    expect(rules[qr]?.headers).toContainEqual({ key: 'Referrer-Policy', value: 'no-referrer' });
  });
});
