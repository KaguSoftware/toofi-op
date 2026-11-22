import { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import type { StaffRole } from '@rop/core';
import { formatDateTime, formatIQD } from '@rop/i18n';
import { Button, DataTable, ErrorState, Icon, Loading, Money, useToast, type Column } from '../../components';
import { useLocale } from '../../lib/i18n';
import { printReceipt } from '../../lib/print';
import { QK } from '../../lib/queryKeys';
import { DiscountControl } from './DiscountControl';
import { PaymentPane } from './PaymentPane';
import { RefundPanel } from './RefundPanel';
import { SplitPanel, type SplitTarget } from './SplitPanel';
import { loadSplit, markLinesPaid, pruneSplit, saveSplit, type SplitState } from './splitLogic';
import { fetchBill, fetchReceiptSettings, type Bill, type BillLine } from './tillData';
import { buildReceiptHtml } from './receiptLogic';
import type { SettleResult } from './tillLogic';

export interface BillPanelProps {
  tabId: string;
  role: StaffRole | null;
  shiftOpen: boolean;
  onBack: () => void;
}

export function BillPanel({ tabId, role, shiftOpen, onBack }: BillPanelProps) {
  const { tr, locale } = useLocale();
  const toast = useToast();
  const qc = useQueryClient();
  const q = useQuery({ queryKey: QK.tillBill(tabId), queryFn: () => fetchBill(tabId) });
  const [last, setLast] = useState<SettleResult | null>(null);
  const [split, setSplit] = useState<SplitState>(() => loadSplit(localStorage, tabId));
  const [target, setTarget] = useState<SplitTarget | null>(null);
  // Splitting is the exception: it stays folded away unless a split is already under way.
  const [splitOpen, setSplitOpen] = useState(() => split.paid > 0 || split.paidLines.length > 0);

  // Every change is remembered per tab: a reload must not make a paid line payable again.
  const updateSplit = (f: (s: SplitState) => SplitState) =>
    setSplit((s) => {
      const next = f(s);
      saveSplit(localStorage, tabId, next);
      return next;
    });
  const refresh = () => void qc.invalidateQueries({ queryKey: ['till'] });

  if (q.isPending) return <Loading />;
  if (q.isError) return <ErrorState error={q.error} onRetry={() => void q.refetch()} />;
  const bill = q.data;
  const { totals } = bill;
  const isOpen = bill.status === 'open';

  function onPaid(result: SettleResult) {
    setLast(result);
    if (target && 'even' in target) updateSplit((s) => ({ ...s, paid: Math.min(s.paid + 1, s.people - 1) }));
    if (target && 'lineIds' in target) {
      const ids = target.lineIds;
      updateSplit((s) => markLinesPaid(s, ids));
    }
    if (result.settled) saveSplit(localStorage, tabId, loadSplit(null, tabId)); // the bill is done: forget the split
    setTarget(null);
    refresh();
  }

  async function print(b: Bill) {
    const settings = await qc.fetchQuery({ queryKey: QK.tillSettings(), queryFn: fetchReceiptSettings, staleTime: 60_000 });
    const html = buildReceiptHtml({
      settings,
      tab: { tableLabel: b.tableLabel, openedAt: b.openedAt, closedAt: b.closedAt },
      lines: b.lines,
      totals: b.totals,
      payments: b.payments,
      locale,
    });
    const r = await printReceipt(html);
    toast(r.ok ? tr('till.settled.printSent') : tr('till.settled.printFailed'), r.ok ? 'success' : 'error');
  }

  const lineName = (l: BillLine) => (locale === 'ar' ? l.nameAr : l.nameEn);
  const columns: Column<BillLine>[] = [
    {
      key: 'item',
      header: tr('till.bill.item'),
      cell: (l) => (l.voided ? <s>{lineName(l)} ({tr('till.bill.voided')})</s> : lineName(l)),
    },
    { key: 'qty', header: tr('till.bill.qty'), align: 'end', cell: (l) => (l.voided ? <s>{l.qty}</s> : l.qty) },
    {
      key: 'total',
      header: tr('till.bill.lineTotal'),
      align: 'end',
      cell: (l) => (l.voided ? <s><Money amount={l.lineTotal} /></s> : <Money amount={l.lineTotal} />),
    },
  ];

  const title = bill.tableLabel ? tr('till.table', { label: bill.tableLabel }) : tr('till.noTable');
  const settledAt = bill.closedAt ? formatDateTime(new Date(bill.closedAt), locale) : null;

  return (
    <section className="rop-till-bill" aria-labelledby="till-bill-title">
      <header className="rop-till-bill__head">
        <h2 id="till-bill-title">
          {tr('till.bill.title')}: {title}
        </h2>
        <Button onClick={onBack}>{tr('till.back')}</Button>
      </header>

      <div className="rop-till-bill__cols">
        <div className="rop-till-bill__main">
          <div className="rop-till-check">
          <DataTable columns={columns} rows={bill.lines} rowKey={(l) => l.id} caption={tr('till.bill.title')} />

          <dl className="rop-till-totals">
            <dt>{tr('till.bill.subtotal')}</dt>
            <dd><Money amount={totals.subtotal} /></dd>
            {totals.discount > 0 && (
              <>
                <dt>{tr('till.bill.discount')}</dt>
                <dd>−<Money amount={totals.discount} /></dd>
              </>
            )}
            <dt>{tr('till.bill.tax')}</dt>
            <dd><Money amount={totals.tax} /></dd>
            <dt>{tr('till.bill.total')}</dt>
            <dd><strong><Money amount={totals.total} /></strong></dd>
            <dt>{tr('till.bill.paid')}</dt>
            <dd><Money amount={totals.paid} /></dd>
            {totals.refunded > 0 && (
              <>
                <dt>{tr('till.bill.refunded')}</dt>
                <dd><Money amount={totals.refunded} /></dd>
              </>
            )}
            <dt>{tr('till.bill.due')}</dt>
            <dd><strong><Money amount={totals.due} /></strong></dd>
          </dl>
          </div>

          {isOpen ? (
            <>
              <div className="rop-till-actions">
                <DiscountControl tabId={tabId} role={role} onApplied={refresh} />
                {totals.due > 0 && (
                  <Button aria-expanded={splitOpen} aria-controls="till-split" onClick={() => setSplitOpen((o) => !o)}>
                    {tr('till.split.title')}
                    <Icon name={splitOpen ? 'arrowUp' : 'arrowDown'} size={18} />
                  </Button>
                )}
              </div>
              {totals.due > 0 && splitOpen && (
                <SplitPanel
                  tabId={tabId}
                  due={totals.due}
                  lines={bill.lines}
                  state={pruneSplit(split, bill.lines.map((l) => l.id))}
                  onState={(s) => updateSplit(() => s)}
                  onUse={setTarget}
                />
              )}
            </>
          ) : (
            <>
              <div className="rop-till-settled">
                <Icon name="check" />
                <div>
                  <h2>{tr('till.settled.title')}</h2>
                  {settledAt && <p>{settledAt}</p>}
                </div>
                <Button variant="primary" onClick={() => void print(bill)}>
                  <Icon name="print" size={20} />
                  {tr('till.settled.print')}
                </Button>
              </div>
              <RefundPanel payments={bill.payments} role={role} onRefunded={refresh} />
            </>
          )}
        </div>

        {(last || (isOpen && totals.due > 0)) && (
          <div className="rop-till-bill__side">
            {last && (
              <div role="status" className="rop-till-paid">
                <span className="rop-till-paid__check" aria-hidden="true">
                  <Icon name="check" size={28} />
                </span>
                <p>{tr('till.pay.taken', { amount: formatIQD(last.amount, locale) })}</p>
                {last.method === 'cash' && (
                  <p className="rop-till-paid__change">
                    {tr('till.pay.change')}: <Money amount={last.change} />
                    <small> {tr('till.pay.giveChange')}</small>
                  </p>
                )}
                {!last.settled && (
                  <p>
                    {tr('till.pay.stillDue')}: <Money amount={last.totals.due} />
                  </p>
                )}
              </div>
            )}

            {isOpen && totals.due > 0 && (
              <PaymentPane
                tabId={tabId}
                due={totals.due}
                suggested={target?.amount ?? totals.due}
                shiftOpen={shiftOpen}
                onPaid={onPaid}
                onRecheck={async () => {
                  const r = await q.refetch();
                  if (r.error || !r.data) throw r.error ?? new Error('bill unreadable');
                  return r.data.totals.due;
                }}
              />
            )}
          </div>
        )}
      </div>
    </section>
  );
}
