// Blind stock count. This screen never reads or shows expected or on-hand quantities:
// it selects only names, units and the counted figures the user typed. The server keeps
// the expected snapshot and applies counted - on-hand at finalize.
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Button, ConfirmDialog, DataTable, ErrorState, Loading, type Column } from '../../components';
import { appRpc } from '../../lib/appRpc';
import { errorMessage } from '../../lib/errors';
import { useLocale } from '../../lib/i18n';
import { QK } from '../../lib/queryKeys';
import { selectRows, useRun } from '../manage/shared';
import { ingredientName } from './stockData';
import {
  countError,
  countedTotal,
  debounce,
  emptySheet,
  formatQty,
  markSaved,
  pendingLines,
  setCounted,
  sheetFromSaved,
  type CountSheet,
  type Unit,
} from './stockLogic';

interface CountIngredient {
  id: string;
  name_en: string;
  name_ar: string;
  unit: Unit;
}
interface Adjustment {
  ingredient_id: string;
  qty: number;
}

export const AUTOSAVE_MS = 800;

export function CountScreen() {
  const { tr } = useLocale();
  const { busy, run } = useRun(['stock']);
  const open = useQuery({
    queryKey: QK.stock('count', 'open'),
    queryFn: async () => {
      const rows = await selectRows<{ id: string; finalized_at: string | null }>('stock_counts', 'id, finalized_at', {
        order: 'started_at',
        desc: true,
        limit: 1,
      });
      return rows.find((r) => r.finalized_at === null)?.id ?? null;
    },
  });
  const [adjustments, setAdjustments] = useState<Adjustment[] | null>(null);

  if (open.isPending) return <Loading />;
  if (open.error) return <ErrorState error={open.error} onRetry={() => void open.refetch()} />;

  if (adjustments) {
    return <Adjustments adjustments={adjustments} onDone={() => setAdjustments(null)} />;
  }

  if (!open.data) {
    return (
      <section>
        <h2>{tr('stock.countTitle')}</h2>
        <p>{tr('stock.count.none')}</p>
        <Button
          variant="primary"
          busy={busy}
          onClick={() => void run(() => appRpc('start_count'), 'stock.count.started').then(() => open.refetch())}
        >
          {tr('stock.count.start')}
        </Button>
      </section>
    );
  }

  return (
    <CountSheetView
      countId={open.data}
      onFinalized={(a) => {
        setAdjustments(a);
        void open.refetch();
      }}
    />
  );
}

