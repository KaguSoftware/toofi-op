/**
 * Owner guard for edge functions. The gateway already verified the JWT
 * (verify_jwt = true); here we resolve the caller from it and require an ACTIVE
 * OWNER in `staff`, the role source of truth.
 *
 *   401 { error: 'AUTH_REQUIRED' }  no or invalid session
 *   403 { error: 'FORBIDDEN' }      not active staff, or not an owner
 */
import type { SupabaseClient } from 'npm:@supabase/supabase-js@2';
import { errorResponse, logError } from './http.ts';

export interface OwnerCaller {
  userId: string;
  venueId: string;
}

export async function requireOwner(req: Request, service: SupabaseClient): Promise<OwnerCaller | Response> {
  const token = (req.headers.get('Authorization') ?? '').replace(/^Bearer\s+/i, '').trim();
  if (!token) return errorResponse('AUTH_REQUIRED', 401);

  const { data: userData, error: userErr } = await service.auth.getUser(token);
  if (userErr || !userData.user) return errorResponse('AUTH_REQUIRED', 401);

  const { data, error } = await service
    .from('staff')
    .select('id, venue_id, role, is_active')
    .eq('id', userData.user.id)
    .maybeSingle();
  if (error) {
    logError('auth', error);
    return errorResponse('INTERNAL', 500);
  }
  if (!data || !data.is_active || data.role !== 'owner') return errorResponse('FORBIDDEN', 403);
  return { userId: userData.user.id, venueId: String(data.venue_id) };
}
