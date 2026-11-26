'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import type { Locale } from '@rop/i18n';
import { formatIQD } from '@rop/i18n/formatting';
import { guestApi } from '@/lib/client/guestApi';
import { guestKey } from '@/lib/client/stationLogic';
import { addToBasket, capCode, changeLine, indexMenu, itemCountForm, qtyByItem, removeLine, removeOneOf, resolveLines, toRequest, totalsOf, type BasketChange, type BasketLine } from '@/lib/basketLogic';
import { POLL_MS, callButton, callOutcome, callStrip, formatCountdown, needsClock, parseGuestStatus, serverNowOf, type GuestStatus, type SessionState } from '@/lib/callLogic';
import { errorText, fill, type GuestCopy } from '@/lib/copyLogic';
import type { MenuView } from '@/lib/menuViewLogic';
import type { CallReason } from '@/lib/requestLogic';
import { attemptFor, hasPendingOrder, orderStrips, sendGate, sendOutcome } from '@/lib/orderLogic';
import { activeSectionIndex } from '@/lib/railLogic';
import { useBasket } from '@/hooks/useBasket';
import { useOnline } from '@/hooks/useOnline';
import { usePolling } from '@/hooks/usePolling';
import { useServerClock } from '@/hooks/useServerClock';
import { BottomBar } from './BottomBar';
import { CallSheet } from './CallSheet';
import { CategoryIcon } from './Icon';
import { CategoryRail } from './CategoryRail';
import { DishRow } from './DishRow';
import { NoticeSheet, type NoticeKind } from './NoticeSheet';
import { OptionsSheet } from './OptionsSheet';
import { OrderSheet } from './OrderSheet';
import { CornerOrnament, Star, StarStrip } from './Ornaments';
import { StatusStrips, type NoticeStrip } from './StatusStrips';

export interface GuestScreenProps {
  copy: GuestCopy;
  locale: Locale;
  venueName: string;
  /** `error`: the menu could not be read; `empty`: it has no dishes. */
  menuState: 'ok' | 'empty' | 'error';
  menu: MenuView | null;
  initialStatus: GuestStatus | null;
  initialSession: SessionState;
  /** The server's clock when the page was rendered (epoch ms). */
  serverNow: number;
}

type SheetKind = 'call' | 'order' | 'options' | NoticeKind;

function localStore(): Storage | null {
  try {
    return window.localStorage;
  } catch {
    return null;
  }
}

const SCROLL_LOCK_MS = 700;

