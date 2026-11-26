import type { NextConfig } from 'next';
import { STATIC_SECURITY_HEADERS } from './src/lib/securityLogic';

const nextConfig: NextConfig = {
  reactStrictMode: true,
  poweredByHeader: false,
  // The dev overlay's portal sits over the bottom bar; dev-only chrome.
  devIndicators: false,
  // `next dev` otherwise writes an AGENTS.md into this folder on every start.
  agentRules: false,
  // A phone on the venue Wi-Fi opens the dev server by LAN address; without this it renders but never hydrates.
  allowedDevOrigins: ['127.0.0.1', '192.168.*.*', '10.*.*.*'],
  // The workspace packages ship raw TypeScript with no build step.
  transpilePackages: ['@rop/core', '@rop/i18n', '@rop/db'],
  // The QR address carries the table token: keep it out of the request log.
  logging: { incomingRequests: { ignore: [/^\/t\//] } },
  async headers() {
    // Fixed headers on every response, static files and 404s included. The CSP needs a
    // per-request nonce, so proxy.ts sets it.
    return [{ source: '/:path*', headers: [...STATIC_SECURITY_HEADERS] }];
  },
};

export default nextConfig;
