-- seed.sql: applied by `supabase db reset` after the migrations. LOCAL DEV ONLY.
--
-- Demo staff (all password: demo-pass-123)
--   role     email                 PIN
--   owner    owner@demo.local      482916
--   manager  manager@demo.local    735194
--   cashier  cashier@demo.local    264853
--   waiter   waiter@demo.local     917352
--
-- Plain inserts only (no app.* functions), idempotent: every row has a
-- deterministic id (md5 of a key) and `on conflict do nothing`.

-- ---------------------------------------------------------------------------
-- Venue and settings
-- ---------------------------------------------------------------------------
insert into venues (id, name, timezone)
values ('00000000-0000-4000-8000-000000000001', 'Restaurant', 'Asia/Baghdad')
on conflict (id) do nothing;

insert into venue_settings (venue_id, receipt_header_en, receipt_header_ar, receipt_footer_en, receipt_footer_ar)
values ('00000000-0000-4000-8000-000000000001',
        'Restaurant' || E'\n' || 'Baghdad, Iraq',
        'المطعم' || E'\n' || 'بغداد، العراق',
        'Thank you for dining with us',
        'شكرًا لزيارتكم')
on conflict (venue_id) do update
  set receipt_header_en = excluded.receipt_header_en,
      receipt_header_ar = excluded.receipt_header_ar,
      receipt_footer_en = excluded.receipt_footer_en,
      receipt_footer_ar = excluded.receipt_footer_ar;

-- ---------------------------------------------------------------------------
-- Demo staff: auth.users + auth.identities (the shape GoTrue signs in with),
-- then the staff rows with their PINs.
-- ---------------------------------------------------------------------------
insert into auth.users (
  instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
  raw_app_meta_data, raw_user_meta_data, created_at, updated_at,
  confirmation_token, recovery_token, email_change_token_new, email_change
)
select '00000000-0000-0000-0000-000000000000', d.id, 'authenticated', 'authenticated', d.email,
       extensions.crypt('demo-pass-123', extensions.gen_salt('bf')), now(),
       '{"provider":"email","providers":["email"]}'::jsonb, '{}'::jsonb, now(), now(),
       '', '', '', ''
  from (values
    ('00000000-0000-4000-8000-0000000000a1'::uuid, 'owner@demo.local'),
    ('00000000-0000-4000-8000-0000000000a2'::uuid, 'manager@demo.local'),
    ('00000000-0000-4000-8000-0000000000a3'::uuid, 'cashier@demo.local'),
    ('00000000-0000-4000-8000-0000000000a4'::uuid, 'waiter@demo.local')
  ) as d (id, email)
on conflict (id) do nothing;

insert into auth.identities (id, user_id, identity_data, provider, provider_id, last_sign_in_at, created_at, updated_at)
select u.id, u.id,
       jsonb_build_object('sub', u.id::text, 'email', u.email, 'email_verified', true, 'phone_verified', false),
       'email', u.id::text, now(), now(), now()
  from auth.users u
 where u.email in ('owner@demo.local', 'manager@demo.local', 'cashier@demo.local', 'waiter@demo.local')
on conflict do nothing;

insert into staff (id, venue_id, full_name, role, pin_hash)
select d.id, '00000000-0000-4000-8000-000000000001', d.full_name, d.role::staff_role,
       extensions.crypt(d.pin, extensions.gen_salt('bf'))
  from (values
    ('00000000-0000-4000-8000-0000000000a1'::uuid, 'Demo Owner',   'owner',   '482916'),
    ('00000000-0000-4000-8000-0000000000a2'::uuid, 'Demo Manager', 'manager', '735194'),
    ('00000000-0000-4000-8000-0000000000a3'::uuid, 'Demo Cashier', 'cashier', '264853'),
    ('00000000-0000-4000-8000-0000000000a4'::uuid, 'Demo Waiter',  'waiter',  '917352')
  ) as d (id, full_name, role, pin)
on conflict (id) do nothing;

-- ---------------------------------------------------------------------------
-- Tax groups
-- ---------------------------------------------------------------------------
insert into tax_groups (id, name, rate_bps)
values (md5('tax:none')::uuid, 'No tax', 0),
       (md5('tax:service')::uuid, 'Service', 1000)
on conflict (id) do nothing;

-- ---------------------------------------------------------------------------
-- Floor: 2 areas, 12 tables
-- ---------------------------------------------------------------------------
insert into floor_areas (id, name_en, name_ar, sort)
values (md5('area:indoor')::uuid, 'Indoor', 'الصالة الداخلية', 1),
       (md5('area:terrace')::uuid, 'Terrace', 'الشرفة', 2)
