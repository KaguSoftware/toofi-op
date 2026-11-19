-- 0100 staff_self_read: a signed-in person can always read their OWN staff row.
--
-- The existing staff_read policy needs app.staff_role() to be non-null, and that is null for
-- an inactive account. So a deactivated person's sign-in found no staff row at all and the app
-- said "not set up as staff" instead of "this account is not active". Reading your own row
-- reveals nothing new (name, role, active flag), and it grants no access to anything else:
-- every other policy and every function still checks app.staff_role().
create policy staff_self_read on staff for select to authenticated
  using (id = (select auth.uid()));
