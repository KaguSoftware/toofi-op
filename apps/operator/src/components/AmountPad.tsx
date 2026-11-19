import { useLocale } from '../lib/i18n';
import { Button } from './Button';
import { Money } from './Money';
import { PAD_KEYS, pressKey } from './padLogic';

export interface AmountPadProps {
  /** Whole IQD. */
  value: number;
  onChange: (value: number) => void;
  max?: number;
  label?: string;
}

/** A numeric pad for IQD: big keys for a tablet, plus 00 and 000 for round amounts. */
export function AmountPad({ value, onChange, max, label }: AmountPadProps) {
  const { tr } = useLocale();
  return (
    <div role="group" aria-label={label ?? tr('common.amountPad')} className="rop-pad">
      <output className="rop-pad__value" aria-live="polite">
        <Money amount={value} />
      </output>
      <div className="rop-pad__keys">
        {PAD_KEYS.map((k) => (
          <Button key={k} onClick={() => onChange(pressKey(value, k, max))}>
            {k}
          </Button>
        ))}
        <Button onClick={() => onChange(pressKey(value, 'back'))} aria-label={tr('common.backspace')}>
          ⌫
        </Button>
        <Button onClick={() => onChange(0)}>{tr('common.clear')}</Button>
      </div>
    </div>
  );
}
