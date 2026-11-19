import { useState, type FormEvent } from 'react';
import { Button, Field } from '../../components';
import { useAuth } from '../../lib/auth';
import { useLocale } from '../../lib/i18n';

export function LoginScreen() {
  const { signIn, message } = useAuth();
  const { tr } = useLocale();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    const failure = await signIn(email.trim(), password);
    setError(failure ? tr(failure) : null);
    setBusy(false);
  }

  const shown = error ?? (message ? tr(message) : null);

  return (
    <section className="rop-login">
      <h1>{tr('auth.signInTitle')}</h1>
      <form onSubmit={submit} className="rop-form">
        <Field label={tr('auth.email')}>
          {(p) => (
            <input {...p} type="email" autoComplete="username" required autoFocus value={email} onChange={(e) => setEmail(e.target.value)} />
          )}
        </Field>
        <Field label={tr('auth.password')} error={shown}>
          {(p) => (
            <input {...p} type="password" autoComplete="current-password" required value={password} onChange={(e) => setPassword(e.target.value)} />
          )}
        </Field>
        <Button type="submit" variant="primary" busy={busy}>
          {busy ? tr('auth.signingIn') : tr('auth.signIn')}
        </Button>
      </form>
    </section>
  );
}
