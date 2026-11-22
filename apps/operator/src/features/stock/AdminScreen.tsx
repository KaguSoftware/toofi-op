import { useState } from 'react';
import { Button, DataTable, ErrorState, Icon, Loading, type Column } from '../../components';
import { appRpc } from '../../lib/appRpc';
import { useLocale } from '../../lib/i18n';
import { ActiveToggle, EditDialog, SelectField, TextField } from '../manage/formKit';
import { hasErrors, validateNames } from '../manage/menuLogic';
import { useRun } from '../manage/shared';
import { ingredientName, useIngredients, useSuppliers, type Ingredient, type Supplier } from './stockData';
import { UNITS, formatQty, parseQty, type Unit } from './stockLogic';

export function AdminScreen() {
  const { tr, locale } = useLocale();
  const ingredients = useIngredients();
  const suppliers = useSuppliers();
  const { busy, run } = useRun(['stock']);
  const [ingEdit, setIngEdit] = useState<Ingredient | 'new' | null>(null);
  const [supEdit, setSupEdit] = useState<Supplier | 'new' | null>(null);

  if (ingredients.isPending || suppliers.isPending) return <Loading />;
  const failed = ingredients.error ?? suppliers.error;
  if (failed) return <ErrorState error={failed} onRetry={() => { void ingredients.refetch(); void suppliers.refetch(); }} />;

  const ingCols: Column<Ingredient>[] = [
    { key: 'name', header: tr('stock.ingredient'), cell: (i) => ingredientName(i, locale) },
    { key: 'unit', header: tr('stock.unit'), cell: (i) => i.unit },
    { key: 'reorder', header: tr('stock.reorderPoint'), align: 'end', cell: (i) => formatQty(i.reorder_point, i.unit, locale) },
    { key: 'cost', header: tr('stock.costPerUnit'), align: 'end', cell: (i) => <bdi>{i.cost_per_unit}</bdi> },
    { key: 'active', header: tr('manage.menu.status'), cell: (i) => tr(i.is_active ? 'manage.active' : 'manage.inactive') },
    {
      key: 'actions',
      header: tr('manage.actions'),
      cell: (i) => (
        <span className="manage__row">
          <Button onClick={() => setIngEdit(i)}>{tr('manage.edit')}</Button>
          <ActiveToggle active={i.is_active} busy={busy} onToggle={() => void run(() => appRpc('set_ingredient_active', { p_id: i.id, p_active: !i.is_active }))} />
        </span>
      ),
    },
  ];
  const supCols: Column<Supplier>[] = [
    { key: 'name', header: tr('manage.menu.name'), cell: (s) => s.name },
    { key: 'phone', header: tr('stock.phone'), cell: (s) => (s.phone ? <bdi>{s.phone}</bdi> : '') },
    { key: 'actions', header: tr('manage.actions'), cell: (s) => <Button onClick={() => setSupEdit(s)}>{tr('manage.edit')}</Button> },
  ];

  return (
    <section>
      <header className="manage__section-head">
        <h2>{tr('stock.ingredients')}</h2>
        <Button variant="primary" onClick={() => setIngEdit('new')}>
          <Icon name="plus" size={20} />
          {tr('stock.addIngredient')}
        </Button>
      </header>
      <DataTable columns={ingCols} rows={ingredients.data} rowKey={(i) => i.id} caption={tr('stock.ingredients')} emptyMessage={tr('stock.noIngredients')} />

      <header className="manage__section-head">
        <h2>{tr('stock.suppliers')}</h2>
        <Button onClick={() => setSupEdit('new')}>
          <Icon name="plus" size={20} />
          {tr('stock.addSupplier')}
        </Button>
      </header>
      <DataTable columns={supCols} rows={suppliers.data} rowKey={(s) => s.id} caption={tr('stock.suppliers')} emptyMessage={tr('stock.noSuppliers')} />

      {ingEdit && <IngredientDialog ing={ingEdit === 'new' ? null : ingEdit} onClose={() => setIngEdit(null)} />}
      {supEdit && <SupplierDialog sup={supEdit === 'new' ? null : supEdit} onClose={() => setSupEdit(null)} />}
    </section>
  );
}

