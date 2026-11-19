import type { ReactNode } from 'react';
import { useLocale } from '../lib/i18n';
import { errorMessage } from '../lib/errors';
import { Button } from './Button';

/** Loading: a polite status line. */
export function Loading({ label }: { label?: string }) {
  const { tr } = useLocale();
  return (
    <p role="status" className="rop-state">
      {label ?? tr('common.loading')}
    </p>
  );
}

/** Nothing to show yet; say what to do next through `action`. */
export function EmptyState({ message, action }: { message?: string; action?: ReactNode }) {
  const { tr } = useLocale();
  return (
    <div className="rop-state rop-state--empty">
      <p>{message ?? tr('common.empty')}</p>
      {action}
    </div>
  );
}

/** A failed read: the translated reason and a retry button. */
export function ErrorState({ error, onRetry }: { error: unknown; onRetry?: () => void }) {
  const { tr, locale } = useLocale();
  return (
    <div role="alert" className="rop-state rop-state--error">
      <h2>{tr('common.errorTitle')}</h2>
      <p>{errorMessage(error, locale)}</p>
      {onRetry && <Button onClick={onRetry}>{tr('common.retry')}</Button>}
    </div>
  );
}
