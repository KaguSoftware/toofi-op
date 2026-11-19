import { useLocale } from '../lib/i18n';
import { Button } from './Button';
import { Modal } from './Modal';

export interface ConfirmDialogProps {
  open: boolean;
  title: string;
  message?: string;
  confirmLabel?: string;
  /** Styles the confirm button as destructive. */
  danger?: boolean;
  busy?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}

export function ConfirmDialog({ open, title, message, confirmLabel, danger, busy, onConfirm, onCancel }: ConfirmDialogProps) {
  const { tr } = useLocale();
  return (
    <Modal
      open={open}
      title={title}
      onClose={onCancel}
      footer={
        <>
          <Button onClick={onCancel}>{tr('common.cancel')}</Button>
          <Button variant={danger ? 'danger' : 'primary'} busy={busy} onClick={onConfirm}>
            {confirmLabel ?? tr('common.confirm')}
          </Button>
        </>
      }
    >
      {message && <p>{message}</p>}
    </Modal>
  );
}
