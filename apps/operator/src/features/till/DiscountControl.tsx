import { useRef, useState, type FormEvent } from 'react';
import type { StaffRole } from '@rop/core';
import { Button, Field, Modal, useToast } from '../../components';
import { appRpc } from '../../lib/appRpc';
import { errorMessage } from '../../lib/errors';
import { useLocale } from '../../lib/i18n';
import { newIdem } from '../../lib/idem';
import { attemptKey, discountArgs, type Attempt, type DiscountMode } from './tillLogic';
import { useGatedAction } from './useGatedAction';

export function DiscountControl({
  tabId,
  role,
  onApplied,
}: {
  tabId: string;
  role: StaffRole | null;
  onApplied: () => void;
}) {
  const { tr, locale } = useLocale();
  const toast = useToast();
  const gate = useGatedAction(role, 'discount', 'discount', true, tabId);
  const [open, setOpen] = useState(false);
  const [mode, setMode] = useState<DiscountMode>('percent');
  const [value, setValue] = useState('');
  const [reason, setReason] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const attempt = useRef<Attempt | null>(null);

  const close = () => {
    setOpen(false);
    setValue('');
    setReason('');
    setError(null);
  };

  function submit(e: FormEvent) {
    e.preventDefault();
    const args = discountArgs(mode, value);
    if (!args) return setError(tr('till.discount.invalid'));
    if (!gate.needsPin && reason.trim() === '') return setError(tr('till.discount.reasonNeeded'));
    setError(null);
    gate.request(reason.trim(), (why) => {
      setBusy(true);
      attempt.current = attemptKey(attempt.current, `${tabId}|${args.p_kind}|${args.p_value}`, () => newIdem('apply_discount'));
      appRpc('apply_discount', { p_tab_id: tabId, ...args, p_reason: why, p_idempotency_key: attempt.current.key })
        .then(() => {
          attempt.current = null;
          toast(tr('till.discount.applied'), 'success');
          close();
          onApplied();
        })
        .catch((err: unknown) => {
          setOpen(true);
          setError(errorMessage(err, locale));
        })
        .finally(() => setBusy(false));
    }, args.p_value);
  }

  return (
    <>
      <Button onClick={() => setOpen(true)}>{tr('till.discount.open')}</Button>
      <Modal open={open} title={tr('till.discount.title')} onClose={close}>
        <form onSubmit={submit} className="rop-form">
          <fieldset>
            <legend>{tr('till.discount.kind')}</legend>
            {(['percent', 'amount'] as const).map((m) => (
              <label key={m}>
                <input type="radio" name="discount-kind" checked={mode === m} onChange={() => setMode(m)} />{' '}
                {tr(m === 'percent' ? 'till.discount.percent' : 'till.discount.amount')}
              </label>
            ))}
          </fieldset>
          <Field label={tr(mode === 'percent' ? 'till.discount.percentLabel' : 'till.discount.amountLabel')}>
            {(p) => (
              <input
                {...p}
                type="text"
                inputMode="decimal"
                autoComplete="off"
                autoFocus
                value={value}
                onChange={(e) => setValue(e.target.value)}
              />
            )}
          </Field>
          {!gate.needsPin && (
            <Field label={tr('common.reasonLabel')} hint={tr('common.reasonHint')}>
              {(p) => <input {...p} type="text" autoComplete="off" value={reason} onChange={(e) => setReason(e.target.value)} />}
            </Field>
          )}
          {error && (
            <p role="alert" className="rop-field__error">
              {error}
            </p>
          )}
          <div className="rop-modal__footer">
            <Button onClick={close}>{tr('common.cancel')}</Button>
            <Button type="submit" variant="primary" busy={busy}>
              {tr('till.discount.apply')}
            </Button>
          </div>
        </form>
      </Modal>
      {gate.element}
    </>
  );
}
