import { useEffect, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { STAFF_ROLES, isStaffRole, type StaffRole } from '@rop/core';
import { Button, DataTable, ErrorState, Loading, PageHeader, type Column } from '../../components';
import { appRpc } from '../../lib/appRpc';
import { useAuth } from '../../lib/auth';
import { useLocale } from '../../lib/i18n';
import { QK } from '../../lib/queryKeys';
import { CreateStaffDialog } from './CreateStaffDialog';
import { ActiveToggle, EditDialog, TextField } from './formKit';
import { resetStaffPassword } from './staffEdge';
import { MIN_PASSWORD, parseVarianceAlert, validatePin } from './staffLogic';
import { selectRows, useRun } from './shared';
import './manage.css';

interface StaffRow {
  id: string;
  full_name: string;
  role: StaffRole;
  is_active: boolean;
}
interface Settings {
  venue_name: string;
  receipt_header_en: string;
  receipt_header_ar: string;
  receipt_footer_en: string;
  receipt_footer_ar: string;
  /** Text field; '' = leave unchanged / not available. */
  variance_alert_iqd: string;
}

/** The variance threshold lives in a column the backend adds separately: if it is missing the form still works. */
async function fetchVarianceAlert(): Promise<string> {
  try {
    const rows = await selectRows<{ variance_alert_iqd: number | null }>('venue_settings', 'variance_alert_iqd');
    const v = rows[0]?.variance_alert_iqd;
    return typeof v === 'number' ? String(v) : '';
  } catch {
    return '';
  }
}

async function fetchSettings(): Promise<Settings> {
  const [venues, settings, variance] = await Promise.all([
    selectRows<{ name: string }>('venues', 'name'),
    selectRows<Omit<Settings, 'venue_name' | 'variance_alert_iqd'>>('venue_settings', 'receipt_header_en, receipt_header_ar, receipt_footer_en, receipt_footer_ar'),
    fetchVarianceAlert(),
  ]);
  return {
    venue_name: venues[0]?.name ?? '',
    receipt_header_en: settings[0]?.receipt_header_en ?? '',
    receipt_header_ar: settings[0]?.receipt_header_ar ?? '',
    receipt_footer_en: settings[0]?.receipt_footer_en ?? '',
    receipt_footer_ar: settings[0]?.receipt_footer_ar ?? '',
    variance_alert_iqd: variance,
  };
}

export function StaffScreen() {
  const { tr } = useLocale();
  const { staff: me } = useAuth();
  const q = useQuery({
    queryKey: QK.manage('staff'),
    queryFn: () => selectRows<StaffRow>('staff', 'id, full_name, role, is_active', { order: 'full_name' }),
  });
  const { busy, run } = useRun(['manage']);
  const [creating, setCreating] = useState(false);
  const [pinFor, setPinFor] = useState<StaffRow | null>(null);
  const [pwFor, setPwFor] = useState<StaffRow | null>(null);

  if (q.isPending) return <Loading />;
  if (q.error) return <ErrorState error={q.error} onRetry={() => void q.refetch()} />;

  const cols: Column<StaffRow>[] = [
    { key: 'name', header: tr('manage.staff.fullName'), cell: (s) => s.full_name },
    {
      key: 'role',
      header: tr('manage.staff.role'),
      cell: (s) => (
        <select
          aria-label={tr('manage.staff.roleOf', { name: s.full_name })}
          value={s.role}
          disabled={busy || s.id === me?.id}
          onChange={(e) => {
            const role = e.target.value;
            if (isStaffRole(role)) void run(() => appRpc('set_staff_role', { p_staff_id: s.id, p_role: role }), 'manage.saved');
          }}
        >
          {STAFF_ROLES.map((r) => (
            <option key={r} value={r}>
              {tr(`auth.role.${r}`)}
            </option>
          ))}
        </select>
      ),
    },
    { key: 'active', header: tr('manage.menu.status'), cell: (s) => tr(s.is_active ? 'manage.active' : 'manage.inactive') },
    {
      key: 'actions',
      header: tr('manage.actions'),
      cell: (s) => (
        <span className="manage__row">
          {s.id !== me?.id && (
            <ActiveToggle
              active={s.is_active}
              busy={busy}
              onToggle={() => void run(() => appRpc('set_staff_active', { p_staff_id: s.id, p_active: !s.is_active }), 'manage.saved')}
            />
          )}
          <Button onClick={() => setPinFor(s)}>{tr('manage.staff.setPin')}</Button>
          <Button onClick={() => setPwFor(s)}>{tr('manage.staff.resetPassword')}</Button>
        </span>
      ),
    },
  ];

  return (
    <section className="manage manage--setup">
      <PageHeader
        title={tr('manage.staffTitle')} icon="staff" tone="accent"
        actions={
          <Button variant="primary" onClick={() => setCreating(true)}>
            {tr('manage.staff.add')}
          </Button>
        }
      />
      <DataTable columns={cols} rows={q.data} rowKey={(s) => s.id} caption={tr('manage.staff.list')} />

      <VenueSettingsForm />

      {creating && <CreateStaffDialog onClose={() => setCreating(false)} />}
      {pinFor && <PinDialog staff={pinFor} onClose={() => setPinFor(null)} />}
      {pwFor && <PasswordDialog staff={pwFor} onClose={() => setPwFor(null)} />}
    </section>
  );
}

function PinDialog({ staff, onClose }: { staff: StaffRow; onClose: () => void }) {
  const { tr } = useLocale();
  const { busy, run } = useRun(['manage']);
  const [pin, setPin] = useState('');
  const [tried, setTried] = useState(false);
  const error = validatePin(pin);
  async function save() {
    setTried(true);
    if (error) return;
    const r = await run(() => appRpc('set_staff_pin', { p_staff_id: staff.id, p_pin: pin }), 'manage.staff.pinSet');
    if (r.ok) onClose();
  }
  return (
    <EditDialog open title={tr('manage.staff.setPinFor', { name: staff.full_name })} onClose={onClose} onSave={() => void save()} busy={busy}>
      <TextField label={tr('common.pinLabel')} type="password" autoComplete="off" value={pin} onChange={setPin} hint={tr('manage.staff.pinHint')} error={tried ? error : null} />
    </EditDialog>
  );
}

function PasswordDialog({ staff, onClose }: { staff: StaffRow; onClose: () => void }) {
  const { tr } = useLocale();
  const { busy, run } = useRun(['manage']);
  const [pw, setPw] = useState('');
  const [tried, setTried] = useState(false);
  const error = pw.length < MIN_PASSWORD ? 'manage.err.passwordShort' : null;
  async function save() {
    setTried(true);
    if (error) return;
    const r = await run(() => resetStaffPassword(staff.id, pw), 'manage.staff.passwordReset');
    if (r.ok) onClose();
  }
  return (
    <EditDialog open title={tr('manage.staff.resetFor', { name: staff.full_name })} onClose={onClose} onSave={() => void save()} busy={busy}>
      <TextField
        label={tr('manage.staff.tempPassword')}
        type="password"
        autoComplete="new-password"
        value={pw}
        onChange={setPw}
        hint={tr('manage.staff.tempPasswordHint')}
        error={tried ? error : null}
      />
    </EditDialog>
  );
}

function VenueSettingsForm() {
  const { tr } = useLocale();
  const q = useQuery({ queryKey: QK.manage('settings'), queryFn: fetchSettings });
  const { busy, run } = useRun(['manage']);
  const [form, setForm] = useState<Settings | null>(null);
  useEffect(() => {
    if (q.data) setForm((f) => f ?? q.data);
  }, [q.data]);

  if (q.isPending || !form) return q.error ? <ErrorState error={q.error} onRetry={() => void q.refetch()} /> : <Loading />;
  const set = (k: keyof Settings) => (v: string) => setForm({ ...form, [k]: v });
  const nameMissing = !form.venue_name.trim();
  const threshold = parseVarianceAlert(form.variance_alert_iqd);
  const thresholdBad = threshold === 'invalid';

  return (
    <section>
      <h2>{tr('manage.settings.title')}</h2>
      <form
        className="manage__form"
        onSubmit={(e) => {
          e.preventDefault();
          if (nameMissing || thresholdBad) return;
          void run(
            () =>
              appRpc('update_venue_settings', {
                p_venue_name: form.venue_name.trim(),
                p_receipt_header_en: form.receipt_header_en,
                p_receipt_header_ar: form.receipt_header_ar,
                p_receipt_footer_en: form.receipt_footer_en,
                p_receipt_footer_ar: form.receipt_footer_ar,
                ...(threshold === 'unset' ? {} : { p_variance_alert_iqd: threshold }),
              }),
            'manage.saved',
          );
        }}
      >
        <TextField label={tr('manage.settings.venueName')} value={form.venue_name} onChange={set('venue_name')} error={nameMissing ? 'manage.err.nameRequired' : null} />
        <TextField label={tr('manage.settings.headerEn')} value={form.receipt_header_en} onChange={set('receipt_header_en')} dir="ltr" />
        <TextField label={tr('manage.settings.headerAr')} value={form.receipt_header_ar} onChange={set('receipt_header_ar')} dir="rtl" />
        <TextField label={tr('manage.settings.footerEn')} value={form.receipt_footer_en} onChange={set('receipt_footer_en')} dir="ltr" />
        <TextField label={tr('manage.settings.footerAr')} value={form.receipt_footer_ar} onChange={set('receipt_footer_ar')} dir="rtl" />
        <TextField
          label={tr('manage.settings.varianceAlert')}
          value={form.variance_alert_iqd}
          onChange={set('variance_alert_iqd')}
          hint={tr('manage.settings.varianceAlertHint')}
          error={thresholdBad ? 'manage.err.gridInvalid' : null}
          dir="ltr"
        />
        <div>
          <Button type="submit" variant="primary" busy={busy} disabled={nameMissing || thresholdBad}>
            {tr('common.save')}
          </Button>
        </div>
      </form>
    </section>
  );
}
