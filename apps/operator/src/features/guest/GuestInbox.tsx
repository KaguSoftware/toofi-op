import { useEffect, useId, useMemo, useRef, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { can } from '@rop/core';
import { formatIQD } from '@rop/i18n';
import { Button, ConfirmDialog, Icon, Modal, Money, useToast } from '../../components';
import { AppRpcError, appRpc } from '../../lib/appRpc';
import { chime, useAudioArming } from '../../lib/audio';
import { useAuth } from '../../lib/auth';
import { errorMessage } from '../../lib/errors';
import { newIdem } from '../../lib/idem';
import { useLocale } from '../../lib/i18n';
import { QK, refreshTabs } from '../../lib/queryKeys';
import { useBroadcast } from '../../lib/realtime';
import { CoversPicker } from '../floor/CoversPicker';
import { fetchStatus } from '../floor/floorData';
import { clampCovers } from '../floor/floorLogic';
import { INBOX_REFETCH_MS, fetchGuestInbox } from './guestData';
import {
  acceptFailure,
  initialChimeState,
  myTableIds,
  nextChime,
  sortInbox,
  urgency,
  waitedSeconds,
  type InboxCall,
  type InboxEntry,
  type InboxOrder,
} from './guestLogic';
import './guest.css';

/** Waiting times and the re-chime rule are checked this often. */
const TICK_MS = 10_000;

function useNow(intervalMs: number): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), intervalMs);
    return () => clearInterval(id);
  }, [intervalMs]);
  return now;
}

/** Plays the chime for new and long-waiting entries. Runs while the list is hidden too. */
function useGuestChime(entries: readonly InboxEntry[], now: number): void {
  const state = useRef(initialChimeState);
  const key = entries.map((e) => e.key).join('|');
  const entriesRef = useRef(entries);
  entriesRef.current = entries;
  useEffect(() => {
    const { chime: kind, next } = nextChime(state.current, entriesRef.current, now);
    state.current = next;
    if (kind) chime(kind);
  }, [key, now]);
}

type Tr = ReturnType<typeof useLocale>['tr'];

function WaitBadge({ at, now, tr }: { at: string; now: number; tr: Tr }) {
  const seconds = waitedSeconds(at, now);
  const level = urgency(seconds);
  const minutes = Math.floor(seconds / 60);
  return (
    <span
      className="rop-badge guest-inbox__wait"
      data-tone={level === 'red' ? 'danger' : level === 'amber' ? 'warning' : undefined}
    >
      <Icon name="clock" />
      {minutes < 1 ? tr('guestInbox.waitedNow') : tr('guestInbox.waited', { minutes })}
    </span>
  );
}

function RowHead({ entry, now, tr }: { entry: InboxEntry; now: number; tr: Tr }) {
  const label = entry.kind === 'call' ? entry.call.table_label : entry.order.table_label;
  return (
    <p className="guest-inbox__who">
      <strong className="guest-inbox__table">{tr('guestInbox.table', { label })}</strong>
      {entry.mine && (
        <span className="guest-inbox__mine">
          <Icon name="person" size={16} />
          {tr('guestInbox.yours')}
        </span>
      )}
      <WaitBadge at={entry.at} now={now} tr={tr} />
    </p>
  );
}

/**
 * Guest calls and orders on every screen. OK answers a call or accepts an order (asking for
 * the guest count first on a free table); Decline is the quiet second action on an order.
 */
