import { useMemo, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useNavigate } from '@tanstack/react-router';
import { formatIQD } from '@rop/i18n';
import { Button, EmptyState, ErrorState, Field, Loading, Modal, useToast } from '../../components';
import { AppRpcError, appRpc } from '../../lib/appRpc';
import { useAuth } from '../../lib/auth';
import { errorMessage } from '../../lib/errors';
import { newIdem } from '../../lib/idem';
import { useLocale } from '../../lib/i18n';
import { QK } from '../../lib/queryKeys';
import { useBroadcast } from '../../lib/realtime';
import { supabase } from '../../lib/supabase';
import {
  clampCovers,
  groupByArea,
  gridPlacement,
  minutesOpen,
  splitMinutes,
  tableIsFree,
  type FloorArea,
  type FloorRow,
} from './floorLogic';
import './floor.css';

async function fetchAreas(): Promise<FloorArea[]> {
  const { data, error } = await supabase.from('floor_areas').select('id, name_en, name_ar, sort').order('sort');
  if (error) throw error;
  return (data ?? []) as FloorArea[];
}

async function fetchStatus(): Promise<FloorRow[]> {
  const { data, error } = await supabase.from('v_floor_status').select('*');
  if (error) throw error;
  return (data ?? []) as unknown as FloorRow[];
}

export function FloorScreen() {
  const { tr, locale } = useLocale();
  const { staff } = useAuth();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const toast = useToast();
  useBroadcast(staff ? `tabs:${staff.venueId}` : null);

  const areas = useQuery({ queryKey: QK.floorAreas(), queryFn: fetchAreas });
  const status = useQuery({ queryKey: QK.floorStatus(), queryFn: fetchStatus });

  const [areaId, setAreaId] = useState<string | null>(null);
  const [pending, setPending] = useState<FloorRow | null>(null);
  const [covers, setCovers] = useState('4');
  const [opening, setOpening] = useState(false);
  const [dayClosed, setDayClosed] = useState(false);
  const [openError, setOpenError] = useState<string | null>(null);

  const groups = useMemo(() => groupByArea(areas.data ?? [], status.data ?? []), [areas.data, status.data]);
  const current = groups.find((g) => g.area.id === areaId) ?? groups[0];
  // Minutes are recomputed on every render and refetch; no timer needed.
  const now = new Date();

  function pick(row: FloorRow) {
    if (row.tab_id) {
      void navigate({ to: '/tab/$tabId', params: { tabId: row.tab_id } });
      return;
    }
    setPending(row);
    setCovers(String(row.seats));
    setOpenError(null);
  }

  async function openTab() {
    if (!pending || opening) return;
    setOpening(true);
    setOpenError(null);
    try {
      const res = await appRpc<{ tab_id: string }>('open_tab', {
        p_table_id: pending.table_id,
        p_covers: clampCovers(Number(covers)),
        p_idempotency_key: newIdem('open_tab'),
      });
      setDayClosed(false);
      setPending(null);
      void qc.invalidateQueries({ queryKey: ['floor'] });
      void navigate({ to: '/tab/$tabId', params: { tabId: res.tab_id } });
    } catch (err) {
      if (err instanceof AppRpcError && err.code === 'DAY_NOT_OPEN') {
        setDayClosed(true);
        setPending(null);
      } else if (err instanceof AppRpcError && err.code === 'TABLE_OCCUPIED') {
        setPending(null);
        toast(errorMessage(err, locale), 'error');
        void qc.invalidateQueries({ queryKey: ['floor'] });
      } else {
        setOpenError(errorMessage(err, locale));
      }
    } finally {
      setOpening(false);
    }
  }

  if (areas.isPending || status.isPending) return <Loading />;
  const failed = areas.error ?? status.error;
  if (failed) {
    return (
      <ErrorState
        error={failed}
        onRetry={() => {
          void areas.refetch();
          void status.refetch();
        }}
      />
    );
  }
  if (groups.length === 0) return <EmptyState message={tr('floor.noAreas')} />;

  return (
    <section className="floor">
      <h1>{tr('floor.title')}</h1>

      {dayClosed && (
        <div role="alert" className="floor__notice">
          <h2>{tr('floor.dayNotOpenTitle')}</h2>
          <p>{tr('floor.dayNotOpenHint')}</p>
        </div>
      )}

      <div className="floor__areas" role="tablist" aria-label={tr('floor.areasLabel')}>
        {groups.map((g) => (
          <button
            key={g.area.id}
            type="button"
            role="tab"
            className="rop-btn floor__area"
            aria-selected={g.area.id === current?.area.id}
            onClick={() => setAreaId(g.area.id)}
          >
            {locale === 'ar' ? g.area.name_ar : g.area.name_en}
          </button>
        ))}
      </div>

      {current && current.tables.length === 0 && <EmptyState message={tr('floor.noTables')} />}
      <div className="floor__grid" role="tabpanel">
        {current?.tables.map((row) => {
          const free = tableIsFree(row);
          const { hours, minutes } = row.opened_at ? splitMinutes(minutesOpen(row.opened_at, now)) : { hours: 0, minutes: 0 };
          return (
            <button
              key={row.table_id}
              type="button"
              className="floor__table"
              data-state={free ? 'free' : 'occupied'}
              style={gridPlacement(row)}
              aria-label={
                free
                  ? tr('floor.tableFree', { label: row.label, seats: row.seats })
                  : tr('floor.tableBusy', { label: row.label, guests: row.covers ?? 0 })
              }
              onClick={() => pick(row)}
            >
              <span className="floor__label">{row.label}</span>
              <span className="floor__meta">{tr('floor.seats', { count: row.seats })}</span>
              {free ? (
                <span className="floor__state">{tr('floor.free')}</span>
              ) : (
                <>
                  <span className="floor__meta">{tr('floor.guests', { count: row.covers ?? 0 })}</span>
                  {row.waiter_name && <span className="floor__meta">{tr('floor.waiter', { name: row.waiter_name })}</span>}
                  <span className="floor__meta">
                    {hours > 0 ? tr('floor.openHours', { hours, minutes }) : tr('floor.openMinutes', { minutes })}
                  </span>
                  <span className="floor__due">{tr('floor.due', { amount: formatIQD(row.due ?? 0, locale) })}</span>
                </>
              )}
            </button>
          );
        })}
      </div>

      <Modal
        open={pending !== null}
        title={tr('floor.openTabTitle', { label: pending?.label ?? '' })}
        onClose={() => setPending(null)}
        footer={
          <>
            <Button onClick={() => setPending(null)}>{tr('common.cancel')}</Button>
            <Button variant="primary" busy={opening} onClick={() => void openTab()}>
              {tr('floor.openTab')}
            </Button>
          </>
        }
      >
        <form
          className="rop-form"
          onSubmit={(e) => {
            e.preventDefault();
            void openTab();
          }}
        >
          <Field label={tr('floor.coversLabel')} hint={tr('floor.coversHint')} error={openError}>
            {(p) => (
              <input
                {...p}
                type="number"
                inputMode="numeric"
                min={1}
                max={99}
                autoFocus
                value={covers}
                onChange={(e) => setCovers(e.target.value)}
              />
            )}
          </Field>
        </form>
      </Modal>
    </section>
  );
}