on conflict (id) do nothing;

insert into dining_tables (id, area_id, label, seats, grid_x, grid_y)
select md5('table:' || t.label)::uuid, md5('area:' || t.area)::uuid, t.label, t.seats, t.gx, t.gy
  from (values
    ('T1', 'indoor', 2, 0, 0), ('T2', 'indoor', 2, 1, 0), ('T3', 'indoor', 4, 2, 0),
    ('T4', 'indoor', 4, 0, 1), ('T5', 'indoor', 4, 1, 1), ('T6', 'indoor', 6, 2, 1),
    ('T7', 'terrace', 2, 0, 0), ('T8', 'terrace', 2, 1, 0), ('T9', 'terrace', 4, 2, 0),
    ('T10', 'terrace', 4, 0, 1), ('T11', 'terrace', 6, 1, 1), ('T12', 'terrace', 8, 2, 1)
  ) as t (label, area, seats, gx, gy)
on conflict (id) do nothing;

-- ---------------------------------------------------------------------------
-- Menu categories
-- ---------------------------------------------------------------------------
insert into menu_categories (id, name_en, name_ar, sort)
select md5('cat:' || c.k)::uuid, c.en, c.ar, c.sort
  from (values
    ('mezze',     'Mezze',        'مقبلات',         1),
    ('grills',    'Grills',       'مشاوي',          2),
    ('mains',     'Main Dishes',  'أطباق رئيسية',   3),
    ('sandwich',  'Sandwiches',   'سندويتشات',      4),
    ('desserts',  'Desserts',     'حلويات',         5),
    ('hot',       'Hot Drinks',   'مشروبات ساخنة',  6),
    ('cold',      'Cold Drinks',  'مشروبات باردة',  7)
  ) as c (k, en, ar, sort)
on conflict (id) do nothing;

-- ---------------------------------------------------------------------------
-- Menu items (price in IQD, tax-inclusive)
-- ---------------------------------------------------------------------------
insert into menu_items (id, category_id, name_en, name_ar, price, tax_group_id, sort)
select md5('item:' || i.k)::uuid, md5('cat:' || i.cat)::uuid, i.en, i.ar, i.price,
       md5('tax:' || i.tax)::uuid, i.sort
  from (values
    ('hummus',      'mezze',    'Hummus',               'حمص',                 4000,  'none', 1),
    ('mutabbal',    'mezze',    'Mutabbal',             'متبل',                4500,  'none', 2),
    ('tabbouleh',   'mezze',    'Tabbouleh',            'تبولة',               5000,  'none', 3),
    ('fattoush',    'mezze',    'Fattoush',             'فتوش',                5000,  'none', 4),
    ('kubba',       'mezze',    'Kubba (3 pieces)',     'كبة (3 قطع)',         6000,  'none', 5),
    ('yogurt_salad','mezze',    'Yogurt and Cucumber',  'سلطة لبن وخيار',      3000,  'none', 6),
    ('lamb_kebab',  'grills',   'Lamb Kebab',           'كباب لحم',            15000, 'none', 1),
    ('chicken_tikka','grills',  'Chicken Tikka',        'تكة دجاج',            12000, 'none', 2),
    ('lamb_tikka',  'grills',   'Lamb Tikka',           'تكة لحم',             18000, 'none', 3),
    ('mixed_grill', 'grills',   'Mixed Grill',          'مشاوي مشكلة',         25000, 'none', 4),
    ('masgouf',     'grills',   'Masgouf (grilled carp)','مسكوف',              22000, 'none', 5),
    ('quzi',        'mains',    'Quzi',                 'قوزي',                20000, 'none', 1),
    ('dolma',       'mains',    'Dolma',                'دولمة',               12000, 'none', 2),
    ('biryani',     'mains',    'Chicken Biryani',      'برياني دجاج',         11000, 'none', 3),
    ('tashreeb',    'mains',    'Tashreeb',             'تشريب',               13000, 'none', 4),
    ('maqluba',     'mains',    'Maqluba',              'مقلوبة',              12000, 'none', 5),
    ('shawarma_chicken','sandwich','Chicken Shawarma',  'شاورما دجاج',         4500,  'none', 1),
    ('shawarma_lamb','sandwich','Lamb Shawarma',        'شاورما لحم',          5500,  'none', 2),
    ('falafel',     'sandwich', 'Falafel Sandwich',     'سندويتش فلافل',       3000,  'none', 3),
    ('kebab_sandwich','sandwich','Kebab Sandwich',      'سندويتش كباب',        5000,  'none', 4),
    ('cheese_sandwich','sandwich','Cheese Sandwich',    'سندويتش جبن',         3500,  'none', 5),
    ('kunafa',      'desserts', 'Kunafa',               'كنافة',               6000,  'service', 1),
    ('baklava',     'desserts', 'Baklava',              'بقلاوة',              5000,  'service', 2),
    ('zlabia',      'desserts', 'Zlabia',               'زلابية',              3500,  'none', 3),
    ('dates_cream', 'desserts', 'Dates and Cream',      'تمر وقشطة',           4000,  'none', 4),
    ('iraqi_tea',   'hot',      'Iraqi Tea',            'شاي عراقي',           2000,  'none', 1),
    ('turkish_coffee','hot',    'Turkish Coffee',       'قهوة تركية',          3000,  'service', 2),
    ('milk_tea',    'hot',      'Tea with Milk',        'شاي بالحليب',         2500,  'none', 3),
    ('cola',        'cold',     'Cola',                 'كولا',                2000,  'none', 1),
    ('water',       'cold',     'Water',                'ماء',                 1000,  'none', 2),
    ('lemonade',    'cold',     'Fresh Lemonade',       'ليمون طازج',          3500,  'none', 3),
    ('ayran',       'cold',     'Ayran',                'عيران',               2500,  'service', 4)
  ) as i (k, cat, en, ar, price, tax, sort)
