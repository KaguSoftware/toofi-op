-- 0152 app.guest_menu() recreated (same signature, same grant to anon) so each
-- category carries `icon` and each item carries `photo_path` (null when none).
-- Nothing else changes; the body is 0142's with those two keys.
--
-- app.guest_menu() -> {venue: {name}, categories: [{id, name_en, name_ar, sort, icon,
--   items: [{id, name_en, name_ar, price, sort, photo_path, modifier_groups: [{id,
--   name_en, name_ar, min_select, max_select, modifiers: [{id, name_en, name_ar,
--   price_delta}]}]}]}]}

create or replace function app.guest_menu() returns jsonb
language sql stable security definer set search_path = public as $guest_menu$
  with v as (select v.id, v.name from venues v where v.id = app.current_venue())
  select jsonb_build_object(
    'venue', (select jsonb_build_object('name', v.name) from v),
    'categories', coalesce((
      select jsonb_agg(jsonb_build_object(
               'id', c.id, 'name_en', c.name_en, 'name_ar', c.name_ar, 'sort', c.sort, 'icon', c.icon,
               'items', (
                 select jsonb_agg(jsonb_build_object(
                          'id', i.id, 'name_en', i.name_en, 'name_ar', i.name_ar,
                          'price', i.price, 'sort', i.sort, 'photo_path', i.photo_path,
                          'modifier_groups', coalesce((
                            select jsonb_agg(jsonb_build_object(
                                     'id', g.id, 'name_en', g.name_en, 'name_ar', g.name_ar,
                                     'min_select', g.min_select, 'max_select', g.max_select,
                                     'modifiers', coalesce((
                                       select jsonb_agg(jsonb_build_object(
                                                'id', m.id, 'name_en', m.name_en, 'name_ar', m.name_ar,
                                                'price_delta', m.price_delta)
                                              order by m.created_at, m.id)
                                         from modifiers m
                                        where m.group_id = g.id and m.is_active), '[]'::jsonb))
                                   order by g.created_at, g.id)
                              from menu_item_modifier_groups l
                              join modifier_groups g on g.id = l.group_id
                             where l.menu_item_id = i.id), '[]'::jsonb))
                        order by i.sort, i.name_en, i.id)
                   from menu_items i
                  where i.category_id = c.id and i.is_active))
             order by c.sort, c.name_en, c.id)
        from menu_categories c
       where c.venue_id = (select id from v) and c.is_active
         and exists (select 1 from menu_items i where i.category_id = c.id and i.is_active)), '[]'::jsonb))
$guest_menu$;

revoke all on function app.guest_menu() from public, anon, authenticated;
grant execute on function app.guest_menu() to anon;
