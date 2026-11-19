import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Button, DataTable, ErrorState, Loading, Money, type Column } from '../../components';
import { appRpc } from '../../lib/appRpc';
import { useLocale } from '../../lib/i18n';
import { QK } from '../../lib/queryKeys';
import { ActiveToggle, EditDialog, NumberField, ReorderButtons, SelectField, TextField } from './formKit';
import { hasErrors, moveId, parseIntStrict, validateItem, validateNames } from './menuLogic';
import { ModifiersPanel, TaxPanel } from './ModifiersPanel';
import { selectRows, useRun } from './shared';
import type { Cat, Group, Item, Link, Mod, Tax } from './menuTypes';
import './manage.css';

async function fetchMenu() {
  const [cats, items, taxes, groups, mods, links] = await Promise.all([
    selectRows<Cat>('menu_categories', 'id, name_en, name_ar, sort, is_active', { order: 'sort' }),
    selectRows<Item>('menu_items', 'id, category_id, name_en, name_ar, price, tax_group_id, is_active, sort', { order: 'sort' }),
    selectRows<Tax>('tax_groups', 'id, name, rate_bps', { order: 'name' }),
    selectRows<Group>('modifier_groups', 'id, name_en, name_ar, min_select, max_select', { order: 'name_en' }),
    selectRows<Mod>('modifiers', 'id, group_id, name_en, name_ar, price_delta, is_active', { order: 'name_en' }),
    selectRows<Link>('menu_item_modifier_groups', 'menu_item_id, group_id'),
  ]);
  return { cats, items, taxes, groups, mods, links };
}
export type MenuData = Awaited<ReturnType<typeof fetchMenu>>;

type Tab = 'items' | 'modifiers' | 'tax';

export function MenuScreen() {
  const { tr } = useLocale();
  const q = useQuery({ queryKey: QK.manage('menu'), queryFn: fetchMenu });
  const [tab, setTab] = useState<Tab>('items');
  if (q.isPending) return <Loading />;
  if (q.error) return <ErrorState error={q.error} onRetry={() => void q.refetch()} />;
  const data = q.data;
  return (
    <section className="manage">
      <h1>{tr('manage.menuTitle')}</h1>
      <div className="manage__tabs" role="group" aria-label={tr('manage.menu.sections')}>
        {(['items', 'modifiers', 'tax'] as const).map((t) => (
          <Button key={t} variant={tab === t ? 'primary' : 'secondary'} aria-pressed={tab === t} onClick={() => setTab(t)}>
            {tr(t === 'items' ? 'manage.menu.tabItems' : t === 'modifiers' ? 'manage.menu.tabModifiers' : 'manage.menu.tabTax')}
          </Button>
        ))}
      </div>
      {tab === 'items' && (
        <>
          <CategoriesPanel data={data} />
          <ItemsPanel data={data} />
        </>
      )}
      {tab === 'modifiers' && <ModifiersPanel data={data} />}
      {tab === 'tax' && <TaxPanel data={data} />}
    </section>
  );
}

function CategoriesPanel({ data }: { data: MenuData }) {
  const { tr, locale } = useLocale();
  const { busy, run } = useRun(['manage']);
  const [editing, setEditing] = useState<Cat | 'new' | null>(null);
  const cats = [...data.cats].sort((a, b) => a.sort - b.sort);
  const ids = cats.map((c) => c.id);

  const cols: Column<Cat>[] = [
    { key: 'name', header: tr('manage.menu.name'), cell: (c) => (locale === 'ar' ? c.name_ar : c.name_en) },
    { key: 'active', header: tr('manage.menu.status'), cell: (c) => tr(c.is_active ? 'manage.active' : 'manage.inactive') },
    {
      key: 'order',
      header: tr('manage.menu.order'),
      cell: (c) => (
        <ReorderButtons
          index={ids.indexOf(c.id)}
          count={ids.length}
          disabled={busy}
          onMove={(d) => void run(() => appRpc('reorder_menu', { p_kind: 'category', p_ids: moveId(ids, ids.indexOf(c.id), d) }))}
        />
      ),
    },
    {
      key: 'actions',
      header: tr('manage.actions'),
      cell: (c) => (
        <span className="manage__row">
          <Button onClick={() => setEditing(c)}>{tr('manage.edit')}</Button>
          <ActiveToggle
            active={c.is_active}
            busy={busy}
            onToggle={() => void run(() => appRpc('set_menu_category_active', { p_id: c.id, p_active: !c.is_active }))}
          />
        </span>
      ),
    },
  ];

  return (
    <section>
      <header className="manage__section-head">
        <h2>{tr('manage.menu.categories')}</h2>
        <Button variant="primary" onClick={() => setEditing('new')}>
          {tr('manage.menu.addCategory')}
        </Button>
      </header>
      <DataTable columns={cols} rows={cats} rowKey={(c) => c.id} caption={tr('manage.menu.categories')} emptyMessage={tr('manage.menu.noCategories')} />
      {editing && (
        <CategoryDialog
          cat={editing === 'new' ? null : editing}
          nextSort={cats.length + 1}
          onClose={() => setEditing(null)}
        />
      )}
    </section>
  );
}

