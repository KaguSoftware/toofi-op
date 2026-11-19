import { useRef, useState, type FormEvent } from 'react';
import type { StaffRole } from '@rop/core';
import { Button, Field, Money, useToast } from '../../components';
import { appRpc } from '../../lib/appRpc';
import { errorMessage } from '../../lib/errors';
import { useLocale } from '../../lib/i18n';
import { newIdem, stationId } from '../../lib/idem';
import { formatIQD } from '@rop/i18n';
import type { BillPayment } from './tillData';
import { attemptKey, parseAmount, refundable, type Attempt } from './tillLogic';
import { useGatedAction } from './useGatedAction';

export function RefundPanel({
  payments,
  role,
  onRefunded,
}: {
  payments: readonly BillPayment[];
  role: StaffRole | null;
  onRefunded: () => void;
}) {
  const { tr } = useLocale();
  if (payments.length === 0) return null;
  return (
    <section aria-labelledby="till-refund-title">
      <h2 id="till-refund-title">{tr('till.refund.title')}</h2>
      <ul className="rop-till-payments">
        {payments.map((p) => (
          <RefundRow key={`${p.id}:${p.refunded}`} payment={p} role={role} onRefunded={onRefunded} />
        ))}
      </ul>
    </section>
  );
}

function RefundRow({ payment, role, onRefunded }: { payment: BillPayment; role: StaffRole | null; onRefunded: () => void }) {
  const { tr, locale } = useLocale();
  const toast = useToast();
  const gate = useGatedAction(role, 'refund', 'refund', true, payment.id);
  const left = refundable(payment.amount, payment.refunded);
  const [text, setText] = useState(String(left));
  const [reason, setReason] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const attempt = useRef<Attempt | null>(null);

  function submit(e: FormEvent) {
    e.preventDefault();
    if (busy) return;
    const amount = parseAmount(text);
    if (amount === null || amount <= 0 || amount > left) return setError(tr('till.refund.invalid'));
    if (!gate.needsPin && reason.trim() === '') return setError(tr('till.refund.reasonNeeded'));
    setError(null);
    gate.request(reason.trim(), (why) => {
      setBusy(true);
      attempt.current = attemptKey(attempt.current, `${payment.id}|${amount}|${payment.refunded}`, () => newIdem('refund'));
      appRpc('refund', {
        p_payment_id: payment.id,
        p_amount: amount,
        p_reason: why,
        p_device_id: stationId(),
        p_idempotency_key: attempt.current.key,
      })
        .then(() => {
          attempt.current = null;
          setReason('');
          toast(tr('till.refund.done', { amount: formatIQD(amount, locale) }), 'success');
          onRefunded();
        })
        .catch((err: unknown) => setError(errorMessage(err, locale)))
        .finally(() => setBusy(false));
    }, amount);
  }

  return (
    <li>
      <p>
        {tr(payment.method === 'cash' ? 'till.method.cash' : 'till.method.card')} <Money amount={payment.amount} />
        {payment.refunded > 0 && (
          <>
            {' · '}
            {tr('till.refund.refundedSoFar')}: <Money amount={payment.refunded} />
          </>
        )}
      </p>
      {left === 0 ? (
        <p>{tr('till.refund.nothingLeft')}</p>
      ) : (
        <form onSubmit={submit} className="rop-form">
          <Field label={tr('till.refund.amount')} hint={`${tr('till.refund.refundableNow')}: ${formatIQD(left, locale)}`}>
            {(p) => <input {...p} type="text" inputMode="numeric" autoComplete="off" value={text} onChange={(e) => setText(e.target.value)} />}
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
          <Button type="submit" variant="danger" busy={busy} disabled={busy}>
            {tr('till.refund.submit')}
          </Button>
        </form>
      )}
      {gate.element}
    </li>
  );
}
