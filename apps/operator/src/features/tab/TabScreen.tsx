import { useRef, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Link, useNavigate, useParams } from '@tanstack/react-router';
import { needsManagerPin } from '@rop/core';
import { formatTime } from '@rop/i18n';
import { ConfirmDialog, EmptyState, ErrorState, Button, Icon, Loading, Money, PageHeader, PinReasonModal, useToast } from '../../components';
import { appRpc } from '../../lib/appRpc';
import { useAuth } from '../../lib/auth';
import { errorMessage } from '../../lib/errors';
import { newIdem } from '../../lib/idem';
import { isUnclearFailure } from '../../lib/unclearLogic';
import { useLocale } from '../../lib/i18n';
import { QK } from '../../lib/queryKeys';
import { useBroadcast } from '../../lib/realtime';
import { supabase } from '../../lib/supabase';
import { BasketPanel } from './BasketPanel';
import {
  addLine,
  addsInOneTap,
  qtyByItem,
  emptyBasket,
  ensureSendKey,
  loadBasket,
  removeLine,
  saveBasket,
  sendLanded,
  setNote,
  setQty,
  toPayload,
  type Basket,
  type NewLine,
} from './basketLogic';
import { ItemSheet, type SheetItem } from './ItemSheet';
import { PickDialog } from './PickDialog';
import { ReasonDialog } from './ReasonDialog';
import { groupSentLines, hasActiveLines, localName, menuItemGroups, type RawItemGroup, type SentLine } from './tabLogic';
import './tab.css';

interface OpenTab {
  tab_id: string;
  table_label: string | null;
  covers: number;
  waiter_name: string | null;
  opened_at: string;
}
interface Totals {
  subtotal: number;
  discount: number;
  tax: number;
  total: number;
  paid: number;
  due: number;
}
interface Category {
  id: string;
  name_en: string;
  name_ar: string;
}
interface MenuItem {
  id: string;
  category_id: string;
  name_en: string;
  name_ar: string;
  price: number;
  menu_item_modifier_groups: RawItemGroup[];
}

async function fetchOpenTabs(): Promise<OpenTab[]> {
  const { data, error } = await supabase.from('v_open_tabs').select('tab_id, table_label, covers, waiter_name, opened_at');
  if (error) throw error;
  return (data ?? []) as unknown as OpenTab[];
}

async function fetchFreeTables(): Promise<{ table_id: string; label: string }[]> {
  const { data, error } = await supabase.from('v_floor_status').select('table_id, label, tab_id');
  if (error) throw error;
  return ((data ?? []) as unknown as { table_id: string; label: string; tab_id: string | null }[]).filter((r) => r.tab_id === null);
}

async function fetchLines(tabId: string): Promise<SentLine[]> {
  const { data, error } = await supabase
    .from('order_items')
    .select(
      'id, order_id, name_en, name_ar, unit_price, qty, line_total, note, voided_at, void_reason, created_at,' +
        ' order_item_modifiers(name_en, name_ar, price_delta), orders(placed_at, staff:placed_by(full_name))',
    )
    .eq('tab_id', tabId);
  if (error) throw error;
  type Raw = Omit<SentLine, 'modifiers' | 'placed_at' | 'placed_by_name'> & {
    order_item_modifiers: SentLine['modifiers'];
    orders: { placed_at: string; staff: { full_name: string } | null } | null;
  };
  return ((data ?? []) as unknown as Raw[]).map((r) => ({
    ...r,
    modifiers: r.order_item_modifiers ?? [],
    placed_at: r.orders?.placed_at ?? r.created_at,
    placed_by_name: r.orders?.staff?.full_name ?? null,
  }));
}

async function fetchMenu(): Promise<{ categories: Category[]; items: MenuItem[] }> {
  const cats = await supabase.from('menu_categories').select('id, name_en, name_ar').eq('is_active', true).order('sort');
  if (cats.error) throw cats.error;
  const items = await supabase
    .from('menu_items')
    .select(
      'id, category_id, name_en, name_ar, price, menu_item_modifier_groups(modifier_groups(id, name_en, name_ar, min_select, max_select, modifiers(id, name_en, name_ar, price_delta, is_active)))',
    )
    .eq('is_active', true)
    .order('sort');
  if (items.error) throw items.error;
  return { categories: (cats.data ?? []) as Category[], items: (items.data ?? []) as unknown as MenuItem[] };
}

