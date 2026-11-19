import { useEffect, useState } from 'react';
import { Button, PinReasonModal } from '../components';
import { getBridge } from '../lib/bridge';
import { useLocale } from '../lib/i18n';

type Pending = 'exit' | 'quit' | null;

/** Desktop only: leave full screen or quit, each behind a manager PIN. */
export function KioskControls() {
  const { tr } = useLocale();
  const [pending, setPending] = useState<Pending>(null);

  // macOS red traffic light: main held the close and asks us to show the quit dialog.
  useEffect(() => getBridge().onCloseRequested(() => setPending('quit')), []);

  async function granted() {
    const which = pending;
    setPending(null);
    if (which === 'exit') await getBridge().exitFullscreen();
    if (which === 'quit') await getBridge().quitApp();
  }

  return (
    <>
      <Button onClick={() => setPending('exit')}>{tr('auth.kioskExit')}</Button>
      <Button onClick={() => setPending('quit')}>{tr('auth.quit')}</Button>
      <PinReasonModal
        open={pending !== null}
        action={pending === 'quit' ? 'quit_app' : 'kiosk_exit'}
        title={pending === 'quit' ? tr('auth.quitTitle') : tr('auth.kioskExitTitle')}
        onGranted={() => void granted()}
        onClose={() => setPending(null)}
      />
    </>
  );
}
