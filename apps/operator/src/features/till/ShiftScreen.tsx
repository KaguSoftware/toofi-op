import { Fragment, useState, type FormEvent } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import type { StaffRole } from '@rop/core';
import { formatDateTime } from '@rop/i18n';
import { AmountPad, Button, ConfirmDialog, ErrorState, Field, Loading, Modal, Money, useToast } from '../../components';
import { appRpc } from '../../lib/appRpc';
import { useAuth } from '../../lib/auth';
import { errorMessage } from '../../lib/errors';
import { useLocale } from '../../lib/i18n';
import { stationId } from '../../lib/idem';
import { QK } from '../../lib/queryKeys';
import { CashMovePanel } from './CashMovePanel';
import { fetchOpenShifts, type OpenShift } from './tillData';
import { parseShiftClose, type ShiftClose } from './tillLogic';
import { useGatedAction } from './useGatedAction';
import './till.css';

export function ShiftScreen() {
  const { tr, locale } = useLocale();
  const { staff } = useAuth();
  const qc = useQueryClient();
  const q = useQuery({ queryKey: QK.tillOpenShifts(), queryFn: fetchOpenShifts });
  const [closed, setClosed] = useState<ShiftClose | null>(null);

  const refresh = () => void qc.invalidateQueries({ queryKey: ['till'] });
  const onClosed = (r: ShiftClose) => {
    setClosed(r);
    refresh();
  };

  if (q.isPending) return <Loading />;
  if (q.isError) return <ErrorState error={q.error} onRetry={() => void q.refetch()} />;

  const mine = q.data.find((s) => s.staffId === staff?.id) ?? null;
  const others = q.data.filter((s) => s.staffId !== staff?.id);

  return (
    <section className="rop-shift">
      <h1>{tr('till.shiftTitle')}</h1>
      {closed && <ShiftResult result={closed} />}
      {mine ? (
        <>
          <MyShift shift={mine} onClosed={onClosed} />
          <DrawerOpen />
          <CashMovePanel shiftId={mine.shiftId} role={staff?.role ?? null} />
        </>
      ) : (
        <OpenShift onOpened={refresh} />
      )}
      {others.length > 0 && (
        <section aria-labelledby="shift-others-title">
          <h2 id="shift-others-title">{tr('till.shift.othersTitle')}</h2>
          <ul>
            {others.map((s) => (
              <li key={s.shiftId}>
                <p>
                  {tr('till.shift.byStaff')}: <strong>{s.staffName}</strong> ·{' '}
                  {tr('till.shift.since', { time: formatDateTime(new Date(s.openedAt), locale) })}
                </p>
                <CloseOther shift={s} role={staff?.role ?? null} onClosed={onClosed} />
              </li>
            ))}
          </ul>
        </section>
      )}
    </section>
  );
}

function ShiftResult({ result }: { result: ShiftClose }) {
  const { tr } = useLocale();
  const v = result.variance;
  return (
    <section role="status" className="rop-shift-result" aria-labelledby="shift-result-title">
      <h2 id="shift-result-title">{tr('till.shift.resultTitle')}</h2>
      <dl>
        <dt>{tr('till.shift.openingFloat')}</dt>
        <dd><Money amount={result.openingFloat} /></dd>
        {(['payIns', 'paidOuts', 'drops'] as const)
          .filter((k) => result[k] > 0)
          .map((k) => (
            <Fragment key={k}>
              <dt>{tr(`till.shift.${k}`)}</dt>
              <dd>
                {k === 'payIns' ? '+' : '−'}
                <Money amount={result[k]} />
              </dd>
            </Fragment>
          ))}
        <dt>{tr('till.shift.expected')}</dt>
        <dd><Money amount={result.expected} /></dd>
        <dt>{tr('till.shift.counted')}</dt>
        <dd><Money amount={result.counted} /></dd>
        <dt>{tr('till.shift.variance')}</dt>
        <dd>
          <strong>
            {v === 0 ? tr('till.shift.varianceExact') : v > 0 ? tr('till.shift.varianceOver') : tr('till.shift.varianceShort')}
            {v !== 0 && (
              <>
                {' '}
                <Money amount={Math.abs(v)} />
              </>
            )}
          </strong>
        </dd>
      </dl>
    </section>
  );
}

function OpenShift({ onOpened }: { onOpened: () => void }) {
  const { tr, locale } = useLocale();
  const toast = useToast();
  const [float, setFloat] = useState(0);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function open() {
    if (busy) return;
    setBusy(true);
    setError(null);
    try {
      await appRpc('open_till_shift', { p_device_id: stationId(), p_opening_float: float });
      toast(tr('till.shift.opened'), 'success');
      onOpened();
    } catch (e) {
      setError(errorMessage(e, locale));
    } finally {
      setBusy(false);
    }
  }

  return (
    <section aria-labelledby="shift-open-title">
      <h2 id="shift-open-title">{tr('till.shift.openTitle')}</h2>
      <p>{tr('till.shift.noOpen')}</p>
      <AmountPad label={tr('till.shift.floatLabel')} value={float} onChange={setFloat} />
      {error && (
        <p role="alert" className="rop-field__error">
          {error}
        </p>
      )}
      <Button variant="primary" busy={busy} disabled={busy} onClick={() => void open()}>
        {tr('till.shift.openButton')}
      </Button>
    </section>
  );
}

