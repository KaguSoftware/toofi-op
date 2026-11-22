import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Link } from '@tanstack/react-router';
import { Button, DataTable, ErrorState, Icon, Loading, PageHeader, type Column } from '../../components';
import { appRpc } from '../../lib/appRpc';
import { errorMessage } from '../../lib/errors';
import { useLocale } from '../../lib/i18n';
import { QK } from '../../lib/queryKeys';
import { ActiveToggle, EditDialog, NumberField, ReorderButtons, SelectField, TextField } from './formKit';
import { hasErrors, moveId, parseIntStrict, validateNames, validateTable } from './menuLogic';
import { errorCodeOf, selectRows, useRun } from './shared';
import './manage.css';

interface Area {
  id: string;
  name_en: string;
  name_ar: string;
  sort: number;
}
interface Table {
  id: string;
  area_id: string;
  label: string;
  seats: number;
  grid_x: number;
  grid_y: number;
  is_active: boolean;
}

async function fetchPlan() {
  const [areas, tables] = await Promise.all([
    selectRows<Area>('floor_areas', 'id, name_en, name_ar, sort', { order: 'sort' }),
    selectRows<Table>('dining_tables', 'id, area_id, label, seats, grid_x, grid_y, is_active', { order: 'label' }),
  ]);
  return { areas, tables };
}

export function FloorPlanScreen() {
  const { tr, locale } = useLocale();
  const q = useQuery({ queryKey: QK.manage('floorplan'), queryFn: fetchPlan });
  const { busy, run } = useRun(['manage', 'floor']);
  const [areaEdit, setAreaEdit] = useState<Area | 'new' | null>(null);
  const [tableEdit, setTableEdit] = useState<Table | 'new' | null>(null);
  const [blocked, setBlocked] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  if (q.isPending) return <Loading />;
  if (q.error) return <ErrorState error={q.error} onRetry={() => void q.refetch()} />;
  const { areas, tables } = q.data;
  const sorted = [...areas].sort((a, b) => a.sort - b.sort);
  const ids = sorted.map((a) => a.id);
  const areaName = (a: { name_en: string; name_ar: string }) => (locale === 'ar' ? a.name_ar : a.name_en);
  const areaOf = new Map(areas.map((a) => [a.id, areaName(a)]));

  async function toggle(t: Table) {
    setBlocked(null);
    setError(null);
    const r = await run(() => appRpc('set_dining_table_active', { p_id: t.id, p_active: !t.is_active }), undefined, { quiet: true });
    if (r.ok) return;
    if (errorCodeOf(r.error) === 'TABLE_HAS_OPEN_TAB') setBlocked(t.label);
    else setError(errorMessage(r.error, locale));
  }

  const areaCols: Column<Area>[] = [
    { key: 'name', header: tr('manage.menu.name'), cell: (a) => areaName(a) },
    {
      key: 'order',
      header: tr('manage.menu.order'),
      cell: (a) => (
        <ReorderButtons
          index={ids.indexOf(a.id)}
          count={ids.length}
          disabled={busy}
          onMove={(d) => void run(() => appRpc('reorder_menu', { p_kind: 'area', p_ids: moveId(ids, ids.indexOf(a.id), d) }))}
        />
      ),
    },
    { key: 'actions', header: tr('manage.actions'), cell: (a) => <Button onClick={() => setAreaEdit(a)}>{tr('manage.edit')}</Button> },
  ];
  const tableCols: Column<Table>[] = [
    { key: 'label', header: tr('manage.floor.label'), cell: (t) => t.label },
    { key: 'area', header: tr('manage.floor.area'), cell: (t) => areaOf.get(t.area_id) ?? '' },
    { key: 'seats', header: tr('manage.floor.seats'), align: 'end', cell: (t) => t.seats },
    { key: 'pos', header: tr('manage.floor.position'), cell: (t) => <bdi>{`${t.grid_x}, ${t.grid_y}`}</bdi> },
    { key: 'active', header: tr('manage.menu.status'), cell: (t) => tr(t.is_active ? 'manage.active' : 'manage.inactive') },
    {
      key: 'actions',
      header: tr('manage.actions'),
      cell: (t) => (
        <span className="manage__row">
          <Button onClick={() => setTableEdit(t)}>{tr('manage.edit')}</Button>
          <ActiveToggle active={t.is_active} busy={busy} onToggle={() => void toggle(t)} />
        </span>
      ),
    },
  ];

  return (
    <section className="manage manage--setup">
      <PageHeader
        title={tr('manage.floorTitle')} icon="floorPlan" tone="accent"
        actions={
          <>
            <Button onClick={() => setAreaEdit('new')}>
              <Icon name="plus" size={20} />
              {tr('manage.floor.addArea')}
            </Button>
            <Button variant="primary" disabled={areas.length === 0} onClick={() => setTableEdit('new')}>
              <Icon name="plus" size={20} />
              {tr('manage.floor.addTable')}
            </Button>
          </>
        }
      />

      {blocked && (
        <div role="alert" className="manage__notice">
          <h2>{tr('manage.floor.hasTabTitle', { label: blocked })}</h2>
          <p>{tr('manage.floor.hasTabBody')}</p>
          <Link to="/floor">{tr('manage.day.goToFloor')}</Link>
        </div>
      )}
      {error && (
        <p role="alert" className="rop-field__error">
          {error}
        </p>
      )}

      <div className="manage__canvases">
        {sorted.map((a) => (
          <PreviewGrid key={a.id} title={areaName(a)} tables={tables.filter((t) => t.area_id === a.id)} onEdit={(t) => setTableEdit(t)} />
        ))}
      </div>

      <header className="manage__section-head">
        <h2>{tr('manage.floor.areas')}</h2>
      </header>
      <DataTable columns={areaCols} rows={sorted} rowKey={(a) => a.id} caption={tr('manage.floor.areas')} emptyMessage={tr('manage.floor.noAreas')} />

      <header className="manage__section-head">
        <h2>{tr('manage.floor.tables')}</h2>
      </header>
      <DataTable columns={tableCols} rows={tables} rowKey={(t) => t.id} caption={tr('manage.floor.tables')} emptyMessage={tr('manage.floor.noTables')} />

      {areaEdit && <AreaDialog area={areaEdit === 'new' ? null : areaEdit} nextSort={areas.length + 1} onClose={() => setAreaEdit(null)} />}
      {tableEdit && (
        <TableDialog table={tableEdit === 'new' ? null : tableEdit} areas={sorted} onClose={() => setTableEdit(null)} nameOf={areaName} />
      )}
    </section>
  );
}