export function TabScreen() {
  const { tabId } = useParams({ strict: false });
  // key: a merge navigates to another tab; its basket and dialogs must start fresh.
  return tabId ? <TabView key={tabId} tabId={tabId} /> : null;
}

type Dialog = null | 'transfer' | 'merge' | 'cancel';

function TabView({ tabId }: { tabId: string }) {
  const { tr, locale } = useLocale();
  const { staff } = useAuth();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const toast = useToast();
  useBroadcast(staff ? `tabs:${staff.venueId}` : null);

  const openTabs = useQuery({ queryKey: QK.tabOpenTabs(), queryFn: fetchOpenTabs });
  const lines = useQuery({ queryKey: QK.tabLines(tabId), queryFn: () => fetchLines(tabId) });
  const totals = useQuery({
    queryKey: QK.tabTotals(tabId),
    queryFn: () => appRpc<Totals>('compute_tab_totals', { p_tab_id: tabId }),
  });
  const menu = useQuery({ queryKey: QK.tabMenu(), queryFn: fetchMenu });

  const [basket, setBasket] = useState<Basket>(() => loadBasket(localStorage, tabId));
  const [sending, setSending] = useState(false);
  const [sendError, setSendError] = useState<string | null>(null);
  // After an unclear send the basket is locked until we know whether the order landed.
  const [sendCheck, setSendCheck] = useState<'checking' | 'failed' | null>(null);
  const ordersBefore = useRef<Set<string>>(new Set());
  const [categoryId, setCategoryId] = useState<string | null>(null);
  const [sheetItem, setSheetItem] = useState<MenuItem | null>(null);
  const [dialog, setDialog] = useState<Dialog>(null);
  const [voidLine, setVoidLine] = useState<SentLine | null>(null);
  const [busy, setBusy] = useState(false);
  const [dialogError, setDialogError] = useState<string | null>(null);

  const role = staff?.role ?? null;
  const tab = openTabs.data?.find((t) => t.tab_id === tabId);
  const sent = lines.data ?? [];
  const active = hasActiveLines(sent);
  const canLeave = basket.lines.length === 0; // merge and cancel would orphan an unsent basket

  const freeTables = useQuery({ queryKey: QK.tabFreeTables(), queryFn: fetchFreeTables, enabled: dialog === 'transfer' });

  function commit(next: Basket) {
    setBasket(next);
    saveBasket(localStorage, tabId, next);
  }
  const refresh = () => void qc.invalidateQueries({ queryKey: ['tab'] }).then(() => qc.invalidateQueries({ queryKey: ['floor'] }));

  /** Re-read the tab's lines: a new order means the send landed; otherwise unlock and keep the key. */
  async function checkSend() {
    setSendCheck('checking');
    try {
      const r = await lines.refetch();
      if (r.error || !r.data) throw r.error ?? new Error('lines unreadable');
      if (sendLanded(ordersBefore.current, r.data)) {
        commit(emptyBasket());
        setSendError(null);
        toast(tr('tab.sentOk'), 'success');
        refresh();
      }
      setSendCheck(null);
    } catch {
      setSendCheck('failed');
    }
  }

  async function send() {
    if (sending || sendCheck !== null || basket.lines.length === 0) return;
    // One key per basket version: a retry or double tap replays the same server call.
    const keyed = ensureSendKey(basket, () => newIdem('add_items'));
    commit(keyed);
    ordersBefore.current = new Set(sent.map((l) => l.order_id));
    setSending(true);
    setSendError(null);
    try {
      await appRpc('add_items', { p_tab_id: tabId, p_items: toPayload(keyed), p_idempotency_key: keyed.sendKey });
      commit(emptyBasket());
      toast(tr('tab.sentOk'), 'success');
      refresh();
    } catch (err) {
      setSendError(`${tr('tab.sendFailed')} ${errorMessage(err, locale)}`);
      if (isUnclearFailure(err)) void checkSend();
    } finally {
      setSending(false);
    }
  }

  /** Run a confirmed data-changing action; show errors in the open dialog. */
  async function run(action: () => Promise<void>) {
    setBusy(true);
    setDialogError(null);
    try {
      await action();
    } catch (err) {
      setDialogError(errorMessage(err, locale));
    } finally {
      setBusy(false);
    }
  }

  const closeDialog = () => {
    setDialog(null);
    setDialogError(null);
  };

  const transfer = (tableId: string) =>
    run(async () => {
      await appRpc('transfer_tab', { p_tab_id: tabId, p_table_id: tableId });
      closeDialog();
      toast(tr('tab.transferred'), 'success');
      refresh();
    });

  const merge = (intoTabId: string) =>
    run(async () => {
      await appRpc('merge_tabs', { p_from: tabId, p_into: intoTabId });
      saveBasket(localStorage, tabId, emptyBasket());
      toast(tr('tab.merged'), 'success');
      refresh();
      void navigate({ to: '/tab/$tabId', params: { tabId: intoTabId } });
    });

  const cancelTab = () =>
    run(async () => {
      await appRpc('cancel_tab', { p_tab_id: tabId, p_reason: tr('tab.cancelReason') });
      saveBasket(localStorage, tabId, emptyBasket());
      toast(tr('tab.cancelled'), 'success');
      refresh();
      void navigate({ to: '/floor' });
    });

  async function doVoid(line: SentLine, reason: string) {
    setBusy(true);
    try {
      await appRpc('void_item', { p_order_item_id: line.id, p_reason: reason });
      toast(tr('tab.voidedOk'), 'success');
      refresh();
    } catch (err) {
      toast(errorMessage(err, locale), 'error');
    } finally {
      setBusy(false);
      setVoidLine(null);
    }
  }

  if (openTabs.isPending || lines.isPending) return <Loading />;
  const failed = openTabs.error ?? lines.error;
  if (failed) {
    return (
      <ErrorState
        error={failed}
        onRetry={() => {
          void openTabs.refetch();
          void lines.refetch();
        }}
      />
    );
  }
  if (!tab) {
    return (
      <EmptyState
        message={tr('tab.notFound')}
        action={
          <Link to="/floor" className="rop-btn">
            {tr('tab.backToFloor')}
          </Link>
        }
      />
    );
  }

  const categories = menu.data?.categories ?? [];
  const currentCategory = categories.find((c) => c.id === categoryId) ?? categories[0];
  const items = (menu.data?.items ?? []).filter((i) => i.category_id === currentCategory?.id);
  const orders = groupSentLines(sent);
  const inBasket = qtyByItem(basket);

  /** One tap adds an item that has nothing to choose; anything with modifiers opens the sheet. */
  function pickItem(i: MenuItem) {
    if (!addsInOneTap(menuItemGroups(i.menu_item_modifier_groups))) return setSheetItem(i);
    commit(addLine(basket, { menuItemId: i.id, nameEn: i.name_en, nameAr: i.name_ar, basePrice: i.price, modifiers: [], qty: 1, note: '' }));
  }

  return (
    <section className="tab">
      <PageHeader
        className="tab__header"
        lead={
          <Link to="/floor" className="rop-btn rop-btn--ghost tab__back" aria-label={tr('tab.backToFloor')}>
            <Icon name="back" />
            <span>{tr('nav.floor')}</span>
          </Link>
        }
        title={tab.table_label ? tr('tab.table', { label: tab.table_label }) : tr('tab.noTable')}
        meta={
          <>
            <span>
              <Icon name="person" size={16} />
              {tr('common.covers.other', { count: tab.covers })}
            </span>
            {tab.waiter_name && <span>{tab.waiter_name}</span>}
            <span>
              <Icon name="clock" size={16} />
              {tr('tab.opened', { time: formatTime(new Date(tab.opened_at), locale) })}
            </span>
          </>
        }
        actions={
          <>
            <Button title={tr('tab.transfer')} onClick={() => setDialog('transfer')}>
              {tr('tab.transferShort')}
            </Button>
            <Button disabled={!canLeave} title={canLeave ? tr('tab.merge') : tr('tab.sendFirst')} onClick={() => setDialog('merge')}>
              {tr('tab.mergeShort')}
            </Button>
            {!active && (
              <Button variant="danger" disabled={!canLeave} title={canLeave ? undefined : tr('tab.sendFirst')} onClick={() => setDialog('cancel')}>
                {tr('tab.cancelTab')}
              </Button>
            )}
          </>
        }
      />

      <div className="tab__body">
        <section className="tab__menu" aria-labelledby="menu-title">
          <h2 id="menu-title" className="rop-sr-only">
            {tr('tab.menu')}
          </h2>
          {menu.isPending && <Loading />}
          {menu.error && <ErrorState error={menu.error} onRetry={() => void menu.refetch()} />}
          {menu.data && categories.length === 0 && <EmptyState message={tr('tab.noMenu')} />}
          <div className="tab__categories" role="tablist" aria-label={tr('tab.categories')}>
            {categories.map((c) => (
              <button
                key={c.id}
                type="button"
                role="tab"
                className="rop-btn tab__category"
                aria-selected={c.id === currentCategory?.id}
                onClick={() => setCategoryId(c.id)}
              >
                {localName(locale, c)}
              </button>
            ))}
          </div>
          {currentCategory && items.length === 0 && <EmptyState message={tr('tab.noItems')} />}
          <div className="tab__items rop-cascade" role="tabpanel" key={currentCategory?.id}>
            {items.map((i) => {
              const qty = inBasket.get(i.id) ?? 0;
              return (
                <button
                  key={i.id}
                  type="button"
                  className="tab__item"
                  data-in-basket={qty > 0 ? 'true' : undefined}
                  disabled={sendCheck !== null}
                  onClick={() => pickItem(i)}
                >
                  <span className="tab__item-name">{localName(locale, i)}</span>
                  <Money amount={i.price} />
                  {qty > 0 && (
                    <span key={qty} className="tab__item-qty" aria-label={`${tr('tab.qty')}: ${qty}`}>
                      {qty}
                    </span>
                  )}
                </button>
              );
            })}
          </div>
        </section>

        <div className="tab__side">
          <BasketPanel
            basket={basket}
            sending={sending}
            check={sendCheck}
            onRecheck={() => void checkSend()}
            error={sendError}
            onQty={(id, q) => commit(setQty(basket, id, q))}
            onRemove={(id) => commit(removeLine(basket, id))}
            onNote={(id, n) => commit(setNote(basket, id, n))}
            onSend={() => void send()}
          />

          <section className="tab__sent" aria-labelledby="sent-title">
            <h2 id="sent-title">{tr('tab.sent')}</h2>
            <div className="tab__orders">
            {orders.length === 0 && <p>{tr('tab.noneSent')}</p>}
            {orders.map((o) => (
              <div key={o.orderId} className="tab__order">
                <h3>
                  {tr('tab.sentBy', {
                    time: formatTime(new Date(o.placedAt), locale),
                    name: o.placedByName ?? '',
                  })}
                </h3>
                <ul>
                  {o.lines.map((l) => (
                    <li key={l.id} className="tab__sent-line" data-voided={l.voided_at ? 'true' : undefined}>
                      <div className="tab__sent-head">
                        <span className={l.voided_at ? 'tab__struck' : undefined}>
                          {l.qty} × {localName(locale, l)}
                        </span>
                        <span className={l.voided_at ? 'tab__struck' : undefined}>
                          <Money amount={l.line_total} />
                        </span>
                      </div>
                      {l.modifiers.length > 0 && <p className="tab__sub">{l.modifiers.map((m) => localName(locale, m)).join(', ')}</p>}
                      {l.note && <p className="tab__sub">{tr('tab.note', { note: l.note })}</p>}
                      {l.voided_at ? (
                        <p className="tab__sub">
                          <strong>{tr('tab.voided')}</strong>
                          {l.void_reason ? ` · ${tr('tab.voidReason', { reason: l.void_reason })}` : ''}
                        </p>
                      ) : (
                        <Button className="tab__void" onClick={() => setVoidLine(l)}>
                          {tr('tab.voidLine')}
                        </Button>
                      )}
                    </li>
                  ))}
                </ul>
              </div>
            ))}
            </div>

            <dl className="tab__totals">
              {totals.data ? (
                <>
                  <dt>{tr('tab.subtotal')}</dt>
                  <dd>
                    <Money amount={totals.data.subtotal} />
                  </dd>
                  {totals.data.discount > 0 && (
                    <>
                      <dt>{tr('tab.discount')}</dt>
                      <dd>
                        <Money amount={totals.data.discount} />
                      </dd>
                    </>
                  )}
                  <dt>{tr('tab.tax')}</dt>
                  <dd>
                    <Money amount={totals.data.tax} />
                  </dd>
                  <dt>{tr('tab.total')}</dt>
                  <dd>
                    <Money amount={totals.data.total} />
                  </dd>
                  {totals.data.paid > 0 && (
                    <>
                      <dt>{tr('tab.paid')}</dt>
                      <dd>
                        <Money amount={totals.data.paid} />
                      </dd>
                    </>
                  )}
                  <dt>{tr('tab.due')}</dt>
                  <dd>
                    <Money amount={totals.data.due} />
                  </dd>
                </>
              ) : totals.error ? (
                <dd role="alert">{errorMessage(totals.error, locale)}</dd>
              ) : (
                <dd>…</dd>
              )}
            </dl>
          </section>
        </div>
      </div>

      {sheetItem && (
        <ItemSheet
          item={{ id: sheetItem.id, nameEn: sheetItem.name_en, nameAr: sheetItem.name_ar, price: sheetItem.price } satisfies SheetItem}
          groups={menuItemGroups(sheetItem.menu_item_modifier_groups)}
          onClose={() => setSheetItem(null)}
          onAdd={(line: NewLine) => {
            commit(addLine(basket, line));
            setSheetItem(null);
          }}
        />
      )}

      {dialog === 'transfer' && (
        <PickDialog
          title={tr('tab.transferTitle')}
          label={tr('tab.transferTo')}
          options={(freeTables.data ?? []).map((t) => ({ value: t.table_id, label: t.label }))}
          emptyMessage={freeTables.isPending ? tr('common.loading') : tr('tab.noFreeTables')}
          confirmLabel={tr('tab.transferConfirm')}
          busy={busy}
          error={dialogError}
          onConfirm={(v) => void transfer(v)}
          onClose={closeDialog}
        />
      )}

      {dialog === 'merge' && (
        <PickDialog
          title={tr('tab.mergeTitle')}
          label={tr('tab.mergeInto')}
          hint={tr('tab.mergeHint')}
          options={(openTabs.data ?? [])
            .filter((t) => t.tab_id !== tabId)
            .map((t) => ({ value: t.tab_id, label: t.table_label ?? tr('tab.noTable') }))}
          emptyMessage={tr('tab.noOtherTabs')}
          confirmLabel={tr('tab.mergeConfirm')}
          busy={busy}
          error={dialogError}
          onConfirm={(v) => void merge(v)}
          onClose={closeDialog}
        />
      )}

      <ConfirmDialog
        open={dialog === 'cancel'}
        title={tr('tab.cancelTitle')}
        message={dialogError ?? tr('tab.cancelMessage')}
        confirmLabel={tr('tab.cancelConfirm')}
        danger
        busy={busy}
        onConfirm={() => void cancelTab()}
        onCancel={closeDialog}
      />

      {voidLine &&
        (needsManagerPin(role, 'voidSentLine') ? (
          <PinReasonModal
            open
            action="void_item"
            entityId={voidLine.id}
            title={tr('tab.voidTitle', { name: localName(locale, voidLine) })}
            onClose={() => setVoidLine(null)}
            onGranted={({ reason }) => {
              void doVoid(voidLine, reason);
            }}
          />
        ) : (
          <ReasonDialog
            title={tr('tab.voidTitle', { name: localName(locale, voidLine) })}
            confirmLabel={tr('tab.voidConfirm')}
            busy={busy}
            onConfirm={(reason) => void doVoid(voidLine, reason)}
            onClose={() => setVoidLine(null)}
          />
        ))}
    </section>
  );
}
