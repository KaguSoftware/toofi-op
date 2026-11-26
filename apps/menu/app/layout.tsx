import '@rop/tokens/fonts.css';
import '@rop/tokens/tokens.css';
import '@rop/tokens/guest.css';
import './globals.css';
import type { Metadata, Viewport } from 'next';
import type { ReactNode } from 'react';
import { dir, t } from '@rop/i18n';
import brand from '../../../brand.config.json';
import { requestLocale } from '@/lib/server/locale';

export async function generateMetadata(): Promise<Metadata> {
  const locale = await requestLocale();
  return { title: brand.productName, description: t(locale, 'guest.meta.description'), robots: { index: false, follow: false } };
}

export const viewport: Viewport = { width: 'device-width', initialScale: 1, viewportFit: 'cover' };

export default async function RootLayout({ children }: { children: ReactNode }) {
  const locale = await requestLocale();
  return (
    <html lang={locale} dir={dir(locale)}>
      <body>{children}</body>
    </html>
  );
}
