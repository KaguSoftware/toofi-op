import type { ButtonHTMLAttributes } from 'react';

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'primary' | 'secondary' | 'danger';
  /** Shows the button as working and ignores clicks. */
  busy?: boolean;
}

export function Button({
  variant = 'secondary',
  busy = false,
  type = 'button',
  className,
  onClick,
  ...rest
}: ButtonProps) {
  return (
    <button
      {...rest}
      type={type}
      className={`rop-btn rop-btn--${variant}${className ? ` ${className}` : ''}`}
      aria-busy={busy || undefined}
      onClick={busy ? undefined : onClick}
    />
  );
}
