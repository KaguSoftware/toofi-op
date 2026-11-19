-- 0063 venue settings and staff admin. Owner only. Creating a staff login (an auth
-- user) is the staff-admin edge function's job; these change an existing member.

-- A null argument leaves that setting unchanged.
create or replace function app.update_venue_settings(
  p_venue_name text default null,
  p_receipt_header_en text default null,
  p_receipt_header_ar text default null,
  p_receipt_footer_en text default null,
  p_receipt_footer_ar text default null,
  p_service_charge_bps int default null
) returns void
language plpgsql security definer set search_path = public as $update_venue_settings$
declare
  v_venue uuid := app.current_venue();
  v_before jsonb;
begin
  if not app.is_staff('owner') then
    raise exception 'FORBIDDEN' using errcode = 'P0001';
  end if;
  if p_venue_name is not null and btrim(p_venue_name) = '' then
    raise exception 'NAME_REQUIRED' using errcode = 'P0001';
  end if;
  if p_service_charge_bps is not null and (p_service_charge_bps < 0 or p_service_charge_bps > 10000) then
    raise exception 'SETTINGS_INVALID' using errcode = 'P0001';
  end if;

  insert into venue_settings (venue_id) values (v_venue) on conflict (venue_id) do nothing;
  select to_jsonb(s) || jsonb_build_object('venue_name', v.name) into v_before
    from venue_settings s join venues v on v.id = s.venue_id
   where s.venue_id = v_venue for update of s;

  update venue_settings
     set receipt_header_en  = coalesce(p_receipt_header_en, receipt_header_en),
         receipt_header_ar  = coalesce(p_receipt_header_ar, receipt_header_ar),
         receipt_footer_en  = coalesce(p_receipt_footer_en, receipt_footer_en),
         receipt_footer_ar  = coalesce(p_receipt_footer_ar, receipt_footer_ar),
         service_charge_bps = coalesce(p_service_charge_bps, service_charge_bps)
   where venue_id = v_venue;
  if p_venue_name is not null then
    update venues set name = btrim(p_venue_name) where id = v_venue;
  end if;

  perform app.write_audit('venue_settings.update', 'venue_settings', v_venue, v_before,
    (select to_jsonb(s) || jsonb_build_object('venue_name', v.name)
       from venue_settings s join venues v on v.id = s.venue_id where s.venue_id = v_venue));
end $update_venue_settings$;

create or replace function app.set_staff_role(p_staff_id uuid, p_role staff_role) returns void
language plpgsql security definer set search_path = public as $set_staff_role$
declare
  v_before staff_role;
begin
  if not app.is_staff('owner') then
    raise exception 'FORBIDDEN' using errcode = 'P0001';
  end if;
  if p_role is null then
    raise exception 'ROLE_REQUIRED' using errcode = 'P0001';
  end if;
  select s.role into v_before from staff s
   where s.id = p_staff_id and s.venue_id = app.current_venue() for update;
  if v_before is null then
    raise exception 'STAFF_NOT_FOUND' using errcode = 'P0001';
  end if;
  -- An owner cannot demote themselves: that could leave the venue with no owner.
  if p_staff_id = auth.uid() and p_role <> v_before then
    raise exception 'CANNOT_CHANGE_OWN_ROLE' using errcode = 'P0001';
  end if;
  update staff set role = p_role where id = p_staff_id;
  perform app.write_audit('staff.set_role', 'staff', p_staff_id,
    jsonb_build_object('role', v_before), jsonb_build_object('role', p_role));
end $set_staff_role$;

create or replace function app.set_staff_active(p_staff_id uuid, p_active boolean) returns void
language plpgsql security definer set search_path = public as $set_staff_active$
declare
  v_before boolean;
begin
  if not app.is_staff('owner') then
    raise exception 'FORBIDDEN' using errcode = 'P0001';
  end if;
  if p_active is null then
    raise exception 'ACTIVE_FLAG_REQUIRED' using errcode = 'P0001';
  end if;
  select s.is_active into v_before from staff s
   where s.id = p_staff_id and s.venue_id = app.current_venue() for update;
  if v_before is null then
    raise exception 'STAFF_NOT_FOUND' using errcode = 'P0001';
  end if;
  if p_staff_id = auth.uid() and not p_active then
    raise exception 'CANNOT_DEACTIVATE_SELF' using errcode = 'P0001';
  end if;
  update staff set is_active = p_active where id = p_staff_id;
  perform app.write_audit('staff.set_active', 'staff', p_staff_id,
    jsonb_build_object('is_active', v_before), jsonb_build_object('is_active', p_active));
end $set_staff_active$;

-- Sets another member's PIN. The PIN itself is never audited.
create or replace function app.set_staff_pin(p_staff_id uuid, p_pin text) returns void
language plpgsql security definer set search_path = public as $set_staff_pin$
begin
  if not app.is_staff('owner') then
    raise exception 'FORBIDDEN' using errcode = 'P0001';
  end if;
  if p_pin is null or p_pin !~ '^[0-9]{6,12}$' then
    raise exception 'PIN_FORMAT' using errcode = 'P0001';
  end if;
  if app.pin_is_weak(p_pin) then
    raise exception 'PIN_WEAK' using errcode = 'P0001';
  end if;
  update staff
     set pin_hash = extensions.crypt(p_pin, extensions.gen_salt('bf'))
   where id = p_staff_id and venue_id = app.current_venue();
  if not found then
    raise exception 'STAFF_NOT_FOUND' using errcode = 'P0001';
  end if;
  perform app.write_audit('staff.pin_set_by_owner', 'staff', p_staff_id);
end $set_staff_pin$;

revoke all on function app.update_venue_settings(text, text, text, text, text, int) from public, anon, authenticated;
revoke all on function app.set_staff_role(uuid, staff_role) from public, anon, authenticated;
revoke all on function app.set_staff_active(uuid, boolean) from public, anon, authenticated;
revoke all on function app.set_staff_pin(uuid, text) from public, anon, authenticated;
grant execute on function app.update_venue_settings(text, text, text, text, text, int) to authenticated;
grant execute on function app.set_staff_role(uuid, staff_role) to authenticated;
grant execute on function app.set_staff_active(uuid, boolean) to authenticated;
grant execute on function app.set_staff_pin(uuid, text) to authenticated;
