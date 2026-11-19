import { useState } from 'react';
import { Button, Field, Modal } from '../../components';
import { useLocale } from '../../lib/i18n';

export interface PickDialogProps {
  title: string;
  label: string;
  hint?: string;
  options: { value: string; label: string }[];
  emptyMessage: string;
  confirmLabel: string;
  busy?: boolean;
  error?: string | null;
  onConfirm: (value: string) => void;
  onClose: () => void;
}

/** Choose one target from a list, then confirm. Used by transfer and merge. */
export function PickDialog({ title, label, hint, options, emptyMessage, confirmLabel, busy, error, onConfirm, onClose }: PickDialogProps) {
  const { tr } = useLocale();
  const [value, setValue] = useState('');
  return (
    <Modal
      open
      title={title}
      onClose={onClose}
      footer={
        <>
          <Button onClick={onClose}>{tr('common.cancel')}</Button>
          <Button variant="primary" busy={busy} disabled={value === ''} onClick={() => onConfirm(value)}>
            {confirmLabel}
          </Button>
        </>
      }
    >
      {options.length === 0 ? (
        <p>{emptyMessage}</p>
      ) : (
        <Field label={label} hint={hint} error={error}>
          {(p) => (
            <select {...p} value={value} onChange={(e) => setValue(e.target.value)}>
              <option value="" />
              {options.map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </select>
          )}
        </Field>
      )}
    </Modal>
  );
}
