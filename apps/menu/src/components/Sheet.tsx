'use client';

import { useEffect, useId, useRef, type KeyboardEvent, type ReactNode } from 'react';
import { Icon } from './Icon';

const FOCUSABLE = 'button:not([disabled]), a[href], input:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

/**
 * The bottom sheet shell every sheet shares: scrim, grip, title, a 44 px close button.
 * Focus moves into the sheet when it opens, stays inside while it is open, and goes back to
 * whatever opened it. Escape and the scrim close it. The page behind is `inert` (the parent).
 * `locked`: nothing closes it (an order is on its way and its outcome is not known yet).
 * `aside` sits beside the title (the table, on the order sheet).
 */
export function Sheet({
  title,
  closeLabel,
  onClose: requestClose,
  locked = false,
  aside,
  children,
}: {
  title: string;
  closeLabel: string;
  onClose: () => void;
  locked?: boolean;
  aside?: ReactNode;
  children: ReactNode;
}) {
  const onClose = locked ? () => undefined : requestClose;
  const titleId = useId();
  const panel = useRef<HTMLElement>(null);

  // Remembered once: React's dev double-run of this effect must not mistake the sheet itself for the opener.
  const opener = useRef<HTMLElement | null>(null);
  useEffect(() => {
    opener.current ??= document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const node = panel.current;
    node?.focus();
    // Give focus back once the sheet is really gone and the page behind is no longer inert
    // (focusing into an inert tree does nothing).
    return () => void setTimeout(() => !node?.isConnected && opener.current?.focus(), 0);
  }, []);

  function onKeyDown(e: KeyboardEvent<HTMLElement>) {
    if (e.key === 'Escape') {
      e.stopPropagation();
      onClose();
      return;
    }
    if (e.key !== 'Tab' || !panel.current) return;
    const items = Array.from(panel.current.querySelectorAll<HTMLElement>(FOCUSABLE));
    const first = items[0];
    const last = items[items.length - 1];
    if (!first || !last) return;
    const active = document.activeElement;
    if (e.shiftKey && (active === first || active === panel.current)) {
      e.preventDefault();
      last.focus();
    } else if (!e.shiftKey && active === last) {
      e.preventDefault();
      first.focus();
    }
  }

  return (
    <>
      <button type="button" className="scrim" aria-label={closeLabel} tabIndex={-1} onClick={onClose} />
      <section ref={panel} className="sheet" role="dialog" aria-modal="true" aria-labelledby={titleId} tabIndex={-1} onKeyDown={onKeyDown}>
        <span className="sheet__grip" aria-hidden="true" />
        <div className="sheet__head">
          <h2 id={titleId} className="sheet__title">
            {title}
          </h2>
          {aside}
          <button type="button" className="sheet__close" aria-label={closeLabel} disabled={locked} onClick={onClose}>
            <Icon name="close" size={22} />
          </button>
        </div>
        {children}
      </section>
    </>
  );
}