/** The area as the floor shows it; tapping a table opens it for editing. */
function PreviewGrid({ title, tables, onEdit }: { title: string; tables: Table[]; onEdit: (t: Table) => void }) {
  const { tr } = useLocale();
  if (tables.length === 0) return null;
  const cols = Math.max(...tables.map((t) => t.grid_x)) + 1;
  return (
    <section className="manage__canvas" aria-label={tr('manage.floor.preview', { area: title })}>
      <h2>{title}</h2>
      <div className="manage__grid rop-cascade" style={{ gridTemplateColumns: `repeat(${cols}, minmax(5.5rem, 1fr))` }}>
        {tables.map((t) => (
          <button
            key={t.id}
            type="button"
            className="manage__grid-cell"
            data-inactive={!t.is_active}
            style={{ gridColumn: t.grid_x + 1, gridRow: t.grid_y + 1 }}
            title={tr('manage.floor.editTable')}
            onClick={() => onEdit(t)}
          >
            <strong>{t.label}</strong>
            <span>
              <Icon name="person" size={14} />
              {t.seats}
            </span>
          </button>
        ))}
      </div>
    </section>
  );
}

function AreaDialog({ area, nextSort, onClose }: { area: Area | null; nextSort: number; onClose: () => void }) {
  const { tr } = useLocale();
  const { busy, run } = useRun(['manage', 'floor']);
  const [nameEn, setEn] = useState(area?.name_en ?? '');
  const [nameAr, setAr] = useState(area?.name_ar ?? '');
  const [tried, setTried] = useState(false);
  const errors = validateNames({ nameEn, nameAr });
  async function save() {
    setTried(true);
    if (hasErrors(errors)) return;
    const r = await run(
      () => appRpc('upsert_floor_area', { p_id: area?.id ?? null, p_name_en: nameEn.trim(), p_name_ar: nameAr.trim(), p_sort: area?.sort ?? nextSort }),
      'manage.saved',
    );
    if (r.ok) onClose();
  }
  return (
    <EditDialog open title={tr(area ? 'manage.floor.editArea' : 'manage.floor.addArea')} onClose={onClose} onSave={() => void save()} busy={busy}>
      <TextField label={tr('manage.nameEn')} value={nameEn} onChange={setEn} error={tried ? errors.nameEn : null} dir="ltr" />
      <TextField label={tr('manage.nameAr')} value={nameAr} onChange={setAr} error={tried ? errors.nameAr : null} dir="rtl" />
    </EditDialog>
  );
}

function TableDialog({
  table,
  areas,
  onClose,
  nameOf,
}: {
  table: Table | null;
  areas: Area[];
  onClose: () => void;
  nameOf: (a: Area) => string;
}) {
  const { tr } = useLocale();
  const { busy, run } = useRun(['manage', 'floor']);
  const [label, setLabel] = useState(table?.label ?? '');
  const [areaId, setArea] = useState(table?.area_id ?? (areas.length === 1 ? (areas[0]?.id ?? '') : ''));
  const [seats, setSeats] = useState(String(table?.seats ?? 4));
  const [x, setX] = useState(String(table?.grid_x ?? 0));
  const [y, setY] = useState(String(table?.grid_y ?? 0));
  const [tried, setTried] = useState(false);
  const form = { label, areaId, seats: parseIntStrict(seats), gridX: parseIntStrict(x), gridY: parseIntStrict(y) };
  const errors = validateTable(form);
  async function save() {
    setTried(true);
    if (hasErrors(errors)) return;
    const r = await run(
      () =>
        appRpc('upsert_dining_table', {
          p_id: table?.id ?? null,
          p_area_id: areaId,
          p_label: label.trim(),
          p_seats: form.seats,
          p_grid_x: form.gridX,
          p_grid_y: form.gridY,
        }),
      'manage.saved',
    );
    if (r.ok) onClose();
  }
  return (
    <EditDialog open title={tr(table ? 'manage.floor.editTable' : 'manage.floor.addTable')} onClose={onClose} onSave={() => void save()} busy={busy}>
      <TextField label={tr('manage.floor.label')} value={label} onChange={setLabel} error={tried ? errors.label : null} />
      <SelectField
        label={tr('manage.floor.area')}
        value={areaId}
        onChange={setArea}
        placeholder={tr('manage.choose')}
        options={areas.map((a) => ({ value: a.id, label: nameOf(a) }))}
        error={tried ? errors.areaId : null}
      />
      <NumberField label={tr('manage.floor.seats')} value={seats} onChange={setSeats} error={tried ? errors.seats : null} step="1" />
      <NumberField label={tr('manage.floor.gridX')} value={x} onChange={setX} error={tried ? errors.gridX : null} step="1" />
      <NumberField label={tr('manage.floor.gridY')} value={y} onChange={setY} error={tried ? errors.gridY : null} step="1" />
    </EditDialog>
  );
}
