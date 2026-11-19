import { useId, type ReactNode } from 'react';

export interface FieldControlProps {
  id: string;
  'aria-describedby': string | undefined;
  'aria-invalid': true | undefined;
}

export interface FieldProps {
  label: string;
  hint?: string;
  error?: string | null;
  /** Render the control with the props it must spread: <input {...p} />. */
  children: (p: FieldControlProps) => ReactNode;
}

/** A label, optional hint and error, wired to one control with aria attributes. */
export function Field({ label, hint, error, children }: FieldProps) {
  const id = useId();
  const hintId = `${id}-hint`;
  const errorId = `${id}-error`;
  const describedBy = [hint && hintId, error && errorId].filter(Boolean).join(' ') || undefined;
  return (
    <div className="rop-field">
      <label htmlFor={id}>{label}</label>
      {children({ id, 'aria-describedby': describedBy, 'aria-invalid': error ? true : undefined })}
      {hint && (
        <p id={hintId} className="rop-field__hint">
          {hint}
        </p>
      )}
      {error && (
        <p id={errorId} className="rop-field__error" role="alert">
          {error}
        </p>
      )}
    </div>
  );
}