function CategoryDialog({ cat, nextSort, onClose }: { cat: Cat | null; nextSort: number; onClose: () => void }) {
  const { tr } = useLocale();
  const { busy, run } = useRun(['manage']);
  const [nameEn, setEn] = useState(cat?.name_en ?? '');
  const [nameAr, setAr] = useState(cat?.name_ar ?? '');
  const [tried, setTried] = useState(false);
  const errors = validateNames({ nameEn, nameAr });
  async function save() {
    setTried(true);
    if (hasErrors(errors)) return;
    const r = await run(
      () => appRpc('upsert_menu_category', { p_id: cat?.id ?? null, p_name_en: nameEn.trim(), p_name_ar: nameAr.trim(), p_sort: cat?.sort ?? nextSort }),
      'manage.saved',
    );
    if (r.ok) onClose();
  }
  return (
    <EditDialog open title={tr(cat ? 'manage.menu.editCategory' : 'manage.menu.addCategory')} onClose={onClose} onSave={() => void save()} busy={busy}>
      <TextField label={tr('manage.nameEn')} value={nameEn} onChange={setEn} error={tried ? errors.nameEn : null} dir="ltr" />
      <TextField label={tr('manage.nameAr')} value={nameAr} onChange={setAr} error={tried ? errors.nameAr : null} dir="rtl" />
    </EditDialog>
  );
}

function ItemsPanel({ data }: { data: MenuData }) {
  const { tr, locale } = useLocale();
  const { busy, run } = useRun(['manage']);
  const [catId, setCatId] = useState('');
  const [editing, setEditing] = useState<Item | 'new' | null>(null);
  const nameOf = (r: { name_en: string; name_ar: string }) => (locale === 'ar' ? r.name_ar : r.name_en);
  const catName = new Map(data.cats.map((c) => [c.id, nameOf(c)]));
  const items = data.items.filter((i) => !catId || i.category_id === catId).sort((a, b) => a.sort - b.sort);
  const ids = items.map((i) => i.id);

  const cols: Column<Item>[] = [
    { key: 'name', header: tr('manage.menu.name'), cell: (i) => nameOf(i) },
    { key: 'cat', header: tr('manage.menu.category'), cell: (i) => catName.get(i.category_id) ?? '' },
    { key: 'price', header: tr('manage.menu.price'), align: 'end', cell: (i) => <Money amount={i.price} /> },
    { key: 'active', header: tr('manage.menu.status'), cell: (i) => tr(i.is_active ? 'manage.active' : 'manage.inactive') },
    {
      key: 'order',
      header: tr('manage.menu.order'),
      cell: (i) => (
        <ReorderButtons
          index={ids.indexOf(i.id)}
          count={ids.length}
          disabled={busy || !catId}
          onMove={(d) => void run(() => appRpc('reorder_menu', { p_kind: 'item', p_ids: moveId(ids, ids.indexOf(i.id), d) }))}
        />
      ),
    },
    {
      key: 'actions',
      header: tr('manage.actions'),
      cell: (i) => (
        <span className="manage__row">
          <Button onClick={() => setEditing(i)}>{tr('manage.edit')}</Button>
          <ActiveToggle
            active={i.is_active}
            busy={busy}
            onToggle={() => void run(() => appRpc('set_menu_item_active', { p_id: i.id, p_active: !i.is_active }))}
          />
        </span>
      ),
    },
  ];

  return (
    <section>
      <header className="manage__section-head">
        <h2>{tr('manage.menu.items')}</h2>
        <Button variant="primary" disabled={data.cats.length === 0 || data.taxes.length === 0} onClick={() => setEditing('new')}>
          {tr('manage.menu.addItem')}
        </Button>
      </header>
      {(data.cats.length === 0 || data.taxes.length === 0) && <p>{tr('manage.menu.needCategoryAndTax')}</p>}
      <SelectField
        label={tr('manage.menu.filterCategory')}
        value={catId}
        onChange={setCatId}
        placeholder={tr('manage.menu.allCategories')}
        options={data.cats.map((c) => ({ value: c.id, label: nameOf(c) }))}
      />
      {!catId && items.length > 1 && <p className="rop-field__hint">{tr('manage.menu.reorderHint')}</p>}
      <DataTable columns={cols} rows={items} rowKey={(i) => i.id} caption={tr('manage.menu.items')} emptyMessage={tr('manage.menu.noItems')} />
      {editing && <ItemDialog item={editing === 'new' ? null : editing} data={data} defaultCat={catId} onClose={() => setEditing(null)} />}
    </section>
  );
}

