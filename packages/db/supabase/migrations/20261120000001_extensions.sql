-- 0001 extensions.
-- pgcrypto: crypt()/gen_salt() for staff PINs. On Supabase it lives in the
-- `extensions` schema, so functions pinned to `search_path = public` call it
-- qualified: extensions.crypt(...), extensions.gen_salt('bf').
-- gen_random_uuid() is core Postgres (13+), no extension needed.

create extension if not exists pgcrypto with schema extensions;
