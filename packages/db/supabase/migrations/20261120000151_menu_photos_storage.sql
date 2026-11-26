-- 0151 the `menu-photos` storage bucket and its policies on storage.objects.
-- Modelled on TouchPadel's `menu-media` bucket, adapted to our helpers.
--
-- This is the one place a client writes a table: the staff app uploads a dish
-- photo straight to Storage (the Storage API writes storage.objects as the signed-in
-- user, under these policies), then records the path with app.set_menu_item_photo.
--
--   read     anyone (public bucket; the guest site builds
--            {SUPABASE_URL}/storage/v1/object/public/menu-photos/{photo_path})
--   write    manager or owner, and only under their own venue's folder
--            ({venue_id}/...); Storage itself enforces 1 MB and WebP or JPEG.

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('menu-photos', 'menu-photos', true, 1048576, array['image/webp', 'image/jpeg'])
on conflict (id) do update
  set public             = excluded.public,
      file_size_limit    = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;

create policy menu_photos_read on storage.objects
  for select to anon, authenticated
  using (bucket_id = 'menu-photos');

create policy menu_photos_insert on storage.objects
  for insert to authenticated
  with check (bucket_id = 'menu-photos'
              and (select app.is_staff('manager', 'owner'))
              and (storage.foldername(name))[1] = (select app.current_venue())::text);

create policy menu_photos_update on storage.objects
  for update to authenticated
  using      (bucket_id = 'menu-photos'
              and (select app.is_staff('manager', 'owner'))
              and (storage.foldername(name))[1] = (select app.current_venue())::text)
  with check (bucket_id = 'menu-photos'
              and (select app.is_staff('manager', 'owner'))
              and (storage.foldername(name))[1] = (select app.current_venue())::text);

create policy menu_photos_delete on storage.objects
  for delete to authenticated
  using (bucket_id = 'menu-photos'
         and (select app.is_staff('manager', 'owner'))
         and (storage.foldername(name))[1] = (select app.current_venue())::text);
