import { useState, type FormEvent } from 'react';
import { Button, Field, Modal } from '../../components';
import { useLocale } from '../../lib/i18n';

export interface ReasonDialogProps {
  title: string;
  confirmLabel: string;
  busy?: boolean;
  onConfirm: (reason: string) => void;
  onClose: () => void;
}

/** Asks for a reason and confirms. For callers who need no manager PIN (managers, owners). */
export function ReasonDialog({ title, confirmLabel, busy, onConfirm, onClose }: ReasonDialogProps) {
  const { tr } = useLocale();
  const [reason, setReason] = useState('');
  const [error, setError] = useState<string | null>(null);

  function submit(e: FormEvent) {
    e.preventDefault();
    if (busy) return;
    if (reason.trim() === '') {
      setError(tr('errors.codes.REASON_REQUIRED'));
      return;
    }
    onConfirm(reason.trim());
  }

  return (
    <Modal open title={title} onClose={onClose}>
      <form className="rop-form" onSubmit={submit}>
        <Field label={tr('common.reasonLabel')} hint={tr('common.reasonHint')} error={error}>
          {(p) => <input {...p} type="text" autoComplete="off" autoFocus value={reason} onChange={(e) => setReason(e.target.value)} />}
        </Field>
        <div className="rop-modal__footer">
          <Button onClick={onClose}>{tr('common.cancel')}</Button>
          <Button type="submit" variant="danger" busy={busy}>
            {confirmLabel}
          </Button>
        </div>
      </form>
    </Modal>
  );
}
