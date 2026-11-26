import { Button, Field } from '../../components';
import { useLocale } from '../../lib/i18n';
import './floor.css';

/** One-tap guest counts 1 to 8 above a number field. `value` is the field's text. */
export function CoversPicker({
  value,
  onChange,
  error,
}: {
  value: string;
  onChange: (value: string) => void;
  error?: string | null;
}) {
  const { tr } = useLocale();
  return (
    <>
      <div className="floor__covers" role="group" aria-label={tr('floor.coversLabel')}>
        {[1, 2, 3, 4, 5, 6, 7, 8].map((n) => (
          <Button key={n} aria-pressed={value === String(n)} onClick={() => onChange(String(n))}>
            {n}
          </Button>
        ))}
      </div>
      <Field label={tr('floor.coversLabel')} hint={tr('floor.coversHint')} error={error}>
        {(p) => (
          <input
            {...p}
            type="number"
            inputMode="numeric"
            min={1}
            max={99}
            value={value}
            onChange={(e) => onChange(e.target.value)}
          />
        )}
      </Field>
    </>
  );
}
