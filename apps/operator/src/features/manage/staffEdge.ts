// Calls to the staff-admin edge function, with the user's JWT (supabase-js adds it).
import { AppRpcError } from '../../lib/appRpc';
import { supabase } from '../../lib/supabase';
import { edgeErrorCode } from './staffLogic';

async function invoke<T>(body: Record<string, unknown>): Promise<T> {
  const { data, error } = await supabase.functions.invoke('staff-admin', { body });
  if (error) {
    const code = await edgeErrorCode(error);
    throw new AppRpcError(code, code);
  }
  return data as T;
}

export const createStaffLogin = (a: { email: string; password: string; full_name: string; role: string }) =>
  invoke<{ staff_id: string }>({ action: 'create', ...a });

export const resetStaffPassword = (staffId: string, password: string) =>
  invoke<{ ok: true }>({ action: 'reset_password', staff_id: staffId, password });
