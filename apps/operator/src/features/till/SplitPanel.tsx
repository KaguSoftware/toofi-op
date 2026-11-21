import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Button, ErrorState, Field, Loading, Money } from '../../components';
import { appRpc } from '../../lib/appRpc';
import { useLocale } from '../../lib/i18n';
import type { BillLine } from './tillData';
import { parseItemSplit, parseShares } from './tillLogic';
import { INITIAL_SPLIT, selectableLines, type SplitState } from './splitLogic';

export { INITIAL_SPLIT, type SplitState };

/** What the payment pane should take next, and what to record once it is paid. */
export type SplitTarget = { amount: number; even: true } | { amount: number; lineIds: string[] };

export interface SplitPanelProps {
  tabId: string;
  due: number;
  lines: readonly BillLine[];
  state: SplitState;
  onState: (next: SplitState) => void;
  onUse: (target: SplitTarget) => void;
}

export function SplitPanel({ tabId, due, lines, state, onState, onUse }: SplitPanelProps) {
  const { tr } = useLocale();
  const [mode, setMode] = useState<'even' | 'items'>('even');
  return (
    <section className="rop-till-split" aria-labelledby="till-split-title">
      <h2 id="till-split-title">{tr('till.split.title')}</h2>
      <div className="rop-segmented" role="group" aria-label={tr('till.split.title')}>
        <Button aria-pressed={mode === 'even'} onClick={() => setMode('even')}>
          {tr('till.split.evenly')}
        </Button>
        <Button aria-pressed={mode === 'items'} onClick={() => setMode('items')}>
          {tr('till.split.byItem')}
        </Button>
      </div>
      {mode === 'even' ? (
        <EvenSplit tabId={tabId} due={due} state={state} onState={onState} onUse={onUse} />
      ) : (
        <ItemSplit tabId={tabId} due={due} lines={lines} state={state} onUse={onUse} />
      )}
    </section>
  );
}

function EvenSplit({ tabId, due, state, onState, onUse }: Omit<SplitPanelProps, 'lines'>) {
  const { tr } = useLocale();
  const remaining = Math.max(1, state.people - state.paid);
  const q = useQuery({
    queryKey: ['till', 'splitEven', tabId, remaining, due],
    queryFn: async () => parseShares(await appRpc('split_evenly', { p_tab_id: tabId, p_n: remaining })),
  });
  const next = q.data?.[0];
  return (
    <div>
      <Field label={tr('till.split.people')}>
        {(p) => (
          <input
            {...p}
            type="number"
            min={2}
            max={20}
            value={state.people}
            onChange={(e) => {
              const n = Math.min(20, Math.max(2, Math.trunc(Number(e.target.value)) || 2));
              onState({ ...state, people: n, paid: Math.min(state.paid, n - 1) });
            }}
          />
        )}
      </Field>
      {q.isPending && <Loading />}
      {q.isError && <ErrorState error={q.error} onRetry={() => void q.refetch()} />}
      {q.data && (
        <>
          <p>{tr('till.split.allShares')}:</p>
          <ol>
            {q.data.map((s, i) => (
              <li key={i}>
                <Money amount={s} />
              </li>
            ))}
          </ol>
          {next !== undefined && next > 0 && (
            <Button
              className="rop-till-split__use"
              onClick={() => onUse({ amount: next, even: true })}
            >
              {tr('till.split.share', { n: Math.min(state.paid + 1, state.people), total: state.people })}
              {': '}
              <Money amount={next} /> · {tr('till.split.payShare')}
            </Button>
          )}
        </>
      )}
    </div>
  );
}

function ItemSplit({ tabId, due, lines, state, onUse }: Omit<SplitPanelProps, 'onState'>) {
  const { tr, locale } = useLocale();
  const [picked, setPicked] = useState<string[]>([]);
  const ids = [...picked].sort();
  const q = useQuery({
    queryKey: ['till', 'splitItems', tabId, ids, due],
    enabled: ids.length > 0,
    queryFn: async () => parseItemSplit(await appRpc('split_by_item', { p_tab_id: tabId, p_order_item_ids: ids })),
  });
  const toggle = (id: string) => setPicked((xs) => (xs.includes(id) ? xs.filter((x) => x !== id) : [...xs, id]));
  return (
    <div>
      <p>{tr('till.split.pickLines')}</p>
      <ul className="rop-till-picklist">
        {lines
          .filter((l) => !l.voided)
          .map((l) => {
            const paid = selectableLines(state, [l.id]).length === 0;
            return (
              <li key={l.id}>
                <label>
                  <input type="checkbox" disabled={paid} checked={picked.includes(l.id)} onChange={() => toggle(l.id)} />{' '}
                  {l.qty} × {locale === 'ar' ? l.nameAr : l.nameEn} <Money amount={l.lineTotal} />
                  {paid && ` (${tr('till.split.paidLine')})`}
                </label>
              </li>
            );
          })}
      </ul>
      {ids.length > 0 && q.isPending && <Loading />}
      {ids.length > 0 && q.isError && <ErrorState error={q.error} onRetry={() => void q.refetch()} />}
      {ids.length > 0 && q.data && (
        <p>
          {tr('till.split.selected')}: <Money amount={q.data.amount} />{' '}
          <Button
            disabled={q.data.amount <= 0}
            onClick={() => {
              onUse({ amount: q.data.amount, lineIds: ids });
              setPicked([]);
            }}
          >
            {tr('till.split.payItems')}
          </Button>
        </p>
      )}
    </div>
  );
}