function IngredientDialog({ ing, onClose }: { ing: Ingredient | null; onClose: () => void }) {
  const { tr } = useLocale();
  const { busy, run } = useRun(['stock']);
  const [nameEn, setEn] = useState(ing?.name_en ?? '');
  const [nameAr, setAr] = useState(ing?.name_ar ?? '');
  const [unit, setUnit] = useState<Unit>(ing?.unit ?? 'g');
  const [reorder, setReorder] = useState(String(ing?.reorder_point ?? 0));
  const [cost, setCost] = useState(String(ing?.cost_per_unit ?? 0));
  const [tried, setTried] = useState(false);
  const errors = validateNames({ nameEn, nameAr });
  const reorderN = parseQty(reorder);
  const costN = /^\d+(\.\d{1,4})?$/.test(cost.trim()) ? Number(cost) : null;
  async function save() {
    setTried(true);
    if (hasErrors(errors) || reorderN === null || costN === null) return;
    const r = await run(
      () =>
        appRpc('upsert_ingredient', {
          p_id: ing?.id ?? null,
          p_name_en: nameEn.trim(),
          p_name_ar: nameAr.trim(),
          p_unit: unit,
          p_reorder_point: reorderN,
          p_cost_per_unit: costN,
        }),
      'manage.saved',
    );
    if (r.ok) onClose();
  }
  return (
    <EditDialog open title={tr(ing ? 'stock.editIngredient' : 'stock.addIngredient')} onClose={onClose} onSave={() => void save()} busy={busy}>
      <TextField label={tr('manage.nameEn')} value={nameEn} onChange={setEn} error={tried ? errors.nameEn : null} dir="ltr" />
      <TextField label={tr('manage.nameAr')} value={nameAr} onChange={setAr} error={tried ? errors.nameAr : null} dir="rtl" />
      <SelectField label={tr('stock.unit')} value={unit} onChange={(v) => setUnit(v as Unit)} options={UNITS.map((u) => ({ value: u, label: u }))} />
      {ing && <p className="rop-field__hint">{tr('stock.unitLockedHint')}</p>}
      <TextField label={tr('stock.reorderPoint')} value={reorder} onChange={setReorder} hint={tr('stock.qtyHint')} error={tried && reorderN === null ? 'stock.err.qty' : null} />
      <TextField label={tr('stock.costPerUnit')} value={cost} onChange={setCost} hint={tr('stock.costHint')} error={tried && costN === null ? 'stock.err.cost' : null} />
    </EditDialog>
  );
}

function SupplierDialog({ sup, onClose }: { sup: Supplier | null; onClose: () => void }) {
  const { tr } = useLocale();
  const { busy, run } = useRun(['stock']);
  const [name, setName] = useState(sup?.name ?? '');
  const [phone, setPhone] = useState(sup?.phone ?? '');
  const [tried, setTried] = useState(false);
  async function save() {
    setTried(true);
    if (!name.trim()) return;
    const r = await run(() => appRpc('upsert_supplier', { p_id: sup?.id ?? null, p_name: name.trim(), p_phone: phone.trim() || null }), 'manage.saved');
    if (r.ok) onClose();
  }
  return (
    <EditDialog open title={tr(sup ? 'stock.editSupplier' : 'stock.addSupplier')} onClose={onClose} onSave={() => void save()} busy={busy}>
      <TextField label={tr('manage.menu.name')} value={name} onChange={setName} error={tried && !name.trim() ? 'manage.err.nameRequired' : null} />
      <TextField label={tr('stock.phone')} type="tel" dir="ltr" value={phone} onChange={setPhone} />
    </EditDialog>
  );
}
