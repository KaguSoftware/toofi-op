/**
 * staff-admin: owner-only creation of staff logins and password resets.
 *
 * POST /functions/v1/staff-admin   (Authorization: Bearer <owner session JWT>)
 *
 *   { action: 'create', email, password, full_name, role }
 *       -> 201 { staff_id }
 *       Creates the auth user (email confirmed) and its `staff` row, all or
 *       nothing: if the staff insert fails the auth user is deleted again.
 *       The audit row is part of the all or nothing: if it cannot be written,
 *       the staff row and the auth user are removed again and the answer is 500.
 *   { action: 'reset_password', staff_id, password }
 *       -> 200 { ok: true }
 *       The audit row is written FIRST (a 500 if it cannot be), so no reset
 *       ever goes unaudited; then the password is set and every existing session
 *       of that person is ended (app.revoke_user_sessions), so an old login on a
 *       lost or shared device stops working.
 *
 * Errors are plain JSON { error: CODE } with the status:
 *   400 BAD_REQUEST | NAME_REQUIRED | ROLE_REQUIRED | PASSWORD_TOO_SHORT | INVALID_EMAIL
 *   401 AUTH_REQUIRED   403 FORBIDDEN   404 STAFF_NOT_FOUND
 *   409 EMAIL_TAKEN     500 INTERNAL
 * Role and active-state changes and PINs are SQL functions (set_staff_role,
 * set_staff_active, set_staff_pin), not this endpoint.
 */
import { createClient } from 'npm:@supabase/supabase-js@2';
import { requireOwner } from '../_shared/auth.ts';
import { errorResponse, handle, isUuid, json, logError, readJsonBody } from '../_shared/http.ts';

const ROLES = ['waiter', 'cashier', 'manager', 'owner'];
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const MIN_PASSWORD = 8;

Deno.serve(
  handle('staff-admin', async (req) => {
    if (req.method !== 'POST') return errorResponse('BAD_REQUEST', 405);

    const service = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, {
      auth: { persistSession: false, autoRefreshToken: false },
    });

    const caller = await requireOwner(req, service);
    if (caller instanceof Response) return caller;

    const body = await readJsonBody(req);
    if (!body) return errorResponse('BAD_REQUEST', 400);

    const password = typeof body.password === 'string' ? body.password : '';
    if (password.length < MIN_PASSWORD) return errorResponse('PASSWORD_TOO_SHORT', 400);

    if (body.action === 'reset_password') {
      if (!isUuid(body.staff_id)) return errorResponse('BAD_REQUEST', 400);
      const { data: member, error: lookupErr } = await service
        .from('staff')
        .select('id')
        .eq('id', body.staff_id)
        .eq('venue_id', caller.venueId)
        .maybeSingle();
      if (lookupErr) {
        logError('staff-admin', lookupErr);
        return errorResponse('INTERNAL', 500);
      }
      if (!member) return errorResponse('STAFF_NOT_FOUND', 404);
      if (!(await audit(service, caller, 'staff.password_reset', body.staff_id, null))) {
        return errorResponse('INTERNAL', 500);
      }
      const { error } = await service.auth.admin.updateUserById(body.staff_id, { password });
      if (error) {
        logError('staff-admin', error);
        return errorResponse('INTERNAL', 500);
      }
      const { error: signOutErr } = await service
        .schema('app')
        .rpc('revoke_user_sessions', { p_user_id: body.staff_id });
      if (signOutErr) {
        logError('staff-admin', signOutErr);
        return errorResponse('INTERNAL', 500);
      }
      return json({ ok: true });
    }

    if (body.action === 'create') {
      const email = typeof body.email === 'string' ? body.email.trim().toLowerCase() : '';
      const fullName = typeof body.full_name === 'string' ? body.full_name.trim() : '';
      const role = typeof body.role === 'string' ? body.role : '';
      if (!EMAIL.test(email)) return errorResponse('INVALID_EMAIL', 400);
      if (!fullName) return errorResponse('NAME_REQUIRED', 400);
      if (!ROLES.includes(role)) return errorResponse('ROLE_REQUIRED', 400);

      const { data: created, error: createErr } = await service.auth.admin.createUser({
        email,
        password,
        email_confirm: true,
      });
      if (createErr || !created.user) {
        if (createErr && /already|registered|exists/i.test(createErr.message)) {
          return errorResponse('EMAIL_TAKEN', 409);
        }
        logError('staff-admin', createErr);
        return errorResponse('INTERNAL', 500);
      }

      const { error: insertErr } = await service
        .from('staff')
        .insert({ id: created.user.id, venue_id: caller.venueId, full_name: fullName, role });
      if (insertErr) {
        logError('staff-admin', insertErr);
        // All or nothing: no orphan login.
        const { error: delErr } = await service.auth.admin.deleteUser(created.user.id);
        if (delErr) logError('staff-admin', delErr);
        return errorResponse('INTERNAL', 500);
      }
      if (!(await audit(service, caller, 'staff.create', created.user.id, { full_name: fullName, role, email }))) {
        // All or nothing includes the audit: no login nobody can account for.
        const { error: rowErr } = await service.from('staff').delete().eq('id', created.user.id);
        if (rowErr) logError('staff-admin', rowErr);
        const { error: delErr } = await service.auth.admin.deleteUser(created.user.id);
        if (delErr) logError('staff-admin', delErr);
        return errorResponse('INTERNAL', 500);
      }
      return json({ staff_id: created.user.id }, 201);
    }

    return errorResponse('BAD_REQUEST', 400);
  }),
);

/** Audit through the service role (no auth.uid() here, so the actor is passed). Never throws; false when the row was not written. */
async function audit(
  service: ReturnType<typeof createClient>,
  caller: { userId: string; venueId: string },
  action: string,
  staffId: string,
  after: Record<string, unknown> | null,
): Promise<boolean> {
  const { error } = await service.from('audit_log').insert({
    venue_id: caller.venueId,
    actor_id: caller.userId,
    action,
    entity: 'staff',
    entity_id: staffId,
    after,
  });
  if (error) {
    logError('staff-admin', error);
    return false;
  }
  return true;
}
