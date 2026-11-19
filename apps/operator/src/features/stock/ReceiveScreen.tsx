import { useRef, useState } from 'react';
import { Button, ErrorState, Loading } from '../../components';
import { appRpc } from '../../lib/appRpc';
import { newIdem } from '../../lib/idem';
import { useLocale } from '../../lib/i18n';
import { SelectField, TextField } from '../manage/formKit';
import { useRun } from '../manage/shared';
import { ingredientName, useIngredients, useSuppliers } from './stockData';
import { deliveryPayload, type DeliveryLineDraft } from './stockLogic';

const blank = (): DeliveryLineDraft => ({ ingredientId: '', qty: '', unitCost: '' });

export function ReceiveScreen() {
  const { tr, locale } = useLocale();
  const ingredients = useIngredients();
  const suppliers = useSuppliers();
  const { busy, run } = useRun(['stock']);
  const [supplierId, setSupplier] = useState('');
  const [note, setNote] = useState('');
  const [lines, setLines] = useState<DeliveryLineDraft[]>([blank()]);
  // One key per delivery attempt: a retry after a lost answer replays, never double-receives.
  const key = useRef(newIdem('receive_delivery'));

  if (ingredients.isPending || suppliers.isPending) return <Loading />;
  if (ingredients.error || suppliers.error) {
    return <ErrorState error={ingredients.error ?? suppliers.error} onRetry={() => { void ingredients.refetch(); void suppliers.refetch(); }} />;
  }

  const active = ingredients.data.filter((i) => i.is_active);
  const unitOf = new Map(ingredients.data.map((i) => [i.id, i.unit]));
  const payload = deliveryPayload(lines);
  const patch = (i: number, p: Partial<DeliveryLineDraft>) => setLines(lines.map((l, j) => (j === i ? { ...l, ...p } : l)));

  async function submit() {
    if (!payload) return;
    const r = await run(
      () => appRpc('receive_delivery', { p_supplier_id: supplierId || null, p_lines: payload, p_note: note.trim() || null, p_idempotency_key: key.current }),
      'stock.deliveryReceived',
    );
    if (r.ok) {
      key.current = newIdem('receive_delivery');
      setLines([blank()]);
      setNote('');
    }
  }

  return (
    <section>
      <h2>{tr('stock.receive')}</h2>
      <form
        className="manage__form"
        onSubmit={(e) => {
          e.preventDefault();
          void submit();
        }}
      >
        <SelectField
          label={tr('stock.supplier')}
          value={supplierId}
          onChange={setSupplier}
          placeholder={tr('stock.noSupplier')}
          options={suppliers.data.map((s) => ({ value: s.id, label: s.name }))}
        />
        {lines.map((l, i) => (
          <fieldset key={i}>
            <legend>{tr('stock.lineN', { n: i + 1 })}</legend>
            <SelectField
              label={tr('stock.ingredient')}
              value={l.ingredientId}
              onChange={(v) => patch(i, { ingredientId: v })}
              placeholder={tr('manage.choose')}
              options={active.map((x) => ({ value: x.id, label: `${ingredientName(x, locale)} (${x.unit})` }))}
            />
            <TextField
              label={tr('stock.qtyUnit', { unit: unitOf.get(l.ingredientId) ?? '' })}
              value={l.qty}
              onChange={(v) => patch(i, { qty: v })}
              hint={tr('stock.qtyHint')}
            />
            <TextField
              label={tr('stock.unitCost')}
              value={l.unitCost}
              onChange={(v) => patch(i, { unitCost: v })}
              hint={tr('stock.unitCostHint')}
            />
            {lines.length > 1 && <Button onClick={() => setLines(lines.filter((_, j) => j !== i))}>{tr('stock.removeLine')}</Button>}
          </fieldset>
        ))}
        <div>
          <Button onClick={() => setLines([...lines, blank()])}>{tr('stock.addLine')}</Button>
        </div>
        <TextField label={tr('stock.note')} value={note} onChange={setNote} />
        <div>
          <Button type="submit" variant="primary" busy={busy} disabled={!payload}>
            {tr('stock.receiveSubmit')}
          </Button>
        </div>
      </form>
    </section>
  );
}
