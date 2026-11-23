import type { ReactNode } from 'react';
import { formatIQD, formatPercent, type Locale } from '@rop/i18n';
import { useLocale } from '../../lib/i18n';
import { bpsToPercent } from './reportsLogic';

/** A titled block of a report, with one line saying what the reader is looking at. */
export function ReportSection({ title, hint, children }: { title: string; hint?: string; children: ReactNode }) {
  return (
    <section className="manage__section">
      <header className="reports__head">
        <h2>{title}</h2>
        {hint && <p className="manage__note">{hint}</p>}
      </header>
      {children}
    </section>
  );
}

/** An amount that may be negative, kept left-to-right so the sign stays with the number. */
export function SignedMoney({ amount }: { amount: number }) {
  const { locale } = useLocale();
  return <bdi className="rop-money">{signedIQD(amount, locale)}</bdi>;
}

export const signedIQD = (amount: number, locale: Locale): string => `${amount < 0 ? '−' : ''}${formatIQD(Math.abs(amount), locale)}`;

/** Basis points as "17.8%", or a dash when unknown. */
export const percentOf = (bps: number | null, locale: Locale): string => (bps === null ? '–' : `${formatPercent(bpsToPercent(bps), locale)}%`);

/** A count with its value, as "3 · 12,000 IQD"; a dash when there were none. */
export function CountValue({ count, value }: { count: number; value: number }) {
  const { locale } = useLocale();
  if (count === 0) return <>–</>;
  return (
    <bdi>
      {count} · {formatIQD(value, locale)}
    </bdi>
  );
}
