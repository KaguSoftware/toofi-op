import { useEffect, useRef, useState } from 'react';
import { AmountPad, Button, Field, Money } from '../../components';
import { appRpc } from '../../lib/appRpc';
import { errorMessage } from '../../lib/errors';
import { useLocale } from '../../lib/i18n';
import { newIdem, stationId } from '../../lib/idem';
import { isUnclearFailure } from '../../lib/unclearLogic';
import {
  attemptKey,
  canPay,
  paymentLanded,
  paymentSig,
  changeFor,
  parseAmount,
  parseSettleResult,
  quickTenders,
  type Attempt,
  type Method,
  type SettleResult,
} from './tillLogic';

export interface PaymentPaneProps {
  tabId: string;
  /** What the server says is due. */
  due: number;
  /** The amount to start from (the full due, or a split share). Changing it resets the pane. */
  suggested: number;
  shiftOpen: boolean;
  onPaid: (result: SettleResult) => void;
  /** Refetch the bill and resolve to the fresh amount due; rejects if the bill cannot be read. */
  onRecheck?: () => Promise<number>;
}

export function PaymentPane({ tabId, due, suggested, shiftOpen, onPaid, onRecheck }: PaymentPaneProps) {
  const { tr, locale } = useLocale();
  const [method, setMethod] = useState<Method>('cash');
  const [amountText, setAmountText] = useState(String(suggested));
  const [tendered, setTendered] = useState(0);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [unclear, setUnclear] = useState<'checking' | 'failed' | null>(null);
  const inFlight = useRef(false);
  const attempt = useRef<Attempt | null>(null);
  const generation = useRef(0); // bumps after each success: the next payment is a new one

  useEffect(() => {
    setAmountText(String(suggested));
    setTendered(0);
    setError(null);
  }, [suggested]);

  const amount = parseAmount(amountText) ?? 0;
  const check = canPay({ method, amount, due, tendered, shiftOpen, submitting: submitting || unclear !== null });
  const change = method === 'cash' ? changeFor(tendered, amount) : 0;

  /** After an unclear payment: re-read the bill before allowing another attempt. */
  async function recheck(dueBefore: number) {
    if (!onRecheck) {
      setUnclear(null);
      return;
    }
    setUnclear('checking');
    try {
      const dueNow = await onRecheck();
      if (paymentLanded(dueBefore, dueNow)) {
        generation.current += 1; // it went through: anything next is a new payment
        attempt.current = null;
        setError(null);
      }
      setUnclear(null);
    } catch {
      setUnclear('failed');
    }
  }

  async function pay() {
    if (inFlight.current || !check.ok) return;
    inFlight.current = true;
    setSubmitting(true);
    setError(null);
    const sig = paymentSig(tabId, method, amount, generation.current);
    attempt.current = attemptKey(attempt.current, sig, () => newIdem('settle_tab'));
    try {
      const raw = await appRpc('settle_tab', {
        p_tab_id: tabId,
        p_method: method,
        p_amount: amount,
        p_tendered: method === 'cash' ? tendered : null,
        p_device_id: stationId(),
        p_idempotency_key: attempt.current.key,
      });
      generation.current += 1;
      attempt.current = null;
      onPaid(parseSettleResult(raw));
    } catch (e) {
      setError(errorMessage(e, locale)); // the key is kept, so a retry of this same payment is safe
      if (isUnclearFailure(e)) void recheck(due);
    } finally {
      inFlight.current = false;
      setSubmitting(false);
    }
  }

  const hint =
    !check.ok && check.why === 'noShift'
      ? tr('till.pay.noShift')
      : !check.ok && check.why === 'tendered' && tendered > 0
        ? tr('till.pay.short')
        : !check.ok && check.why === 'amount'
          ? tr('till.pay.badAmount')
          : null;

  return (
    <section className="rop-till-pay" aria-labelledby="till-pay-title">
      <h2 id="till-pay-title">{tr('till.pay.title')}</h2>
      <fieldset className="rop-till-method">
        <legend>{tr('till.pay.method')}</legend>
        {(['cash', 'card'] as const).map((m) => (
          <label key={m}>
            <input type="radio" name="till-method" checked={method === m} onChange={() => setMethod(m)} />{' '}
            {tr(m === 'cash' ? 'till.method.cash' : 'till.method.card')}
          </label>
        ))}
      </fieldset>

      <Field label={tr('till.pay.amount')}>
        {(p) => (
          <input
            {...p}
            type="text"
            inputMode="numeric"
            autoComplete="off"
            value={amountText}
            onChange={(e) => setAmountText(e.target.value)}
          />
        )}
      </Field>

      {method === 'cash' && (
        <div className="rop-till-cash">
          <AmountPad label={tr('till.pay.tendered')} value={tendered} onChange={setTendered} />
          <div className="rop-till-quick" role="group" aria-label={tr('till.pay.tendered')}>
            <Button onClick={() => setTendered(amount)}>{tr('till.pay.exact')}</Button>
            {quickTenders(amount).map((note) => (
              <Button key={note} onClick={() => setTendered(note)}>
                <Money amount={note} />
              </Button>
            ))}
          </div>
          <p className="rop-till-change" aria-live="polite">
            {tr('till.pay.change')}: <strong>{tendered >= amount && amount > 0 ? <Money amount={change} /> : '-'}</strong>
          </p>
        </div>
      )}

      {unclear === 'checking' && <p role="status">{tr('till.pay.checking')}</p>}
      {unclear === 'failed' && (
        <p role="alert" className="rop-field__error">
          {tr('till.pay.checkFailed')} <Button onClick={() => void recheck(due)}>{tr('till.pay.recheck')}</Button>
        </p>
      )}
      {hint && <p className="rop-field__hint">{hint}</p>}
      {error && (
        <p role="alert" className="rop-field__error">
          {error}
        </p>
      )}
      <Button variant="primary" busy={submitting} disabled={!check.ok} onClick={() => void pay()}>
        {submitting ? tr('till.pay.paying') : tr('till.pay.pay')}
      </Button>
    </section>
  );
}