on conflict (id) do nothing;

-- ---------------------------------------------------------------------------
-- Modifier groups, modifiers, and which items carry them
-- ---------------------------------------------------------------------------
insert into modifier_groups (id, name_en, name_ar, min_select, max_select)
values (md5('mg:size')::uuid,     'Size',      'الحجم',         1, 1),
       (md5('mg:doneness')::uuid, 'Doneness',  'درجة الاستواء', 1, 1),
       (md5('mg:extras')::uuid,   'Extras',    'إضافات',        0, 3)
on conflict (id) do nothing;

insert into modifiers (id, group_id, name_en, name_ar, price_delta)
select md5('mod:' || m.k)::uuid, md5('mg:' || m.grp)::uuid, m.en, m.ar, m.delta
  from (values
    ('size_regular', 'size',     'Regular',      'عادي',            0),
    ('size_large',   'size',     'Large',        'كبير',            1500),
    ('done_medium',  'doneness', 'Medium',       'وسط',             0),
    ('done_well',    'doneness', 'Well done',    'مستوي جيدًا',     0),
    ('extra_bread',  'extras',   'Extra bread',  'خبز إضافي',       500),
    ('extra_sauce',  'extras',   'Extra sauce',  'صلصة إضافية',     500),
    ('extra_cheese', 'extras',   'Extra cheese', 'جبن إضافي',       1000)
  ) as m (k, grp, en, ar, delta)
on conflict (id) do nothing;

insert into menu_item_modifier_groups (menu_item_id, group_id)
select md5('item:' || x.item)::uuid, md5('mg:' || x.grp)::uuid
  from (values
    ('lemonade', 'size'), ('ayran', 'size'),
    ('lamb_kebab', 'doneness'), ('lamb_tikka', 'doneness'), ('mixed_grill', 'doneness'),
    ('lamb_kebab', 'extras'), ('chicken_tikka', 'extras'), ('lamb_tikka', 'extras'),
    ('shawarma_chicken', 'extras'), ('shawarma_lamb', 'extras'), ('falafel', 'extras'),
    ('kebab_sandwich', 'extras'), ('cheese_sandwich', 'extras')
  ) as x (item, grp)
on conflict do nothing;

-- ---------------------------------------------------------------------------
-- Ingredients: unit, cost per unit (IQD), reorder point, opening stock
-- ---------------------------------------------------------------------------
drop table if exists pg_temp.seed_ingredients;
create temporary table seed_ingredients (
  k text, en text, ar text, unit stock_unit, cost numeric, reorder numeric, stock numeric
);

