import { useMemo, useState } from 'react';
import type { MessageKey } from '@rop/i18n';
import { Button, Field } from '../../components';
import { useLocale } from '../../lib/i18n';
import { PRESETS, presetRange, validateRange, type DateRange, type Preset } from './manageLogic';

/** State for a business-date range with presets. `range` is only valid when `error` is null. */
export function useRangeState(initial: Preset = 'last7') {
  const [preset, setPreset] = useState<Preset>(initial);
  const [custom, setCustom] = useState<DateRange>(() => presetRange('today', new Date()));
  const range = useMemo(() => (preset === 'custom' ? custom : presetRange(preset, new Date())), [preset, custom]);
  return { preset, setPreset, custom, setCustom, range, error: validateRange(range) };
}
export type RangeState = ReturnType<typeof useRangeState>;

export function RangePicker({ state }: { state: RangeState }) {
  const { tr } = useLocale();
  const { preset, setPreset, custom, setCustom, range, error } = state;
  return (
    <>
      <div className="rop-segmented manage__range" role="group" aria-label={tr('manage.panel.range')}>
        {PRESETS.map((p) => (
          <Button
            key={p}
            aria-pressed={preset === p}
            onClick={() => {
              if (p === 'custom') setCustom(range);
              setPreset(p);
            }}
          >
            {tr(`manage.panel.preset_${p}` as MessageKey)}
          </Button>
        ))}
      </div>
      {preset === 'custom' && (
        <div className="manage__custom">
          <Field label={tr('manage.panel.from')}>
            {(p) => <input {...p} type="date" value={custom.from} onChange={(e) => setCustom({ ...custom, from: e.target.value })} />}
          </Field>
          <Field label={tr('manage.panel.to')} error={error ? tr(`manage.panel.range_${error}` as MessageKey) : null}>
            {(p) => <input {...p} type="date" value={custom.to} onChange={(e) => setCustom({ ...custom, to: e.target.value })} />}
          </Field>
        </div>
      )}
      <p className="manage__period">
        {tr('manage.panel.period')} <bdi>{range.from}</bdi> – <bdi>{range.to}</bdi>
      </p>
    </>
  );
}
