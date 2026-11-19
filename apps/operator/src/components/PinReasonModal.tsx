import { useState, type FormEvent } from 'react';
import { appRpc } from '../lib/appRpc';
import { errorMessage } from '../lib/errors';
import { useLocale } from '../lib/i18n';
import { Button } from './Button';
import { Field } from './Field';
import { Modal } from './Modal';
import { parsePinResult, pinFormReady } from '../lib/pinLogic';

export interface PinReasonModalProps {
  open: boolean;
  /** The gated action name, e.g. 'void_line'. Must match what the gated function consumes. */
  action: string;
  title?: string;
  /** false: only the PIN is asked (kiosk exit still records a reason; default true). */
  reasonRequired?: boolean;
  /** The tab, payment or shift the grant is for; sent as p_entity_id when given. */
  entityId?: string;
  /** The amount or rate being authorised (bps, IQD); sent as p_value so the grant is bound to it. */
  value?: number;
  /**
   * Called once the PIN is accepted. The server grant is short-lived: the caller must
   * now run the gated function within 2 minutes, passing `reason`.
   */
  onGranted: (grant: { reason: string; authorizedBy: string | null }) => void;
  onClose: () => void;
}

export function PinReasonModal({
  open,
  action,
  title,
  reasonRequired = true,
  entityId,
  value,
  onGranted,
  onClose,
}: PinReasonModalProps) {
  const { tr, locale } = useLocale();
  const [pin, setPin] = useState('');
  const [reason, setReason] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const reset = () => {
    setPin('');
    setReason('');
    setError(null);
  };

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (busy) return;
    if (!pinFormReady(pin, reason, reasonRequired)) {
      setError(tr('common.pinReasonRequired'));
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const result = parsePinResult(await appRpc('verify_manager_pin', { p_pin: pin, p_action: action, ...(entityId ? { p_entity_id: entityId } : {}), ...(value !== undefined ? { p_value: value } : {}) }));
      if (result.ok) {
        const granted = { reason: reason.trim(), authorizedBy: result.authorizedBy };
        reset();
        onGranted(granted);
      } else {
        setPin('');
        setError(errorMessage({ code: result.code }, locale));
      }
    } catch (err) {
      setError(errorMessage(err, locale));
    } finally {
      setBusy(false);
    }
  }

  const close = () => {
    reset();
    onClose();
  };

  return (
    <Modal open={open} title={title ?? tr('common.managerPinTitle')} onClose={close}>
      <form onSubmit={submit} className="rop-form">
        <Field label={tr('common.pinLabel')}>
          {(p) => (
            <input
              {...p}
              type="password"
              inputMode="numeric"
              autoComplete="off"
              autoFocus
              value={pin}
              onChange={(e) => setPin(e.target.value)}
            />
          )}
        </Field>
        <Field label={tr('common.reasonLabel')} hint={tr('common.reasonHint')}>
          {(p) => <input {...p} type="text" autoComplete="off" value={reason} onChange={(e) => setReason(e.target.value)} />}
        </Field>
        {error && (
          <p role="alert" className="rop-field__error">
            {error}
          </p>
        )}
        <div className="rop-modal__footer">
          <Button onClick={close}>{tr('common.cancel')}</Button>
          <Button type="submit" variant="primary" busy={busy}>
            {tr('common.authorize')}
          </Button>
        </div>
      </form>
    </Modal>
  );
}
