import { useRef, useState } from 'react';
import { Button, ErrorState, Loading } from '../../components';
import { appRpc } from '../../lib/appRpc';
import { newIdem } from '../../lib/idem';
import { useLocale } from '../../lib/i18n';
import { SelectField, TextField } from '../manage/formKit';
import { useRun } from '../manage/shared';
import { ingredientName, useIngredients } from './stockData';
import { parseQty } from './stockLogic';

export function WasteScreen() {
  const { tr, locale } = useLocale();
  const ingredients = useIngredients();
  const { busy, run } = useRun(['stock']);
  const [ingredientId, setIngredient] = useState('');
  const [qty, setQty] = useState('');
  const [reason, setReason] = useState('');
  const [tried, setTried] = useState(false);
  const key = useRef(newIdem('record_waste'));

  if (ingredients.isPending) return <Loading />;
  if (ingredients.error) return <ErrorState error={ingredients.error} onRetry={() => void ingredients.refetch()} />;

  const unit = ingredients.data.find((i) => i.id === ingredientId)?.unit ?? '';
  const n = parseQty(qty);

  async function submit() {
    setTried(true);
    if (!ingredientId || n === null || n <= 0 || !reason.trim()) return;
    const r = await run(
      () => appRpc('record_waste', { p_ingredient_id: ingredientId, p_qty: n, p_reason: reason.trim(), p_idempotency_key: key.current }),
      'stock.wasteRecorded',
    );
    if (r.ok) {
      key.current = newIdem('record_waste');
      setQty('');
      setReason('');
      setTried(false);
    }
  }

  return (
    <section>
      <h2>{tr('stock.waste')}</h2>
      <form
        className="manage__form"
        onSubmit={(e) => {
          e.preventDefault();
          void submit();
        }}
      >
        <SelectField
          label={tr('stock.ingredient')}
          value={ingredientId}
          onChange={setIngredient}
          placeholder={tr('manage.choose')}
          options={ingredients.data.filter((i) => i.is_active).map((i) => ({ value: i.id, label: `${ingredientName(i, locale)} (${i.unit})` }))}
          error={tried && !ingredientId ? 'stock.err.ingredient' : null}
        />
        <TextField
          label={tr('stock.qtyUnit', { unit })}
          value={qty}
          onChange={setQty}
          hint={tr('stock.qtyHint')}
          error={tried && (n === null || n <= 0) ? 'stock.err.qty' : null}
        />
        <TextField label={tr('common.reasonLabel')} value={reason} onChange={setReason} hint={tr('common.reasonHint')} error={tried && !reason.trim() ? 'stock.err.reason' : null} />
        <div>
          <Button type="submit" variant="primary" busy={busy}>
            {tr('stock.wasteSubmit')}
          </Button>
        </div>
      </form>
    </section>
  );
}