function CountSheetView({ countId, onFinalized }: { countId: string; onFinalized: (a: Adjustment[]) => void }) {
  const { tr, locale } = useLocale();
  const { busy, run } = useRun(['stock']);
  const ingredients = useQuery({
    queryKey: QK.stock('count', 'ingredients'),
    queryFn: () =>
      selectRows<CountIngredient>('ingredients', 'id, name_en, name_ar, unit', { order: 'name_en', eq: ['is_active', true] }),
  });
  const saved = useQuery({
    queryKey: QK.stock('count', 'lines', countId),
    queryFn: () => selectRows<{ ingredient_id: string; counted: number | null }>('stock_count_lines', 'ingredient_id, counted', { eq: ['count_id', countId] }),
    staleTime: Infinity,
  });

  const [sheet, setSheet] = useState<CountSheet>(emptySheet);
  const sheetRef = useRef(sheet);
  sheetRef.current = sheet;
  const hydrated = useRef(false);
  const [status, setStatus] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle');
  const [saveError, setSaveError] = useState<string | null>(null);
  const [confirming, setConfirming] = useState(false);

  useEffect(() => {
    if (saved.data && !hydrated.current) {
      hydrated.current = true;
      setSheet((s) => {
        const base = sheetFromSaved(saved.data);
        // Keep anything typed before the saved lines arrived.
        let merged = base;
        for (const id of s.dirty) merged = setCounted(merged, id, s.values[id] ?? '');
        return merged;
      });
    }
  }, [saved.data]);

  const saveNow = useCallback(async (): Promise<boolean> => {
    const cur = sheetRef.current;
    const lines = pendingLines(cur);
    if (lines.length === 0) return true;
    setStatus('saving');
    try {
      await appRpc('save_count_lines', { p_count_id: countId, p_lines: lines });
      setSheet((s) => markSaved(s, lines, cur.values));
      setStatus('saved');
      setSaveError(null);
      return true;
    } catch (err) {
      setStatus('error');
      setSaveError(errorMessage(err, locale));
      return false;
    }
  }, [countId, locale]);

  const debounced = useMemo(() => debounce(() => void saveNow(), AUTOSAVE_MS), [saveNow]);
  // Leaving the screen saves what is waiting rather than losing it.
  useEffect(() => () => debounced.flush(), [debounced]);

  function edit(id: string, text: string) {
    setSheet((s) => setCounted(s, id, text));
    debounced();
  }

  async function finalize() {
    setConfirming(false);
    debounced.cancel();
    if (!(await saveNow())) return;
    const r = await run(() => appRpc<{ adjustments: Adjustment[] }>('finalize_count', { p_count_id: countId }), 'stock.count.finalized');
    if (r.ok) onFinalized(r.value.adjustments);
  }

  if (ingredients.isPending || saved.isPending) return <Loading />;
  const failed = ingredients.error ?? saved.error;
  if (failed) return <ErrorState error={failed} onRetry={() => { void ingredients.refetch(); void saved.refetch(); }} />;
  if (!ingredients.data) return <Loading />;

  const hasInvalid = Object.values(sheet.values).some(countError);
  const total = ingredients.data.length;
  const counted = countedTotal(sheet);

  const cols: Column<CountIngredient>[] = [
    { key: 'name', header: tr('stock.ingredient'), cell: (i) => ingredientName(i, locale) },
    { key: 'unit', header: tr('stock.unit'), cell: (i) => i.unit },
    {
      key: 'counted',
      header: tr('stock.count.counted'),
      cell: (i) => {
        const text = sheet.values[i.id] ?? '';
        const bad = countError(text);
        return (
          <>
            <input
              className="manage__count-input"
              inputMode="decimal"
              aria-label={tr('stock.count.countedFor', { name: ingredientName(i, locale), unit: i.unit })}
              aria-invalid={bad || undefined}
              value={text}
              onChange={(e) => edit(i.id, e.target.value)}
            />
            {bad && <span role="alert"> {tr('stock.err.qty')}</span>}
          </>
        );
      },
    },
  ];

  return (
    <section>
      <h2>{tr('stock.countTitle')}</h2>
      <p>{tr('stock.count.blindNote')}</p>
      <p role="status">
        {tr('stock.count.progress', { counted, total })} ·{' '}
        {status === 'saving' ? tr('stock.count.saving') : status === 'saved' ? tr('stock.count.saved') : status === 'error' ? tr('stock.count.saveFailed') : ''}
      </p>
      {saveError && (
        <p role="alert" className="rop-field__error">
          {saveError}
        </p>
      )}
      <DataTable columns={cols} rows={ingredients.data} rowKey={(i) => i.id} caption={tr('stock.countTitle')} emptyMessage={tr('stock.noIngredients')} />
      <div className="manage__row">
        <Button variant="primary" busy={busy} disabled={hasInvalid} onClick={() => setConfirming(true)}>
          {tr('stock.count.finalize')}
        </Button>
      </div>
      <ConfirmDialog
        open={confirming}
        title={tr('stock.count.finalizeTitle')}
        message={tr('stock.count.finalizeMessage', { missing: total - counted })}
        confirmLabel={tr('stock.count.finalize')}
        busy={busy}
        onConfirm={() => void finalize()}
        onCancel={() => setConfirming(false)}
      />
    </section>
  );
}

function Adjustments({ adjustments, onDone }: { adjustments: Adjustment[]; onDone: () => void }) {
  const { tr, locale } = useLocale();
  const ing = useQuery({
    queryKey: QK.stock('count', 'adjust-names'),
    queryFn: () => selectRows<CountIngredient>('ingredients', 'id, name_en, name_ar, unit'),
  });
  const byId = new Map((ing.data ?? []).map((i) => [i.id, i]));
  const cols: Column<Adjustment>[] = [
    { key: 'name', header: tr('stock.ingredient'), cell: (a) => (byId.get(a.ingredient_id) ? ingredientName(byId.get(a.ingredient_id) as CountIngredient, locale) : a.ingredient_id) },
    {
      key: 'qty',
      header: tr('stock.count.adjustment'),
      align: 'end',
      cell: (a) => <bdi>{`${a.qty > 0 ? '+' : ''}${formatQty(a.qty, byId.get(a.ingredient_id)?.unit ?? 'pc', locale)}`}</bdi>,
    },
  ];
  return (
    <section>
      <h2>{tr('stock.count.adjustments')}</h2>
      <DataTable columns={cols} rows={adjustments} rowKey={(a) => a.ingredient_id} caption={tr('stock.count.adjustments')} emptyMessage={tr('stock.count.noAdjustments')} />
      <Button variant="primary" onClick={onDone}>
        {tr('stock.count.done')}
      </Button>
    </section>
  );
}