function ItemDialog({ item, data, defaultCat, onClose }: { item: Item | null; data: MenuData; defaultCat: string; onClose: () => void }) {
  const { tr, locale } = useLocale();
  const { busy, run } = useRun(['manage']);
  const [nameEn, setEn] = useState(item?.name_en ?? '');
  const [nameAr, setAr] = useState(item?.name_ar ?? '');
  const [price, setPrice] = useState(item ? String(item.price) : '');
  const [categoryId, setCat] = useState(item?.category_id ?? defaultCat);
  const [taxGroupId, setTax] = useState(item?.tax_group_id ?? (data.taxes.length === 1 ? (data.taxes[0]?.id ?? '') : ''));
  const [sort, setSort] = useState(String(item?.sort ?? data.items.length + 1));
  const [groupIds, setGroupIds] = useState<string[]>(item ? data.links.filter((l) => l.menu_item_id === item.id).map((l) => l.group_id) : []);
  const [tried, setTried] = useState(false);

  const form = { nameEn, nameAr, price: parseIntStrict(price), categoryId, taxGroupId, sort: parseIntStrict(sort) };
  const errors = validateItem(form);
  const nameOf = (r: { name_en: string; name_ar: string }) => (locale === 'ar' ? r.name_ar : r.name_en);

  async function save() {
    setTried(true);
    if (hasErrors(errors)) return;
    const r = await run(async () => {
      const id = await appRpc<string>('upsert_menu_item', {
        p_id: item?.id ?? null,
        p_category_id: categoryId,
        p_name_en: nameEn.trim(),
        p_name_ar: nameAr.trim(),
        p_price: form.price,
        p_tax_group_id: taxGroupId,
        p_sort: form.sort,
      });
      await appRpc('set_item_modifier_groups', { p_menu_item_id: id, p_group_ids: groupIds });
      return id;
    }, 'manage.saved');
    if (r.ok) onClose();
  }

  return (
    <EditDialog open title={tr(item ? 'manage.menu.editItem' : 'manage.menu.addItem')} onClose={onClose} onSave={() => void save()} busy={busy}>
      <TextField label={tr('manage.nameEn')} value={nameEn} onChange={setEn} error={tried ? errors.nameEn : null} dir="ltr" />
      <TextField label={tr('manage.nameAr')} value={nameAr} onChange={setAr} error={tried ? errors.nameAr : null} dir="rtl" />
      <NumberField label={tr('manage.menu.priceIqd')} value={price} onChange={setPrice} error={tried ? errors.price : null} hint={tr('manage.menu.priceHint')} step="1" />
      <SelectField
        label={tr('manage.menu.category')}
        value={categoryId}
        onChange={setCat}
        placeholder={tr('manage.choose')}
        options={data.cats.map((c) => ({ value: c.id, label: nameOf(c) }))}
        error={tried ? errors.categoryId : null}
      />
      <SelectField
        label={tr('manage.menu.taxGroup')}
        value={taxGroupId}
        onChange={setTax}
        placeholder={tr('manage.choose')}
        options={data.taxes.map((t) => ({ value: t.id, label: t.name }))}
        error={tried ? errors.taxGroupId : null}
      />
      <NumberField label={tr('manage.menu.sort')} value={sort} onChange={setSort} error={tried ? errors.sort : null} step="1" />
      {data.groups.length > 0 && (
        <fieldset>
          <legend>{tr('manage.menu.attachedGroups')}</legend>
          {data.groups.map((g) => (
            <label key={g.id} className="manage__row">
              <input
                type="checkbox"
                checked={groupIds.includes(g.id)}
                onChange={(e) => setGroupIds(e.target.checked ? [...groupIds, g.id] : groupIds.filter((x) => x !== g.id))}
              />
              {nameOf(g)} ({g.min_select}–{g.max_select})
            </label>
          ))}
        </fieldset>
      )}
    </EditDialog>
  );
}