export function GuestScreen({ copy, locale, venueName, menuState, menu, initialStatus, initialSession, serverNow }: GuestScreenProps) {
  const router = useRouter();
  const online = useOnline();
  const clock = useServerClock(serverNow);
  const [status, setStatus] = useState(initialStatus);
  const [session, setSession] = useState(initialSession);
  const [sheet, setSheet] = useState<SheetKind | null>(null);
  const [sending, setSending] = useState<CallReason | null>(null);
  const [callError, setCallError] = useState<string | null>(null);
  const [switching, setSwitching] = useState(false);
  // One key per tap, kept for that tap's retries until the server has answered.
  const pendingKey = useRef<{ reason: CallReason; key: string } | null>(null);

  // The order, kept on the phone. Prices here are a mirror of the menu; the server prices what is sent.
  const [basket, setBasket] = useBasket();
  const [optionsFor, setOptionsFor] = useState<string | null>(null);
  const [orderSending, setOrderSending] = useState(false);
  const sendLock = useRef(false);
  const [sendError, setSendError] = useState<string | null>(null);
  const [limitNote, setLimitNote] = useState<string | null>(null);
  const [dismissed, setDismissed] = useState<ReadonlySet<string>>(() => new Set());

  const now = clock.now;
  const button = callButton({ session, status, now });
  const orders = status?.orders ?? [];
  const waiting = session === 'live' && (status?.call?.status === 'waiting' || hasPendingOrder(orders));

  const index = useMemo(() => indexMenu(menu), [menu]);
  const lineViews = useMemo(() => resolveLines(basket.lines, index), [basket.lines, index]);
  const totals = totalsOf(lineViews);
  const quantities = useMemo(() => qtyByItem(basket.lines), [basket.lines]);
  // Without a menu the lines cannot be named or priced, so the order waits (it stays on the phone) until the menu is back.
  const ordersOff = menuState !== 'ok' || (session === 'live' && status !== null && !status.ordersEnabled);

  const refresh = useCallback(async () => {
    const answer = await guestApi.status();
    if (answer.ok) {
      const parsed = parseGuestStatus(answer.data);
      if (parsed) setStatus(parsed);
      const at = serverNowOf(answer.data);
      if (at !== null) clock.sync(at);
    } else if (answer.result === 'expired') {
      setSession('expired');
    }
  }, [clock]);

  // Ask the server only while a call or an order is waiting; stop when it is answered. Tick while a countdown or timed strip shows.
  usePolling(waiting, () => void refresh(), POLL_MS);
  usePolling(needsClock(status, now), clock.tick, 1000);

  async function raise(reason: CallReason) {
    if (sending || !online) return;
    setSending(reason);
    setCallError(null);
    const key = pendingKey.current?.reason === reason ? pendingKey.current.key : guestKey('raise_waiter_call', localStore());
    pendingKey.current = { reason, key };
    const answer = await guestApi.call(reason, key);
    setSending(null);
    // A dropped connection leaves the outcome unknown: keep the key so a retry cannot call twice.
    if (answer.ok || answer.result !== 'error' || answer.code !== null) pendingKey.current = null;

    const outcome = callOutcome(answer);
    switch (outcome.kind) {
      case 'raised':
        setStatus((prev) => (prev ? { ...prev, call: outcome.call } : prev));
        setSheet(null);
        void refresh();
        break;
      case 'expired':
        setSession('expired');
        setSheet('expired');
        break;
      case 'closed':
        setStatus((prev) => (prev ? { ...prev, dayOpen: false } : prev));
        setSheet('closed');
        break;
      case 'off':
        setStatus((prev) => (prev ? { ...prev, callsEnabled: false } : prev));
        setSheet('off');
        break;
      case 'too-soon':
        void refresh();
        setSheet('tooSoon');
        break;
      case 'message':
        setCallError(errorText(copy, outcome.code));
        break;
    }
  }

  // A refused change (20 of one dish, 40 lines) is said in the open sheet, or in a strip when none is open.
  useEffect(() => {
    if (!limitNote) return;
    const id = setTimeout(() => setLimitNote(null), 5000);
    return () => clearTimeout(id);
  }, [limitNote]);

  // The lines as of the latest tap, not the latest render: two taps in the same frame must both count.
  const linesNow = useRef(basket.lines);
  useEffect(() => {
    linesNow.current = basket.lines;
  }, [basket.lines]);

  /** Applies a change computed from the latest lines; false when it was refused (the reason is shown). */
  const commit = useCallback(
    (change: (lines: BasketLine[]) => BasketChange): boolean => {
      const result = change(linesNow.current);
      const code = capCode(result.outcome);
      setLimitNote(code ? errorText(copy, code) : null);
      setSendError(null);
      if (result.outcome !== 'added') return false;
      linesNow.current = result.lines;
      setBasket((b) => ({ ...b, lines: result.lines }));
      return true;
    },
    [copy, setBasket],
  );

  const addDish = useCallback(
    (id: string) => {
      const found = index.get(id);
      if (!found) return;
      if (found.dish.groups.length > 0) {
        setLimitNote(null);
        setOptionsFor(id);
        setSheet('options');
        return;
      }
      commit((lines) => addToBasket(lines, id, [], 1, found.dish.name));
    },
    [index, commit],
  );
  const removeDish = useCallback((id: string) => void commit((lines) => ({ lines: removeOneOf(lines, id), outcome: 'added' })), [commit]);

  function addWithOptions(modifierIds: string[], qty: number) {
    if (optionsDish && commit((lines) => addToBasket(lines, optionsDish.id, modifierIds, qty, optionsDish.name))) setSheet(null);
  }

  async function sendOrder() {
    if (sendLock.current) return;
    const gate = sendGate(session, status);
    if (gate !== 'ok') {
      setSheet(gate === 'scan' ? 'scan' : gate === 'expired' ? 'expired' : gate === 'closed' ? 'closed' : 'ordersOff');
      return;
    }
    if (!online || !totals.canSend) return;
    sendLock.current = true;
    setOrderSending(true);
    setSendError(null);
    setLimitNote(null);

    // One key per attempt, held until the server answers: a double tap, a retry after a dropped reply
    // or a refresh in between all send the same key, so the database holds one order.
    const request = toRequest(basket.lines, basket.note);
    const attempt = attemptFor(basket.attempt, request, () => guestKey('send_guest_order', localStore()));
    setBasket((b) => ({ ...b, attempt }));
    const answer = await guestApi.order(request, attempt.key);
    sendLock.current = false;
    setOrderSending(false);

    const outcome = sendOutcome(answer);
    // Anything but "unclear" is the server's own answer: the attempt is over, the next send gets a new key.
    if (outcome.kind !== 'unclear') setBasket((b) => ({ ...b, attempt: null }));
    switch (outcome.kind) {
      case 'sent':
        linesNow.current = [];
        setBasket({ lines: [], note: '', attempt: null });
        setSheet(null);
        setStatus((prev) => (prev ? { ...prev, orders: [outcome.order, ...prev.orders.filter((o) => o.id !== outcome.order.id)] } : prev));
        if (!status) void refresh();
        break;
      case 'unclear':
        break; // the sheet says so and keeps its Send button: the same key goes again
      case 'expired':
        setSession('expired');
        setSheet('expired');
        break;
      case 'closed':
        setStatus((prev) => (prev ? { ...prev, dayOpen: false } : prev));
        setSheet('closed');
        break;
      case 'off':
        setStatus((prev) => (prev ? { ...prev, ordersEnabled: false } : prev));
        setSheet('ordersOff');
        break;
      case 'stale-menu':
        // The server expired its menu cache; this re-reads the page, and the changed line is marked.
        setSendError(errorText(copy, outcome.code));
        router.refresh();
        break;
      case 'message':
        setSendError(errorText(copy, outcome.code));
        break;
    }
  }

  function openCall() {
    switch (button.kind) {
      case 'ready':
        setCallError(null);
        setSheet('call');
        break;
      case 'scan':
        setSheet(button.why === 'expired' ? 'expired' : 'scan');
        break;
      case 'closed':
        setSheet('closed');
        break;
      case 'wait':
        setSheet('tooSoon');
        break;
    }
  }

  async function switchLanguage() {
    if (switching) return;
    setSwitching(true);
    const next: Locale = locale === 'ar' ? 'en' : 'ar';
    await guestApi.setLocale(next);
    router.refresh();
    setSwitching(false);
  }

  // The category rail follows the list's scroll.
  const listRef = useRef<HTMLElement>(null);
  const [active, setActive] = useState(0);
  const lockUntil = useRef(0);
  const frame = useRef(0);
  useEffect(() => () => cancelAnimationFrame(frame.current), []);

  function onListScroll() {
    if (frame.current) return;
    frame.current = requestAnimationFrame(() => {
      frame.current = 0;
      const list = listRef.current;
      if (!list || performance.now() < lockUntil.current) return;
      const tops = Array.from(list.querySelectorAll<HTMLElement>('[data-section]'), (el) => el.offsetTop);
      setActive(activeSectionIndex(tops, list.scrollTop, list.scrollTop + list.clientHeight >= list.scrollHeight - 2));
    });
  }

  function pickSection(index: number) {
    const list = listRef.current;
    const section = list?.querySelectorAll<HTMLElement>('[data-section]')[index];
    if (!list || !section) return;
    setActive(index);
    lockUntil.current = performance.now() + SCROLL_LOCK_MS;
    const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    list.scrollTo({ top: section.offsetTop, behavior: reduce ? 'auto' : 'smooth' });
  }

  const tableLabel = session === 'live' && status ? status.tableLabel : null;
  const notice: NoticeStrip = session === 'expired' ? 'scan-again' : status && session === 'live' && !status.dayOpen ? 'closed' : null;
  const otherLocale: Locale = locale === 'ar' ? 'en' : 'ar';
  const countdown = button.kind === 'wait' ? formatCountdown(button.msLeft) : '';
  const strips = session === 'live' ? orderStrips(orders, now, dismissed) : { waiting: null, decided: null };
  const orderSub = totals.empty ? null : fill(copy.order.barSub, { items: fill(copy.order.items[itemCountForm(totals.count, locale)], { count: totals.count }), total: formatIQD(totals.total, locale) });
  const optionsDish = optionsFor ? (index.get(optionsFor)?.dish ?? null) : null;
  const closeSheet = () => {
    setSheet(null);
    setLimitNote(null);
  };

  return (
    <div className="guest">
      <CornerOrnament />
      <div className="guest__body" inert={sheet !== null}>
        <header className="top">
          {tableLabel !== null && (
            <div className="plate" role="img" aria-label={fill(copy.table.label, { label: tableLabel })}>
              <span className="plate__word">{copy.table.word}</span>
              <bdi className="plate__label">{tableLabel}</bdi>
            </div>
          )}
          <h1 className="top__name">{venueName}</h1>
          <button type="button" className="top__lang" lang={otherLocale} aria-label={copy.lang.switch} disabled={switching} onClick={() => void switchLanguage()}>
            {copy.lang.short}
          </button>
        </header>
        <StarStrip />

        {menuState === 'ok' && menu && (
          <CategoryRail label={copy.menu.categories} tiles={menu.sections.map((s) => ({ id: s.id, name: s.name, icon: s.icon }))} activeIndex={active} onPick={pickSection} />
        )}

        <main className="list" ref={listRef} onScroll={onListScroll}>
          {menuState === 'error' && (
            <div className="state" role="alert">
              <p>{copy.menu.failed}</p>
              {/* A full reload: the failed read is never cached, so this asks the database again. */}
              {/* eslint-disable-next-line @next/next/no-html-link-for-pages */}
              <a className="state__retry" href="/">
                {copy.menu.retry}
              </a>
            </div>
          )}
          {menuState === 'empty' && <p className="state">{copy.menu.empty}</p>}
          {menuState === 'ok' &&
            menu?.sections.map((section) => (
              <section key={section.id} id={`cat-${section.id}`} className="section" data-section aria-labelledby={`cat-${section.id}-h`}>
                <h2 id={`cat-${section.id}-h`} className="section__head">
                  <CategoryIcon icon={section.icon} size={18} />
                  <span>{section.name}</span>
                  <span className="section__rule" aria-hidden="true" />
                  <Star size={10} tone="olive" />
                </h2>
                <ul className="rows">
                  {section.items.map((item) => (
                    <DishRow
                      key={item.id}
                      copy={copy}
                      id={item.id}
                      name={item.name}
                      price={item.price}
                      photoUrl={item.photoUrl}
                      icon={section.icon}
                      qty={quantities[item.id] ?? 0}
                      hasOptions={item.groups.length > 0}
                      readOnly={ordersOff}
                      onAdd={addDish}
                      onRemove={removeDish}
                    />
                  ))}
                </ul>
              </section>
            ))}
        </main>

        <StatusStrips
          copy={copy}
          notice={notice}
          call={session === 'live' ? callStrip(status?.call ?? null, now) : null}
          orders={strips}
          limit={sheet === null ? limitNote : null}
          offline={!online}
          onDismissOrder={(id) => setDismissed((prev) => new Set(prev).add(id))}
        />
        <BottomBar
          copy={copy}
          call={button}
          orderSub={orderSub}
          ordersOff={ordersOff}
          onCall={openCall}
          onOrder={() => {
            setSendError(null);
            setSheet('order');
          }}
        />
      </div>

      {sheet === 'call' && (
        <CallSheet copy={copy} tableLabel={tableLabel ?? ''} sending={sending} offline={!online} error={callError} onPick={(r) => void raise(r)} onClose={() => setSheet(null)} />
      )}
      {sheet === 'order' && (
        <OrderSheet
          copy={copy}
          locale={locale}
          tableLabel={tableLabel}
          lines={lineViews}
          totals={totals}
          note={basket.note}
          sending={orderSending}
          unclear={basket.attempt !== null}
          offline={!online}
          error={sendError ?? limitNote}
          onNote={(note) => setBasket((b) => ({ ...b, note }))}
          onStep={(id, delta) => void commit((lines) => changeLine(lines, id, delta))}
          onRemove={(id) => void commit((lines) => ({ lines: removeLine(lines, id), outcome: 'added' }))}
          onSend={() => void sendOrder()}
          onClose={closeSheet}
        />
      )}
      {sheet === 'options' && optionsDish && <OptionsSheet key={optionsDish.id} copy={copy} locale={locale} dish={optionsDish} error={limitNote} onAdd={addWithOptions} onClose={closeSheet} />}
      {sheet !== null && sheet !== 'call' && sheet !== 'order' && sheet !== 'options' && (
        <NoticeSheet copy={copy} kind={sheet} time={countdown || formatCountdown(0)} onClose={closeSheet} />
      )}
    </div>
  );
}
