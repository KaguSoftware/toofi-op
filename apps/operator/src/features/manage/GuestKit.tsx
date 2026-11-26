import { Button } from '../../components';
import { useLocale } from '../../lib/i18n';

/** An On / Off pair in the kit's segmented control: both words are visible, one is pressed. */
export function OnOff({ label, on, busy, onChange }: { label: string; on: boolean; busy?: boolean; onChange: (on: boolean) => void }) {
  const { tr } = useLocale();
  return (
    <div className="rop-segmented" role="group" aria-label={label}>
      <Button aria-pressed={on} disabled={busy} onClick={() => !on && onChange(true)}>
        {tr('guestSetup.on')}
      </Button>
      <Button aria-pressed={!on} disabled={busy} onClick={() => on && onChange(false)}>
        {tr('guestSetup.off')}
      </Button>
    </div>
  );
}
