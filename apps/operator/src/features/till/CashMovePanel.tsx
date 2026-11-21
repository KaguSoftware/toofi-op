import { useRef, useState, type FormEvent } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import type { StaffRole } from '@rop/core';
import { formatIQD, formatTime } from '@rop/i18n';
import { AmountPad, Button, ErrorState, Field, Loading, Modal, Money, useToast } from '../../components';
import { appRpc } from '../../lib/appRpc';
import { errorMessage } from '../../lib/errors';
import { useLocale } from '../../lib/i18n';
import { newIdem } from '../../lib/idem';
import { QK } from '../../lib/queryKeys';
import { fetchCashMovements } from './tillData';
import { CASH_KINDS, attemptKey, cashMoveBlock, cashMoveSig, type Attempt, type CashKind } from './tillLogic';
import { useGatedAction } from './useGatedAction';

/**
 * Cash that enters or leaves the drawer without a sale: paid-out, pay-in, drop to the safe.
 * A cashier needs a manager PIN, bound on the server to this shift and the amount.
 * The list shows what was recorded on this shift; it never shows the expected cash.
 */
export function CashMovePanel({ shiftId, role }: { shiftId: string; role: StaffRole | null }) {
  const { tr, locale } = useLocale();
  const toast = useToast();
  const qc = useQueryClient();
  const gate = useGatedAction(role, 'cashMovement', 'cash_movement', true, shiftId);
  const list = useQuery({ queryKey: QK.tillCashMovements(shiftId), queryFn: () => fetchCashMovements(shiftId) });
  const [kind, setKind] = useState<CashKind | null>(null);
  const [amount, setAmount] = useState(0);
  const [reason, setReason] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const attempt = useRef<Attempt | null>(null);
  const generation = useRef(0);

  const dismiss = () => {
    setKind(null);
    setAmount(0);
    setReason('');
    setError(null);
  };

  function submit(e: FormEvent) {
    e.preventDefault();
    if (busy || kind === null) return;
    const block = cashMoveBlock(amount, reason, gate.needsPin);
    if (block) return setError(tr(block === 'amount' ? 'till.cash.invalid' : 'till.cash.reasonNeeded'));
    setError(null);
    gate.request(
      reason.trim(),
      (why) => {
        setBusy(true);
        // The key is kept on failure, so a retry of this same movement cannot record it twice.
        attempt.current = attemptKey(attempt.current, cashMoveSig(kind, amount, generation.current), () => newIdem('cash_movement'));
        appRpc('record_cash_movement', { p_kind: kind, p_amount: amount, p_reason: why, p_idempotency_key: attempt.current.key })
          .then(() => {
            attempt.current = null;
            generation.current += 1;
            toast(tr('till.cash.done', { amount: formatIQD(amount, locale) }), 'success');
            dismiss();
            void qc.invalidateQueries({ queryKey: QK.tillCashMovements(shiftId) });
          })
          .catch((err: unknown) => setError(errorMessage(err, locale)))
          .finally(() => setBusy(false));
      },
      amount,
    );
  }

  return (
    <section className="rop-cash" aria-labelledby="cash-title">
      <h2 id="cash-title">{tr('till.cash.title')}</h2>
      <p className="rop-field__hint">{tr('till.cash.hint')}</p>
      <div className="rop-cash__kinds">
        {CASH_KINDS.map((k) => (
          <Button key={k} onClick={() => setKind(k)}>
            {tr(`till.cash.${k}`)}
          </Button>
        ))}
      </div>

      <h3>{tr('till.cash.listTitle')}</h3>
      {list.isPending && <Loading />}
      {list.isError && <ErrorState error={list.error} onRetry={() => void list.refetch()} />}
      {list.data && list.data.length === 0 && <p className="rop-cash__none">{tr('till.cash.none')}</p>}
      {list.data && list.data.length > 0 && (
        <ul className="rop-cash__list">
          {list.data.map((m) => (
            <li key={m.id}>
              <span className="rop-cash__kind">{tr(`till.cash.${m.kind}`)}</span>
              <span className="rop-cash__amount">
                {m.kind === 'pay_in' ? '+' : '−'}
                <Money amount={m.amount} />
              </span>
              <span className="rop-cash__meta">
                <time dateTime={m.createdAt}>{formatTime(new Date(m.createdAt), locale)}</time> · {m.reason}
              </span>
            </li>
          ))}
        </ul>
      )}

      <Modal open={kind !== null} title={kind ? tr(`till.cash.title_${kind}`) : ''} onClose={dismiss}>
        <form className="rop-form" onSubmit={submit}>
          <AmountPad label={tr('till.cash.amount')} value={amount} onChange={setAmount} />
          {!gate.needsPin && (
            <Field label={tr('common.reasonLabel')} hint={tr('till.cash.reasonHint')}>
              {(p) => <input {...p} type="text" autoComplete="off" value={reason} onChange={(e) => setReason(e.target.value)} />}
            </Field>
          )}
          {error && (
            <p role="alert" className="rop-field__error">
              {error}
            </p>
          )}
          <div className="rop-modal__footer">
            <Button onClick={dismiss}>{tr('common.cancel')}</Button>
            <Button type="submit" variant="primary" busy={busy} disabled={busy}>
              {tr('till.cash.record')}
            </Button>
          </div>
        </form>
      </Modal>
      {gate.element}
    </section>
  );
}