export function GuestInbox({ hidden = false }: { hidden?: boolean }) {
  const { staff } = useAuth();
  const { tr, locale } = useLocale();
  const qc = useQueryClient();
  const toast = useToast();
  const listId = useId();
  const allowed = !!staff && can(staff.role, 'answerGuests');
  useBroadcast(allowed && staff ? `tabs:${staff.venueId}` : null);

  const inbox = useQuery({
    queryKey: QK.guestInbox(),
    queryFn: fetchGuestInbox,
    enabled: allowed,
    refetchInterval: INBOX_REFETCH_MS,
  });
  const floor = useQuery({ queryKey: QK.floorStatus(), queryFn: fetchStatus, enabled: allowed });

  const now = useNow(TICK_MS);
  const entries = useMemo(
    () => (inbox.data ? sortInbox(inbox.data, myTableIds(floor.data ?? [], staff?.id)) : []),
    [inbox.data, floor.data, staff?.id],
  );
  useGuestChime(entries, now);
  const { armed, arm } = useAudioArming();

  const [collapsed, setCollapsed] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [rowError, setRowError] = useState<Record<string, string>>({});
  const [coversFor, setCoversFor] = useState<InboxOrder | null>(null);
  const [covers, setCovers] = useState('2');
  const [declineFor, setDeclineFor] = useState<InboxOrder | null>(null);

  const refetchInbox = () => void qc.invalidateQueries({ queryKey: QK.guestInbox() });
  const setError = (orderId: string, message: string | null) =>
    setRowError((m) => {
      const next = { ...m };
      if (message) next[orderId] = message;
      else delete next[orderId];
      return next;
    });

  async function answer(c: InboxCall) {
    setBusy(`call:${c.id}`);
    try {
      // A second device gets {already: true}; either way the refetch clears the row.
      await appRpc('answer_waiter_call', { p_call_id: c.id });
    } catch (err) {
      toast(errorMessage(err, locale), 'error');
    } finally {
      setBusy(null);
      refetchInbox();
    }
  }

  function askCovers(o: InboxOrder) {
    const seats = floor.data?.find((r) => r.table_id === o.table_id)?.seats;
    setCovers(String(seats ?? 2));
    setCoversFor(o);
  }

  async function accept(o: InboxOrder, guestCount: number | null) {
    setBusy(`order:${o.id}`);
    setError(o.id, null);
    // One key per tap. A refused call rolls back, so the retry may reuse it.
    const args = { p_guest_order_id: o.id, p_covers: guestCount, p_idempotency_key: newIdem('guest_accept') };
    try {
      try {
        await appRpc('accept_guest_order', args);
      } catch (err) {
        if (err instanceof AppRpcError && acceptFailure(err.code) === 'retry') await appRpc('accept_guest_order', args);
        else throw err;
      }
      setCoversFor(null);
      toast(tr('guestInbox.accepted', { label: o.table_label }), 'success');
      refreshTabs(qc);
    } catch (err) {
      const kind = acceptFailure(err instanceof AppRpcError ? err.code : undefined);
      setCoversFor(null);
      if (kind === 'covers') askCovers(o);
      else if (kind === 'menu') setError(o.id, tr('guestInbox.menuChanged'));
      else if (kind === 'gone') toast(errorMessage(err, locale), 'error');
      else setError(o.id, errorMessage(err, locale));
      refetchInbox();
    } finally {
      setBusy(null);
    }
  }

  async function decline(o: InboxOrder) {
    setBusy(`order:${o.id}`);
    try {
      await appRpc('decline_guest_order', { p_guest_order_id: o.id });
      setDeclineFor(null);
    } catch (err) {
      setDeclineFor(null);
      toast(errorMessage(err, locale), 'error');
    } finally {
      setBusy(null);
      refetchInbox();
    }
  }

  if (!allowed || hidden) return null;
  if (entries.length === 0 && armed) return null;

  const name = (x: { name_en: string; name_ar: string }) => (locale === 'ar' ? x.name_ar : x.name_en);

  return (
    <aside className="guest-inbox" aria-labelledby={`${listId}-title`} data-collapsed={collapsed || undefined}>
      {entries.length > 0 && (
        <h2 className="guest-inbox__head" id={`${listId}-title`}>
          <Button
            className="rop-btn--ghost guest-inbox__toggle"
            aria-expanded={!collapsed}
            aria-controls={listId}
            aria-label={collapsed ? tr('guestInbox.show') : tr('guestInbox.hide')}
            onClick={() => setCollapsed((v) => !v)}
          >
            <Icon name="bell" />
            <span className="guest-inbox__title">{tr('guestInbox.title')}</span>
            <span className="guest-inbox__count" aria-live="polite">
              {tr('guestInbox.count', { count: entries.length })}
            </span>
            <Icon name={collapsed ? 'arrowUp' : 'arrowDown'} size={20} />
          </Button>
        </h2>
      )}
      {!armed && (
        <Button className="guest-inbox__sound" onClick={arm} aria-describedby={`${listId}-sound`}>
          <Icon name="bell" size={20} />
          <span>{tr('guestInbox.soundOn')}</span>
          <span id={`${listId}-sound`} className="guest-inbox__sound-hint">
            {tr('guestInbox.soundHint')}
          </span>
        </Button>
      )}
      {entries.length > 0 && !collapsed && (
        <ul className="guest-inbox__list" id={listId}>
          {entries.map((e) => {
            const level = urgency(waitedSeconds(e.at, now));
            if (e.kind === 'call') {
              const c = e.call;
              return (
                <li key={e.key} className="guest-inbox__row" data-kind="call" data-urgency={level}>
                  <RowHead entry={e} now={now} tr={tr} />
                  <div className="guest-inbox__body">
                    <p className="guest-inbox__what">
                      <Icon name="bell" size={20} />
                      {tr(`guestInbox.reason.${c.reason}`)}
                    </p>
                    <Button
                      variant="primary"
                      busy={busy === e.key}
                      aria-label={tr('guestInbox.okCall', { label: c.table_label })}
                      onClick={() => void answer(c)}
                    >
                      {tr('guestInbox.ok')}
                    </Button>
                  </div>
                </li>
              );
            }
            const o = e.order;
            const error = rowError[o.id];
            return (
              <li key={e.key} className="guest-inbox__row" data-kind="order" data-urgency={level}>
                <RowHead entry={e} now={now} tr={tr} />
                <p className="guest-inbox__what">
                  <Icon name="menu" size={20} />
                  {tr('guestInbox.order')}
                </p>
                <ul className="guest-inbox__lines">
                  {o.lines.map((l, i) => (
                    <li key={`${l.menu_item_id}-${i}`}>
                      <span className="guest-inbox__qty">
                        <bdi>{l.qty}</bdi>×
                      </span>
                      <span>
                        {name(l)}
                        {l.modifiers.length > 0 && (
                          <span className="guest-inbox__mods"> · {l.modifiers.map(name).join(', ')}</span>
                        )}
                        {l.note && <span className="guest-inbox__line-note">{tr('guestInbox.note', { note: l.note })}</span>}
                      </span>
                      <Money amount={l.line_total} />
                    </li>
                  ))}
                </ul>
                <p className="guest-inbox__total">
                  <span>{tr('guestInbox.total')}</span>
                  <Money amount={o.total} />
                </p>
                {o.unavailable ? (
                  <p className="guest-inbox__flag">
                    <Icon name="alert" size={20} />
                    {tr('guestInbox.unavailable')}
                  </p>
                ) : (
                  o.price_changed &&
                  o.current_total !== null && (
                    <p className="guest-inbox__flag">
                      <Icon name="alert" size={20} />
                      {tr('guestInbox.priceChanged', { amount: formatIQD(o.current_total, locale) })}
                    </p>
                  )
                )}
                {error && (
                  <p className="rop-field__error" role="alert">
                    {error}
                  </p>
                )}
                <div className="guest-inbox__actions">
                  <Button
                    className="rop-btn--ghost"
                    disabled={busy === e.key}
                    aria-label={tr('guestInbox.declineOrder', { label: o.table_label })}
                    onClick={() => setDeclineFor(o)}
                  >
                    {tr('guestInbox.decline')}
                  </Button>
                  <Button
                    variant="primary"
                    busy={busy === e.key}
                    aria-label={tr('guestInbox.okOrder', { label: o.table_label })}
                    onClick={() => (o.table_has_tab ? void accept(o, null) : askCovers(o))}
                  >
                    {tr('guestInbox.ok')}
                  </Button>
                </div>
              </li>
            );
          })}
        </ul>
      )}

      <Modal
        open={coversFor !== null}
        title={tr('guestInbox.coversTitle', { label: coversFor?.table_label ?? '' })}
        onClose={() => setCoversFor(null)}
        footer={
          <>
            <Button onClick={() => setCoversFor(null)}>{tr('common.cancel')}</Button>
            <Button
              variant="primary"
              busy={coversFor !== null && busy === `order:${coversFor.id}`}
              onClick={() => coversFor && void accept(coversFor, clampCovers(Number(covers)))}
            >
              {tr('guestInbox.accept')}
            </Button>
          </>
        }
      >
        <form
          className="rop-form"
          onSubmit={(ev) => {
            ev.preventDefault();
            if (coversFor) void accept(coversFor, clampCovers(Number(covers)));
          }}
        >
          <CoversPicker value={covers} onChange={setCovers} />
        </form>
      </Modal>

      <ConfirmDialog
        open={declineFor !== null}
        title={tr('guestInbox.declineTitle', { label: declineFor?.table_label ?? '' })}
        message={tr('guestInbox.declineMessage')}
        confirmLabel={tr('guestInbox.declineConfirm')}
        danger
        busy={declineFor !== null && busy === `order:${declineFor.id}`}
        onConfirm={() => declineFor && void decline(declineFor)}
        onCancel={() => setDeclineFor(null)}
      />
    </aside>
  );
}
