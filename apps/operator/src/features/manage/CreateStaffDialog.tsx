import { useState } from 'react';
import { STAFF_ROLES, type StaffRole } from '@rop/core';
import { useLocale } from '../../lib/i18n';
import { EditDialog, SelectField, TextField } from './formKit';
import { hasErrors } from './menuLogic';
import { createStaffLogin } from './staffEdge';
import { validateCreateStaff } from './staffLogic';
import { useRun } from './shared';

export function CreateStaffDialog({ onClose }: { onClose: () => void }) {
  const { tr } = useLocale();
  const { busy, run } = useRun(['manage']);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [fullName, setName] = useState('');
  const [role, setRole] = useState<StaffRole | ''>('');
  const [tried, setTried] = useState(false);
  const errors = validateCreateStaff({ email, password, fullName, role });

  async function save() {
    setTried(true);
    if (hasErrors(errors) || !role) return;
    const r = await run(
      () => createStaffLogin({ email: email.trim(), password, full_name: fullName.trim(), role }),
      'manage.staff.created',
    );
    if (r.ok) onClose();
  }

  return (
    <EditDialog open title={tr('manage.staff.add')} onClose={onClose} onSave={() => void save()} busy={busy} saveLabel={tr('manage.staff.create')}>
      <TextField label={tr('manage.staff.fullName')} value={fullName} onChange={setName} error={tried ? errors.fullName : null} />
      <TextField label={tr('auth.email')} type="email" dir="ltr" autoComplete="off" value={email} onChange={setEmail} error={tried ? errors.email : null} />
      <TextField
        label={tr('manage.staff.tempPassword')}
        type="password"
        autoComplete="new-password"
        value={password}
        onChange={setPassword}
        hint={tr('manage.staff.tempPasswordHint')}
        error={tried ? errors.password : null}
      />
      <SelectField
        label={tr('manage.staff.role')}
        value={role}
        onChange={(v) => setRole(v as StaffRole | '')}
        placeholder={tr('manage.choose')}
        options={STAFF_ROLES.map((r) => ({ value: r, label: tr(`auth.role.${r}`) }))}
        error={tried ? errors.role : null}
      />
    </EditDialog>
  );
}
