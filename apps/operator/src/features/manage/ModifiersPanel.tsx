import { useState } from 'react';
import { formatNumber } from '@rop/i18n';
import { Button, DataTable, Icon, Money, type Column } from '../../components';
import { appRpc } from '../../lib/appRpc';
import { useLocale } from '../../lib/i18n';
import { ActiveToggle, EditDialog, NumberField, TextField } from './formKit';
import { bpsToPercent, hasErrors, parseIntStrict, validateGroup, validateNames, validateTaxGroup } from './menuLogic';
import type { Group, Mod, Tax } from './menuTypes';
import type { MenuData } from './MenuScreen';
import { useRun } from './shared';

export function ModifiersPanel({ data }: { data: MenuData }) {
  const { tr, locale } = useLocale();
  const { busy, run } = useRun(['manage']);
  const [groupEdit, setGroupEdit] = useState<Group | 'new' | null>(null);
  const [modEdit, setModEdit] = useState<{ mod: Mod | null; group: Group } | null>(null);
  const nameOf = (r: { name_en: string; name_ar: string }) => (locale === 'ar' ? r.name_ar : r.name_en);

  const groupCols: Column<Group>[] = [
    { key: 'name', header: tr('manage.menu.name'), cell: (g) => nameOf(g) },
    { key: 'min', header: tr('manage.menu.min'), align: 'end', cell: (g) => formatNumber(g.min_select, locale) },
    { key: 'max', header: tr('manage.menu.max'), align: 'end', cell: (g) => formatNumber(g.max_select, locale) },
    {
      key: 'actions',
      header: tr('manage.actions'),
      cell: (g) => (
        <span className="manage__row">
          <Button onClick={() => setGroupEdit(g)}>{tr('manage.edit')}</Button>
          <Button onClick={() => setModEdit({ mod: null, group: g })}>{tr('manage.menu.addModifier')}</Button>
        </span>
      ),
    },
  ];

  return (
    <section>
      <header className="manage__section-head">
        <h2>{tr('manage.menu.modifierGroups')}</h2>
        <Button variant="primary" onClick={() => setGroupEdit('new')}>
          <Icon name="plus" size={20} />
          {tr('manage.menu.addGroup')}
        </Button>
      </header>
      <DataTable columns={groupCols} rows={data.groups} rowKey={(g) => g.id} caption={tr('manage.menu.modifierGroups')} emptyMessage={tr('manage.menu.noGroups')} />

      {data.groups.map((g) => {
        const mods = data.mods.filter((m) => m.group_id === g.id);
        const cols: Column<Mod>[] = [
          { key: 'name', header: tr('manage.menu.name'), cell: (m) => nameOf(m) },
          { key: 'delta', header: tr('manage.menu.priceDelta'), align: 'end', cell: (m) => <Money amount={m.price_delta} /> },
          { key: 'active', header: tr('manage.menu.status'), cell: (m) => tr(m.is_active ? 'manage.active' : 'manage.inactive') },
          {
            key: 'actions',
            header: tr('manage.actions'),
            cell: (m) => (
              <span className="manage__row">
                <Button onClick={() => setModEdit({ mod: m, group: g })}>{tr('manage.edit')}</Button>
                <ActiveToggle
                  active={m.is_active}
                  busy={busy}
                  onToggle={() => void run(() => appRpc('set_modifier_active', { p_id: m.id, p_active: !m.is_active }))}
                />
              </span>
            ),
          },
        ];
        return (
          <section key={g.id}>
            <h3>{nameOf(g)}</h3>
            <DataTable columns={cols} rows={mods} rowKey={(m) => m.id} caption={nameOf(g)} emptyMessage={tr('manage.menu.noModifiers')} />
          </section>
        );
      })}

      {groupEdit && <GroupDialog group={groupEdit === 'new' ? null : groupEdit} onClose={() => setGroupEdit(null)} />}
      {modEdit && <ModifierDialog mod={modEdit.mod} group={modEdit.group} onClose={() => setModEdit(null)} />}
    </section>
  );
}

function GroupDialog({ group, onClose }: { group: Group | null; onClose: () => void }) {
  const { tr } = useLocale();
  const { busy, run } = useRun(['manage']);
  const [nameEn, setEn] = useState(group?.name_en ?? '');
  const [nameAr, setAr] = useState(group?.name_ar ?? '');
  const [min, setMin] = useState(String(group?.min_select ?? 0));
  const [max, setMax] = useState(String(group?.max_select ?? 1));
  const errors = validateGroup({ nameEn, nameAr, minSelect: parseIntStrict(min), maxSelect: parseIntStrict(max) });
  const [tried, setTried] = useState(false);
  async function save() {
    setTried(true);
    if (hasErrors(errors)) return;
    const r = await run(
      () =>
        appRpc('upsert_modifier_group', {
          p_id: group?.id ?? null,
          p_name_en: nameEn.trim(),
          p_name_ar: nameAr.trim(),
          p_min_select: parseIntStrict(min),
          p_max_select: parseIntStrict(max),
        }),
      'manage.saved',
    );
    if (r.ok) onClose();
  }
  return (
    <EditDialog open title={tr(group ? 'manage.menu.editGroup' : 'manage.menu.addGroup')} onClose={onClose} onSave={() => void save()} busy={busy}>
      <TextField label={tr('manage.nameEn')} value={nameEn} onChange={setEn} error={tried ? errors.nameEn : null} dir="ltr" />
      <TextField label={tr('manage.nameAr')} value={nameAr} onChange={setAr} error={tried ? errors.nameAr : null} dir="rtl" />
      {/* min/max errors show as you type: they depend on each other */}
      <NumberField label={tr('manage.menu.minSelect')} value={min} onChange={setMin} error={errors.minSelect} step="1" />
      <NumberField label={tr('manage.menu.maxSelect')} value={max} onChange={setMax} error={errors.maxSelect} step="1" />
    </EditDialog>
  );
}

