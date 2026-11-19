import { formatIQD } from '@rop/i18n';
import { useLocale } from '../lib/i18n';

/** An integer IQD amount, formatted for the current locale and isolated for bidi. */
export function Money({ amount }: { amount: number }) {
  const { locale } = useLocale();
  return <bdi className="rop-money">{formatIQD(amount, locale)}</bdi>;
}
