import { useEffect, useState } from 'react';
import { Button, Icon, PinReasonModal } from '../components';
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
      <Button className="rop-topbar__btn" onClick={() => setPending('exit')}>
        <Icon name="fullscreenExit" size={20} />
        <span className="rop-topbar__label">{tr('auth.kioskExit')}</span>
      </Button>
      <Button className="rop-topbar__btn" onClick={() => setPending('quit')}>
        <Icon name="power" size={20} />
        <span className="rop-topbar__label">{tr('auth.quit')}</span>
      </Button>
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
