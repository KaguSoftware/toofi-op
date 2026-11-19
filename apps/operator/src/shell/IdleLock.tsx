import { useEffect, useRef, useState, type FormEvent } from 'react';
import { Button, Field, Modal } from '../components';
import { appRpc } from '../lib/appRpc';
import { useAuth } from '../lib/auth';
import { errorMessage } from '../lib/errors';
import { useLocale } from '../lib/i18n';
import {
  IDLE_MINUTES_KEY,
  clearIdleState,
  isIdle,
  msUntilIdle,
  ownPinAccepted,
  parseIdleMinutes,
  saveIdleState,
  shouldLockOnBoot,
} from '../lib/idleLogic';

function savedMinutes(): number {
  try {
    return parseIdleMinutes(localStorage.getItem(IDLE_MINUTES_KEY));
  } catch {
    return parseIdleMinutes(null);
  }
}

function safeStore(): Storage | null {
  try {
    return localStorage;
  } catch {
    return null;
  }
}

const ACTIVITY_EVENTS = ['pointerdown', 'keydown', 'touchstart'] as const;

/** After N idle minutes, covers the app with a PIN prompt (app.verify_own_pin). */
export function IdleLock() {
  const { signOut } = useAuth();
  const { tr, locale } = useLocale();
  // Lazy: a reload with a saved lock (or a stale last activity) starts locked, on the first render.
  const [locked, setLockedState] = useState(() => shouldLockOnBoot(safeStore(), Date.now(), savedMinutes()));
  const [pin, setPin] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const last = useRef(Date.now());
  const setLocked = (v: boolean) => {
    setLockedState(v);
    saveIdleState(safeStore(), { locked: v, lastActivityMs: last.current });
  };

  useEffect(() => {
    if (locked) return;
    const minutes = savedMinutes();
    let lastSaved = 0;
    const touch = () => {
      last.current = Date.now();
      if (last.current - lastSaved > 5000) {
        lastSaved = last.current;
        saveIdleState(safeStore(), { locked: false, lastActivityMs: last.current });
      }
    };
    saveIdleState(safeStore(), { locked: false, lastActivityMs: last.current });
    ACTIVITY_EVENTS.forEach((e) => window.addEventListener(e, touch, { passive: true }));
    let timer: ReturnType<typeof setTimeout>;
    const check = () => {
      const now = Date.now();
      if (isIdle(last.current, now, minutes)) setLocked(true);
      else timer = setTimeout(check, Math.max(1000, msUntilIdle(last.current, now, minutes)));
    };
    timer = setTimeout(check, msUntilIdle(last.current, Date.now(), minutes));
    return () => {
      clearTimeout(timer);
      ACTIVITY_EVENTS.forEach((e) => window.removeEventListener(e, touch));
    };
  }, [locked]);

  async function unlock(e: FormEvent) {
    e.preventDefault();
    if (busy || !pin) return;
    setBusy(true);
    setError(null);
    try {
      const ok = ownPinAccepted(await appRpc('verify_own_pin', { p_pin: pin }));
      if (ok) {
        last.current = Date.now();
        setLocked(false);
      } else {
        setError(errorMessage({ code: 'PIN_INVALID' }, locale));
      }
      setPin('');
    } catch (err) {
      setError(errorMessage(err, locale));
    } finally {
      setBusy(false);
    }
  }

  async function switchUser() {
    setLockedState(false);
    clearIdleState(safeStore());
    setPin('');
    await signOut();
  }

  return (
    <Modal open={locked} title={tr('auth.lockedTitle')} onClose={() => undefined} dismissible={false}>
      <form onSubmit={unlock} className="rop-form">
        <p>{tr('auth.lockedHint')}</p>
        <Field label={tr('common.pinLabel')} error={error}>
          {(p) => (
            <input {...p} type="password" inputMode="numeric" autoComplete="off" autoFocus value={pin} onChange={(e) => setPin(e.target.value)} />
          )}
        </Field>
        <div className="rop-modal__footer">
          <Button onClick={() => void switchUser()}>{tr('auth.switchUser')}</Button>
          <Button type="submit" variant="primary" busy={busy}>
            {tr('auth.unlock')}
          </Button>
        </div>
      </form>
    </Modal>
  );
}