/** Close my own shift. Blind: the expected cash is not requested or shown until the server answers. */
function MyShift({ shift, onClosed }: { shift: OpenShift; onClosed: (r: ShiftClose) => void }) {
  const { tr, locale } = useLocale();
  const [counted, setCounted] = useState(0);
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function close() {
    if (busy) return;
    setBusy(true);
    setError(null);
    try {
      onClosed(parseShiftClose(await appRpc('close_till_shift', { p_counted_cash: counted })));
      setConfirming(false);
    } catch (e) {
      setConfirming(false);
      setError(errorMessage(e, locale));
    } finally {
      setBusy(false);
    }
  }

  return (
    <section aria-labelledby="shift-close-title">
      <h2 id="shift-close-title">{tr('till.shift.closeTitle')}</h2>
      <p>
        {tr('till.shift.mine')} · {tr('till.shift.since', { time: formatDateTime(new Date(shift.openedAt), locale) })} ·{' '}
        {tr('till.shift.openingFloat')}: <Money amount={shift.openingFloat} />
      </p>
      <p>{tr('till.shift.closeHint')}</p>
      <AmountPad label={tr('till.shift.counted')} value={counted} onChange={setCounted} />
      {error && (
        <p role="alert" className="rop-field__error">
          {error}
        </p>
      )}
      <Button variant="danger" onClick={() => setConfirming(true)}>
        {tr('till.shift.closeButton')}
      </Button>
      <ConfirmDialog
        open={confirming}
        title={tr('till.shift.confirmTitle')}
        message={tr('till.shift.confirmMessage')}
        confirmLabel={tr('till.shift.closeButton')}
        danger
        busy={busy}
        onConfirm={() => void close()}
        onCancel={() => setConfirming(false)}
      />
    </section>
  );
}

function DrawerOpen() {
  const { tr, locale } = useLocale();
  const toast = useToast();
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // The desktop bridge has no drawer kick yet, so this only records the opening.
  async function submit(e: FormEvent) {
    e.preventDefault();
    if (busy) return;
    if (reason.trim() === '') return setError(tr('common.pinReasonRequired'));
    setBusy(true);
    setError(null);
    try {
      await appRpc('record_drawer_open', { p_reason: reason.trim() });
      toast(tr('till.shift.drawerRecorded'), 'success');
      setReason('');
    } catch (err) {
      setError(errorMessage(err, locale));
    } finally {
      setBusy(false);
    }
  }

  return (
    <section aria-labelledby="shift-drawer-title">
      <h2 id="shift-drawer-title">{tr('till.shift.drawerTitle')}</h2>
      <form onSubmit={(e) => void submit(e)} className="rop-form">
        <Field label={tr('common.reasonLabel')} hint={tr('till.shift.drawerHint')} error={error}>
          {(p) => <input {...p} type="text" autoComplete="off" value={reason} onChange={(e) => setReason(e.target.value)} />}
        </Field>
        <Button type="submit" busy={busy} disabled={busy}>
          {tr('till.shift.drawerButton')}
        </Button>
      </form>
    </section>
  );
}

/** A manager (or a cashier with a manager PIN) closes someone else's open shift, also blind. */
function CloseOther({ shift, role, onClosed }: { shift: OpenShift; role: StaffRole | null; onClosed: (r: ShiftClose) => void }) {
  const { tr, locale } = useLocale();
  const gate = useGatedAction(role, 'closeOthersShift', 'close_till_shift', false, shift.shiftId);
  const [open, setOpen] = useState(false);
  const [counted, setCounted] = useState(0);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const dismiss = () => {
    setOpen(false);
    setCounted(0);
    setError(null);
  };

  function submit() {
    if (busy) return;
    gate.request('', () => {
      setBusy(true);
      setError(null);
      appRpc('close_till_shift_for', { p_shift_id: shift.shiftId, p_counted_cash: counted })
        .then((raw) => {
          dismiss();
          onClosed(parseShiftClose(raw));
        })
        .catch((e: unknown) => setError(errorMessage(e, locale)))
        .finally(() => setBusy(false));
    });
  }

  return (
    <>
      <Button onClick={() => setOpen(true)}>{tr('till.shift.closeOther')}</Button>
      <Modal open={open} title={tr('till.shift.closeOtherTitle', { name: shift.staffName })} onClose={dismiss}>
        <div className="rop-form">
          <p>{tr('till.shift.closeHint')}</p>
          <AmountPad label={tr('till.shift.counted')} value={counted} onChange={setCounted} />
          {error && (
            <p role="alert" className="rop-field__error">
              {error}
            </p>
          )}
          <div className="rop-modal__footer">
            <Button onClick={dismiss}>{tr('common.cancel')}</Button>
            <Button variant="danger" busy={busy} onClick={submit}>
              {tr('till.shift.closeButton')}
            </Button>
          </div>
        </div>
      </Modal>
      {gate.element}
    </>
  );
}
