import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import type { MessageKey } from '@rop/i18n';
import { supabase } from './supabase';
import { clearIdleState } from './idleLogic';
import { staffFromRow, type StaffInfo } from './authLogic';
import type { AuthStatus } from './navLogic';

interface AuthValue {
  status: AuthStatus;
  staff: StaffInfo | null;
  /** Why the last sign-in was refused or ended (inactive account, ...). */
  message: MessageKey | null;
  /** Resolves to an error message key, or null on success. */
  signIn: (email: string, password: string) => Promise<MessageKey | null>;
  signOut: () => Promise<void>;
}

const Ctx = createContext<AuthValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const qc = useQueryClient();
  const [userId, setUserId] = useState<string | null | undefined>(undefined); // undefined: not known yet
  const [staff, setStaff] = useState<StaffInfo | null>(null);
  const [message, setMessage] = useState<MessageKey | null>(null);

  useEffect(() => {
    void supabase.auth.getSession().then(({ data }) => setUserId(data.session?.user.id ?? null));
    const { data } = supabase.auth.onAuthStateChange((_event, session) => {
      setUserId(session?.user.id ?? null);
    });
    return () => data.subscription.unsubscribe();
  }, []);

  // Load the staff row after the session is known (never inside onAuthStateChange: it would deadlock).
  useEffect(() => {
    if (userId === undefined) return;
    if (userId === null) {
      setStaff(null);
      qc.clear(); // a shared tablet must not show the previous person's cached data
      return;
    }
    let cancelled = false;
    void (async () => {
      const { data, error } = await supabase
        .from('staff')
        .select('id, full_name, role, venue_id, is_active')
        .eq('id', userId)
        .maybeSingle();
      if (cancelled) return;
      if (error) {
        setMessage('errors.network');
        await supabase.auth.signOut();
        return;
      }
      const result = staffFromRow(data);
      if ('staff' in result) {
        setStaff(result.staff);
      } else {
        setMessage(result.problem === 'inactive' ? 'auth.inactive' : 'auth.noStaff');
        await supabase.auth.signOut();
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [userId, qc]);

  const signIn = useCallback(async (email: string, password: string) => {
    setMessage(null);
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    return error ? ('auth.badCredentials' as MessageKey) : null;
  }, []);

  const signOut = useCallback(async () => {
    setMessage(null);
    try {
      clearIdleState(localStorage);
    } catch {
      /* storage blocked */
    }
    await supabase.auth.signOut();
  }, []);

  const value = useMemo<AuthValue>(() => {
    const status: AuthStatus = userId === undefined || (userId !== null && !staff) ? 'loading' : staff ? 'ready' : 'signedOut';
    return { status, staff, message, signIn, signOut };
  }, [userId, staff, message, signIn, signOut]);

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useAuth(): AuthValue {
  const v = useContext(Ctx);
  if (!v) throw new Error('useAuth needs <AuthProvider>');
  return v;
}