insert into seed_ingredients values
  ('lamb',       'Lamb meat',          'لحم غنم',         'g',  18,   5000, 20000),
  ('beef_mince', 'Minced beef',        'لحم بقر مفروم',   'g',  14,   4000, 15000),
  ('chicken',    'Chicken',            'دجاج',            'g',  6,    6000, 25000),
  ('carp',       'Carp (masgouf)',     'سمك شبوط',        'g',  9,    4000, 15000),
  ('rice',       'Rice',               'رز',              'g',  1.8,  10000, 40000),
  ('bulgur',     'Bulgur',             'برغل',            'g',  1.5,  2000, 8000),
  ('flour',      'Flour',              'طحين',            'g',  1,    5000, 20000),
  ('tomato',     'Tomato',             'طماطم',           'g',  1.2,  3000, 12000),
  ('cucumber',   'Cucumber',           'خيار',            'g',  1,    2000, 8000),
  ('onion',      'Onion',              'بصل',             'g',  0.8,  4000, 15000),
  ('parsley',    'Parsley',            'بقدونس',          'g',  3,    500,  2000),
  ('eggplant',   'Eggplant',           'باذنجان',         'g',  1.5,  2000, 8000),
  ('chickpeas',  'Chickpeas',          'حمص حب',          'g',  3,    2500, 10000),
  ('tahini',     'Tahini',             'طحينة',           'g',  8,    1000, 4000),
  ('yogurt',     'Yogurt',             'لبن',             'g',  2.5,  4000, 15000),
  ('olive_oil',  'Olive oil',          'زيت زيتون',       'ml', 7,    1500, 6000),
  ('cooking_oil','Cooking oil',        'زيت طبخ',         'ml', 2.5,  5000, 20000),
  ('samoon',     'Samoon bread',       'صمون',            'pc', 250,  50,   200),
  ('lavash',     'Flatbread',          'خبز رقاق',        'pc', 150,  40,   150),
  ('cheese',     'Cheese',             'جبن',             'g',  9,    1200, 5000),
  ('kunafa_dough','Kunafa dough',      'عجينة كنافة',     'g',  5,    1000, 5000),
  ('sugar',      'Sugar',              'سكر',             'g',  1.4,  5000, 20000),
  ('milk',       'Milk',               'حليب',            'ml', 1.6,  5000, 20000),
  ('tea_leaves', 'Tea leaves',         'شاي',             'g',  12,   800,  3000),
  ('coffee',     'Coffee beans',       'قهوة',            'g',  40,   1000, 4000),
  ('dates',      'Dates',              'تمر',             'g',  5,    1500, 6000),
  ('cream',      'Cream (qeshta)',     'قشطة',            'g',  10,   800,  3000),
  ('lemon',      'Lemon',              'ليمون',           'pc', 150,  80,   300),
  ('cola_can',   'Cola can',           'علبة كولا',       'pc', 500,  60,   240),
  ('water_bottle','Water bottle',      'قنينة ماء',       'pc', 200,  72,   300);

insert into ingredients (id, name_en, name_ar, unit, reorder_point, cost_per_unit)
select md5('ing:' || k)::uuid, en, ar, unit, reorder, cost from seed_ingredients
on conflict (id) do nothing;