function ModifierDialog({ mod, group, onClose }: { mod: Mod | null; group: Group; onClose: () => void }) {
  const { tr } = useLocale();
  const { busy, run } = useRun(['manage']);
  const [nameEn, setEn] = useState(mod?.name_en ?? '');
  const [nameAr, setAr] = useState(mod?.name_ar ?? '');
  const [delta, setDelta] = useState(String(mod?.price_delta ?? 0));
  const [tried, setTried] = useState(false);
  const errors = validateNames({ nameEn, nameAr });
  const deltaNum = parseIntStrict(delta);
  const deltaError = Number.isNaN(deltaNum) ? 'manage.err.priceInvalid' : null;
  async function save() {
    setTried(true);
    if (hasErrors(errors) || deltaError) return;
    const r = await run(
      () => appRpc('upsert_modifier', { p_id: mod?.id ?? null, p_group_id: group.id, p_name_en: nameEn.trim(), p_name_ar: nameAr.trim(), p_price_delta: deltaNum }),
      'manage.saved',
    );
    if (r.ok) onClose();
  }
  return (
    <EditDialog open title={tr(mod ? 'manage.menu.editModifier' : 'manage.menu.addModifier')} onClose={onClose} onSave={() => void save()} busy={busy}>
      <TextField label={tr('manage.nameEn')} value={nameEn} onChange={setEn} error={tried ? errors.nameEn : null} dir="ltr" />
      <TextField label={tr('manage.nameAr')} value={nameAr} onChange={setAr} error={tried ? errors.nameAr : null} dir="rtl" />
      <NumberField label={tr('manage.menu.priceDelta')} value={delta} onChange={setDelta} error={tried ? deltaError : null} hint={tr('manage.menu.deltaHint')} step="1" />
    </EditDialog>
  );
}

export function TaxPanel({ data }: { data: MenuData }) {
  const { tr } = useLocale();
  const [editing, setEditing] = useState<Tax | 'new' | null>(null);
  const cols: Column<Tax>[] = [
    { key: 'name', header: tr('manage.menu.name'), cell: (t) => t.name },
    { key: 'rate', header: tr('manage.menu.rate'), align: 'end', cell: (t) => `${bpsToPercent(t.rate_bps)}%` },
    { key: 'actions', header: tr('manage.actions'), cell: (t) => <Button onClick={() => setEditing(t)}>{tr('manage.edit')}</Button> },
  ];
  return (
    <section>
      <header className="manage__section-head">
        <h2>{tr('manage.menu.taxGroups')}</h2>
        <Button variant="primary" onClick={() => setEditing('new')}>
          <Icon name="plus" size={20} />
          {tr('manage.menu.addTax')}
        </Button>
      </header>
      <p className="rop-field__hint">{tr('manage.menu.taxHint')}</p>
      <DataTable columns={cols} rows={data.taxes} rowKey={(t) => t.id} caption={tr('manage.menu.taxGroups')} emptyMessage={tr('manage.menu.noTax')} />
      {editing && <TaxDialog tax={editing === 'new' ? null : editing} onClose={() => setEditing(null)} />}
    </section>
  );
}

function TaxDialog({ tax, onClose }: { tax: Tax | null; onClose: () => void }) {
  const { tr } = useLocale();
  const { busy, run } = useRun(['manage']);
  const [name, setName] = useState(tax?.name ?? '');
  const [bps, setBps] = useState(String(tax?.rate_bps ?? 0));
  const [tried, setTried] = useState(false);
  const errors = validateTaxGroup(name, parseIntStrict(bps));
  async function save() {
    setTried(true);
    if (hasErrors(errors)) return;
    const r = await run(() => appRpc('upsert_tax_group', { p_id: tax?.id ?? null, p_name: name.trim(), p_rate_bps: parseIntStrict(bps) }), 'manage.saved');
    if (r.ok) onClose();
  }
  return (
    <EditDialog open title={tr(tax ? 'manage.menu.editTax' : 'manage.menu.addTax')} onClose={onClose} onSave={() => void save()} busy={busy}>
      <TextField label={tr('manage.menu.name')} value={name} onChange={setName} error={tried ? errors.name : null} />
      <NumberField label={tr('manage.menu.rateBps')} value={bps} onChange={setBps} error={tried ? errors.rate : null} hint={tr('manage.menu.rateHint')} step="1" />
    </EditDialog>
  );
}
