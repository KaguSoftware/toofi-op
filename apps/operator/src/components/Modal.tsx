import { useEffect, useId, useRef, type ReactNode } from 'react';
import { useLocale } from '../lib/i18n';
import { Button } from './Button';
import { Icon } from './Icon';

export interface ModalProps {
  open: boolean;
  title: string;
  onClose: () => void;
  /** false: Esc and the close button do nothing (the idle lock). Default true. */
  dismissible?: boolean;
  children: ReactNode;
  /** Buttons row; rendered after the body. */
  footer?: ReactNode;
}

/** Native <dialog> opened with showModal(): the browser traps focus, Esc closes it. */
export function Modal({ open, title, onClose, dismissible = true, children, footer }: ModalProps) {
  const ref = useRef<HTMLDialogElement>(null);
  const titleId = useId();
  const { tr } = useLocale();

  useEffect(() => {
    const d = ref.current;
    if (!d) return;
    if (open && !d.open) {
      if (typeof d.showModal === 'function') d.showModal();
      else d.setAttribute('open', ''); // jsdom
    } else if (!open && d.open) {
      if (typeof d.close === 'function') d.close();
      else d.removeAttribute('open');
    }
  }, [open]);

  return (
    <dialog
      ref={ref}
      className="rop-modal"
      aria-labelledby={titleId}
      onCancel={(e) => {
        e.preventDefault(); // we own the open state
        if (dismissible) onClose();
      }}
    >
      {open && (
        <div className="rop-modal__body">
          <header className="rop-modal__header">
            <h2 id={titleId}>{title}</h2>
            {dismissible && (
              <Button variant="secondary" className="rop-btn--icon" onClick={onClose} aria-label={tr('common.close')}>
                <Icon name="close" size={20} />
              </Button>
            )}
          </header>
          <div>{children}</div>
          {footer && <footer className="rop-modal__footer">{footer}</footer>}
        </div>
      )}
    </dialog>
  );
}
