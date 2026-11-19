import { useEffect, useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { formatPercent } from '@rop/i18n';
import { Button, ErrorState, Loading, Money } from '../../components';
import { appRpc } from '../../lib/appRpc';
import { useLocale } from '../../lib/i18n';
import { QK } from '../../lib/queryKeys';
import { SelectField, TextField } from '../manage/formKit';
import { selectRows, useRun } from '../manage/shared';
import { ingredientName, useIngredients } from './stockData';
import { parseQty, recipePreview, validateRecipe } from './stockLogic';

interface MenuItem {
  id: string;
  name_en: string;
  name_ar: string;
  price: number;
}
interface ItemCost {
  cost: number;
  margin: number;
  has_recipe: boolean;
}
interface Draft {
  ingredientId: string;
  qty: string;
}

export function RecipesScreen() {
  const { tr, locale } = useLocale();
  const ingredients = useIngredients();
  const items = useQuery({
    queryKey: QK.stock('menu-items'),
    queryFn: () => selectRows<MenuItem>('menu_items', 'id, name_en, name_ar, price', { order: 'name_en' }),
  });
  const [itemId, setItemId] = useState('');

  if (ingredients.isPending || items.isPending) return <Loading />;
  const failed = ingredients.error ?? items.error;
  if (failed) return <ErrorState error={failed} onRetry={() => { void ingredients.refetch(); void items.refetch(); }} />;
  if (!items.data || !ingredients.data) return <Loading />;
  const item = items.data.find((i) => i.id === itemId) ?? null;

  return (
    <section>
      <h2>{tr('stock.recipes')}</h2>
      <SelectField
        label={tr('stock.recipe.item')}
        value={itemId}
        onChange={setItemId}
        placeholder={tr('manage.choose')}
        options={items.data.map((i) => ({ value: i.id, label: ingredientName(i, locale) }))}
      />
      {item && <RecipeEditor key={item.id} item={item} ingredients={ingredients.data} />}
    </section>
  );
}

function RecipeEditor({ item, ingredients }: { item: MenuItem; ingredients: NonNullable<ReturnType<typeof useIngredients>['data']> }) {
  const { tr, locale } = useLocale();
  const { busy, run } = useRun(['stock']);
  const saved = useQuery({
    queryKey: QK.stock('recipe', item.id),
    queryFn: async () => {
      const [lines, cost] = await Promise.all([
        selectRows<{ ingredient_id: string; qty: number }>('recipe_lines', 'ingredient_id, qty', { eq: ['menu_item_id', item.id] }),
        selectRows<ItemCost>('v_item_cost', 'cost, margin, has_recipe', { eq: ['menu_item_id', item.id] }),
      ]);
      return { lines, cost: cost[0] ?? null };
    },
  });
  const [drafts, setDrafts] = useState<Draft[]>([]);
  const [loaded, setLoaded] = useState(false);
  useEffect(() => {
    if (saved.data && !loaded) {
      setLoaded(true);
      setDrafts(saved.data.lines.map((l) => ({ ingredientId: l.ingredient_id, qty: String(l.qty) })));
    }
  }, [saved.data, loaded]);

  const costs = useMemo(() => new Map(ingredients.map((i) => [i.id, i.cost_per_unit])), [ingredients]);
  const lines = drafts.map((d) => ({ ingredientId: d.ingredientId, qty: parseQty(d.qty) ?? 0 }));
  const preview = recipePreview(item.price, lines, costs);
  const problem = validateRecipe(lines);
  const complete = drafts.every((d) => d.ingredientId) && problem === null;

  if (saved.isPending) return <Loading />;
  if (saved.error) return <ErrorState error={saved.error} onRetry={() => void saved.refetch()} />;

  async function save() {
    const r = await run(
      () => appRpc('set_recipe', { p_menu_item_id: item.id, p_lines: lines.map((l) => ({ ingredient_id: l.ingredientId, qty: l.qty })) }),
      'stock.recipe.saved',
    );
    if (r.ok) await saved.refetch();
  }

  const patch = (i: number, p: Partial<Draft>) => setDrafts(drafts.map((d, j) => (j === i ? { ...d, ...p } : d)));

  return (
    <div className="manage__form">
      <p>
        {tr('stock.recipe.price')}: <Money amount={item.price} />
      </p>
      {drafts.length === 0 && <p>{tr('stock.recipe.empty')}</p>}
      {drafts.map((d, i) => {
        const ing = ingredients.find((x) => x.id === d.ingredientId);
        return (
          <fieldset key={i}>
            <legend>{tr('stock.lineN', { n: i + 1 })}</legend>
            <SelectField
              label={tr('stock.ingredient')}
              value={d.ingredientId}
              onChange={(v) => patch(i, { ingredientId: v })}
              placeholder={tr('manage.choose')}
              options={ingredients.filter((x) => x.is_active || x.id === d.ingredientId).map((x) => ({ value: x.id, label: `${ingredientName(x, locale)} (${x.unit})` }))}
              error={drafts.some((o, j) => j !== i && o.ingredientId === d.ingredientId && d.ingredientId) ? 'stock.err.duplicate' : null}
            />
            <TextField
              label={tr('stock.qtyUnit', { unit: ing?.unit ?? '' })}
              value={d.qty}
              onChange={(v) => patch(i, { qty: v })}
              hint={tr('stock.qtyHint')}
              error={parseQty(d.qty) === null || parseQty(d.qty) === 0 ? 'stock.err.qty' : null}
            />
            <Button onClick={() => setDrafts(drafts.filter((_, j) => j !== i))}>{tr('stock.removeLine')}</Button>
          </fieldset>
        );
      })}
      <div>
        <Button onClick={() => setDrafts([...drafts, { ingredientId: '', qty: '' }])}>{tr('stock.addLine')}</Button>
      </div>
      <dl className="manage__summary" aria-label={tr('stock.recipe.preview')}>
        <div className="manage__card">
          <dt>{tr('stock.recipe.cost')}</dt>
          <dd className="manage__figure">
            <Money amount={preview.cost} />
          </dd>
        </div>
        <div className="manage__card">
          <dt>{tr('stock.recipe.margin')}</dt>
          <dd className="manage__figure">
            <Money amount={preview.margin} />
            {preview.marginPct !== null && <> ({formatPercent(preview.marginPct, locale)}%)</>}
          </dd>
        </div>
        {saved.data.cost && (
          <div className="manage__card">
            <dt>{tr('stock.recipe.savedCost')}</dt>
            <dd>
              <Money amount={saved.data.cost.cost} /> / <Money amount={saved.data.cost.margin} />
            </dd>
          </div>
        )}
      </dl>
      <div>
        <Button
          variant="primary"
          busy={busy}
          disabled={!complete}
          onClick={() => void save()}
        >
          {tr('common.save')}
        </Button>
      </div>
    </div>
  );
}
