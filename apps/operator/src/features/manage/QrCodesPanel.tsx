import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { can } from '@rop/core';
import { Button, ConfirmDialog, DataTable, ErrorState, Icon, Loading, useToast, type Column } from '../../components';
import { appRpc } from '../../lib/appRpc';
import { useAuth } from '../../lib/auth';
import { useLocale } from '../../lib/i18n';
import { QK } from '../../lib/queryKeys';
import { OnOff } from './GuestKit';
import { QrCard } from './QrCard';
import { menuSiteBase, sortForPrint, tableUrl, type MenuSite } from './qrLogic';
import { useRun } from './shared';

interface TableCode {
  table_id: string;
  label: string;
  area_id: string;
  token: string;
  guest_enabled: boolean;
}

const TOKENS_KEY = QK.manage('qr-tokens');

/**
 * Every call to table_qr_tokens writes an audit row, so this view reads once when it opens and
 * never again on focus or reconnect. The tokens are not kept after the view closes (gcTime 0)
 * and the 'manage' area is never written to localStorage.
 */
function fetchTokens(): Promise<TableCode[]> {
  return appRpc<TableCode[]>('table_qr_tokens');
}

export function QrCodesPanel({ areaName }: { areaName: (areaId: string) => string }) {
  const { tr } = useLocale();
  const { staff } = useAuth();
  const qc = useQueryClient();
  const toast = useToast();
  const { busy, run } = useRun([]);
  const q = useQuery({
    queryKey: TOKENS_KEY,
    queryFn: fetchTokens,
    enabled: staff !== null && can(staff.role, 'printTableCodes'),
    staleTime: Infinity,
    gcTime: 0,
    refetchOnWindowFocus: false,
    refetchOnReconnect: false,
  });
  const [printing, setPrinting] = useState<TableCode[] | null>(null);
  const [replacing, setReplacing] = useState<TableCode | null>(null);

  if (!staff || !can(staff.role, 'printTableCodes')) return null;
  const site: MenuSite = menuSiteBase(import.meta.env.VITE_MENU_URL, import.meta.env.PROD);
  if (q.isPending) return <Loading />;
  if (q.error) return <ErrorState error={q.error} onRetry={() => void q.refetch()} />;
  const rows = sortForPrint(q.data);
  const mayReplace = can(staff.role, 'replaceTableCode');
  const maySwitch = can(staff.role, 'setGuestSwitches');

  async function setEnabled(t: TableCode, enabled: boolean) {
    const r = await run(() => appRpc('set_table_guest_enabled', { p_table_id: t.table_id, p_enabled: enabled }));
    // Update the list we hold: reading the tokens again would add an audit row for a switch.
    if (r.ok) qc.setQueryData<TableCode[]>(TOKENS_KEY, (old) => old?.map((x) => (x.table_id === t.table_id ? { ...x, guest_enabled: enabled } : x)));
  }

  async function replace(t: TableCode) {
    const r = await run(() => appRpc('rotate_table_token', { p_table_id: t.table_id }));
    setReplacing(null);
    if (!r.ok) return;
    toast(tr('guestSetup.replaced', { label: t.label }), 'success');
    await qc.invalidateQueries({ queryKey: TOKENS_KEY }); // the new card needs the new token
  }

  const cols: Column<TableCode>[] = [
    { key: 'label', header: tr('manage.floor.label'), cell: (t) => <strong>{t.label}</strong> },
    { key: 'area', header: tr('manage.floor.area'), cell: (t) => areaName(t.area_id) },
    ...(maySwitch
      ? [
          {
            key: 'guests',
            header: tr('guestSetup.guestSwitch'),
            cell: (t: TableCode) => (
              <OnOff label={tr('guestSetup.tableSwitch', { label: t.label })} on={t.guest_enabled} busy={busy} onChange={(v) => void setEnabled(t, v)} />
            ),
          },
        ]
      : []),
    {
      key: 'actions',
      header: tr('manage.actions'),
      cell: (t) => (
        <span className="manage__row">
          <Button disabled={!site.ok} aria-label={tr('guestSetup.printOneFor', { label: t.label })} onClick={() => setPrinting([t])}>
            <Icon name="print" size={20} />
            {tr('guestSetup.printOne')}
          </Button>
          {mayReplace && (
            <Button variant="danger" disabled={busy} aria-label={tr('guestSetup.replaceFor', { label: t.label })} onClick={() => setReplacing(t)}>
              {tr('guestSetup.replace')}
            </Button>
          )}
        </span>
      ),
    },
  ];

  return (
    <section aria-labelledby="qr-codes-title">
      <header className="manage__section-head">
        <h2 id="qr-codes-title">{tr('guestSetup.viewCodes')}</h2>
        <Button variant="primary" disabled={!site.ok || rows.length === 0} onClick={() => setPrinting(rows)}>
          <Icon name="print" size={20} />
          {tr('guestSetup.printAll')}
        </Button>
      </header>
      <p className="manage__note">{tr('guestSetup.codesHint')}</p>
      {!site.ok && (
        <div role="alert" className="manage__notice">
          <p>{tr(site.reason === 'missing' ? 'guestSetup.siteMissing' : site.reason === 'local' ? 'guestSetup.siteLocal' : 'guestSetup.siteInvalid')}</p>
        </div>
      )}
      <DataTable columns={cols} rows={rows} rowKey={(t) => t.table_id} caption={tr('guestSetup.codesCaption')} emptyMessage={tr('guestSetup.noTables')} />
      {printing && site.ok && <PrintSheet cards={printing.map((t) => ({ id: t.table_id, label: t.label, url: tableUrl(site.base, t.token) }))} onDone={() => setPrinting(null)} />}
      {replacing && (
        <ConfirmDialog
          open
          danger
          busy={busy}
          title={tr('guestSetup.replaceTitle', { label: replacing.label })}
          message={tr('guestSetup.replaceMessage')}
          confirmLabel={tr('guestSetup.replaceConfirm')}
          onConfirm={() => void replace(replacing)}
          onCancel={() => setReplacing(null)}
        />
      )}
    </section>
  );
}

/** The cards, mounted only while printing. The print stylesheet hides the app and shows only this. */
function PrintSheet({ cards, onDone }: { cards: { id: string; label: string; url: string }[]; onDone: () => void }) {
  const printed = useRef(false); // development mounts effects twice; the dialog must open once
  useEffect(() => {
    document.body.classList.add('qr-printing');
    const finish = () => {
      document.body.classList.remove('qr-printing');
      onDone();
    };
    window.addEventListener('afterprint', finish, { once: true });
    if (!printed.current) {
      printed.current = true;
      window.print();
    }
    return () => {
      window.removeEventListener('afterprint', finish);
      document.body.classList.remove('qr-printing');
    };
    // The cards are fixed for the life of this sheet.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  return createPortal(
    <div className="qr-sheet">
      {cards.map((c) => (
        <div key={c.id} className="qr-sheet__page">
          <QrCard label={c.label} url={c.url} />
        </div>
      ))}
    </div>,
    document.body,
  );
}
