// Tiny form pieces shared by the admin screens (menu, floor, staff, stock).
import type { ReactNode } from 'react';
import type { MessageKey } from '@rop/i18n';
import { Button, Field, Modal } from '../../components';
import { useLocale } from '../../lib/i18n';

export function EditDialog({
  open,
  title,
  onClose,
  onSave,
  busy,
  saveLabel,
  children,
}: {
  open: boolean;
  title: string;
  onClose: () => void;
  onSave: () => void;
  busy?: boolean;
  saveLabel?: string;
  children: ReactNode;
}) {
  const { tr } = useLocale();
  return (
    <Modal
      open={open}
      title={title}
      onClose={onClose}
      footer={
        <>
          <Button onClick={onClose}>{tr('common.cancel')}</Button>
          <Button variant="primary" busy={busy} onClick={onSave}>
            {saveLabel ?? tr('common.save')}
          </Button>
        </>
      }
    >
      <form
        className="manage__form"
        onSubmit={(e) => {
          e.preventDefault();
          onSave();
        }}
      >
        {children}
      </form>
    </Modal>
  );
}

export function TextField({
  label,
  value,
  onChange,
  error,
  hint,
  type = 'text',
  dir,
  autoComplete,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  error?: MessageKey | null;
  hint?: string;
  type?: 'text' | 'email' | 'password' | 'tel';
  dir?: 'ltr' | 'rtl';
  autoComplete?: string;
}) {
  const { tr } = useLocale();
  return (
    <Field label={label} hint={hint} error={error ? tr(error) : null}>
      {(p) => <input {...p} type={type} dir={dir} autoComplete={autoComplete} value={value} onChange={(e) => onChange(e.target.value)} />}
    </Field>
  );
}

/** A number box that keeps the typed text; the caller parses it. */
export function NumberField({
  label,
  value,
  onChange,
  error,
  hint,
  step,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  error?: MessageKey | null;
  hint?: string;
  step?: string;
}) {
  const { tr } = useLocale();
  return (
    <Field label={label} hint={hint} error={error ? tr(error) : null}>
      {(p) => <input {...p} type="number" inputMode="decimal" step={step} value={value} onChange={(e) => onChange(e.target.value)} />}
    </Field>
  );
}

export function SelectField({
  label,
  value,
  onChange,
  options,
  error,
  placeholder,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  options: readonly { value: string; label: string }[];
  error?: MessageKey | null;
  placeholder?: string;
}) {
  const { tr } = useLocale();
  return (
    <Field label={label} error={error ? tr(error) : null}>
      {(p) => (
        <select {...p} value={value} onChange={(e) => onChange(e.target.value)}>
          {placeholder !== undefined && <option value="">{placeholder}</option>}
          {options.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </select>
      )}
    </Field>
  );
}

/** Up / down buttons for ordered lists. */
export function ReorderButtons({
  index,
  count,
  onMove,
  disabled,
}: {
  index: number;
  count: number;
  onMove: (delta: -1 | 1) => void;
  disabled?: boolean;
}) {
  const { tr } = useLocale();
  return (
    <span className="manage__row">
      <Button aria-label={tr('manage.moveUp')} disabled={disabled || index === 0} onClick={() => onMove(-1)}>
        ↑
      </Button>
      <Button aria-label={tr('manage.moveDown')} disabled={disabled || index === count - 1} onClick={() => onMove(1)}>
        ↓
      </Button>
    </span>
  );
}

/** Deactivate rather than delete: one button that flips the flag. */
export function ActiveToggle({ active, onToggle, busy }: { active: boolean; onToggle: () => void; busy?: boolean }) {
  const { tr } = useLocale();
  return (
    <Button busy={busy} onClick={onToggle}>
      {active ? tr('manage.deactivate') : tr('manage.activate')}
    </Button>
  );
}