-- ---------------------------------------------------------------------------
-- Recipes: how much of each ingredient one unit of the item uses
-- ---------------------------------------------------------------------------
insert into recipe_lines (id, menu_item_id, ingredient_id, qty)
select md5('recipe:' || r.item || ':' || r.ing)::uuid, md5('item:' || r.item)::uuid, md5('ing:' || r.ing)::uuid, r.qty
  from (values
    ('hummus', 'chickpeas', 80), ('hummus', 'tahini', 30), ('hummus', 'olive_oil', 10), ('hummus', 'lemon', 0.25),
    ('mutabbal', 'eggplant', 200), ('mutabbal', 'tahini', 30), ('mutabbal', 'olive_oil', 10),
    ('tabbouleh', 'parsley', 80), ('tabbouleh', 'tomato', 100), ('tabbouleh', 'bulgur', 30),
    ('tabbouleh', 'olive_oil', 15), ('tabbouleh', 'lemon', 0.25),
    ('fattoush', 'tomato', 100), ('fattoush', 'cucumber', 80), ('fattoush', 'lavash', 0.5),
    ('fattoush', 'olive_oil', 15), ('fattoush', 'parsley', 20),
    ('kubba', 'beef_mince', 100), ('kubba', 'bulgur', 60), ('kubba', 'onion', 30), ('kubba', 'cooking_oil', 60),
    ('yogurt_salad', 'yogurt', 150), ('yogurt_salad', 'cucumber', 80),
    ('lamb_kebab', 'lamb', 250), ('lamb_kebab', 'onion', 40), ('lamb_kebab', 'samoon', 1),
    ('chicken_tikka', 'chicken', 300), ('chicken_tikka', 'samoon', 1), ('chicken_tikka', 'onion', 30),
    ('lamb_tikka', 'lamb', 300), ('lamb_tikka', 'samoon', 1),
    ('mixed_grill', 'lamb', 250), ('mixed_grill', 'chicken', 200), ('mixed_grill', 'beef_mince', 100),
    ('mixed_grill', 'samoon', 2), ('mixed_grill', 'onion', 50),
    ('masgouf', 'carp', 600), ('masgouf', 'tomato', 100), ('masgouf', 'onion', 60), ('masgouf', 'lemon', 1),
    ('quzi', 'lamb', 350), ('quzi', 'rice', 250), ('quzi', 'cooking_oil', 40),
    ('dolma', 'rice', 120), ('dolma', 'beef_mince', 100), ('dolma', 'onion', 50),
    ('dolma', 'tomato', 80), ('dolma', 'cooking_oil', 20),
    ('biryani', 'chicken', 250), ('biryani', 'rice', 250), ('biryani', 'onion', 40), ('biryani', 'cooking_oil', 30),
    ('tashreeb', 'lamb', 200), ('tashreeb', 'lavash', 2), ('tashreeb', 'tomato', 80), ('tashreeb', 'chickpeas', 60),
    ('maqluba', 'chicken', 200), ('maqluba', 'rice', 200), ('maqluba', 'eggplant', 100), ('maqluba', 'cooking_oil', 40),
    ('shawarma_chicken', 'chicken', 150), ('shawarma_chicken', 'lavash', 1),
    ('shawarma_chicken', 'tomato', 30), ('shawarma_chicken', 'tahini', 10),
    ('shawarma_lamb', 'lamb', 150), ('shawarma_lamb', 'lavash', 1),
    ('shawarma_lamb', 'tomato', 30), ('shawarma_lamb', 'tahini', 10),
    ('falafel', 'chickpeas', 100), ('falafel', 'lavash', 1), ('falafel', 'tahini', 10),
    ('falafel', 'cooking_oil', 40), ('falafel', 'tomato', 30),
    ('kebab_sandwich', 'lamb', 120), ('kebab_sandwich', 'samoon', 1), ('kebab_sandwich', 'onion', 20),
    ('cheese_sandwich', 'cheese', 60), ('cheese_sandwich', 'samoon', 1),
    ('kunafa', 'kunafa_dough', 100), ('kunafa', 'cheese', 80), ('kunafa', 'sugar', 40),
    ('baklava', 'flour', 60), ('baklava', 'sugar', 40), ('baklava', 'cooking_oil', 20),
    ('zlabia', 'flour', 80), ('zlabia', 'sugar', 50), ('zlabia', 'cooking_oil', 60),
    ('dates_cream', 'dates', 80), ('dates_cream', 'cream', 60),
    ('iraqi_tea', 'tea_leaves', 4), ('iraqi_tea', 'sugar', 15),
    ('turkish_coffee', 'coffee', 10), ('turkish_coffee', 'sugar', 10),
    ('milk_tea', 'tea_leaves', 4), ('milk_tea', 'milk', 100), ('milk_tea', 'sugar', 10),
    ('cola', 'cola_can', 1), ('water', 'water_bottle', 1),
    ('lemonade', 'lemon', 2), ('lemonade', 'sugar', 30),
    ('ayran', 'yogurt', 200)
  ) as r (item, ing, qty)
on conflict (id) do nothing;

-- ---------------------------------------------------------------------------
-- Opening stock: one seed delivery, one `delivery` movement per ingredient
-- ---------------------------------------------------------------------------
insert into deliveries (id, received_by, note, idempotency_key)
values (md5('delivery:seed')::uuid, '00000000-0000-4000-8000-0000000000a1', 'Opening stock (seed)', 'seed:delivery:opening')
on conflict (id) do nothing;

insert into delivery_lines (id, delivery_id, ingredient_id, qty, unit_cost)
select md5('dline:' || k)::uuid, md5('delivery:seed')::uuid, md5('ing:' || k)::uuid, stock, cost
  from seed_ingredients
on conflict (id) do nothing;

insert into stock_movements (ingredient_id, kind, qty, unit_cost, ref_table, ref_id, actor_id)
select md5('ing:' || s.k)::uuid, 'delivery', s.stock, s.cost, 'deliveries', md5('delivery:seed')::uuid,
       '00000000-0000-4000-8000-0000000000a1'
  from seed_ingredients s
 where not exists (
   select 1 from stock_movements m
    where m.ref_table = 'deliveries' and m.ref_id = md5('delivery:seed')::uuid
      and m.ingredient_id = md5('ing:' || s.k)::uuid
 );

drop table if exists pg_temp.seed_ingredients;
