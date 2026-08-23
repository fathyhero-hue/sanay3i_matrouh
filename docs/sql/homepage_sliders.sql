-- سلايدر الهيرو وسلايدر الإحصائيات في الصفحة الرئيسية للعميل - جداول جديدة بالكامل
-- (additive فقط، بدون أي تعديل على جداول قائمة). يشغّل عبر:
-- node scripts/run-migration.js docs/sql/homepage_sliders.sql
--
-- hero_slides: بديل عن HERO_CAMPAIGNS الثابت في home.js (بند 12 القديم). بيلغي
-- منطق "months" الموسمي القديم لصالح جدولة start_at/end_at حقيقية بالتاريخ
-- والوقت بدل شهور فقط - آلية واحدة بس، مفيش تعارض بين نظامين جدولة.
create table if not exists hero_slides (
  id bigint generated always as identity primary key,
  image text not null,
  title text not null,
  description text,
  button_text text,
  button_link text,
  sort_order integer not null default 0,
  is_active boolean not null default true,
  start_at timestamptz,
  end_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists hero_slides_active_sort_idx on hero_slides(is_active, sort_order);

-- stats_slider_items: يحل محل بطاقتي "صنايعي متاح" و"حرفة مختلفة" الثابتتين
-- تحت شريط البحث. type='metric' -> القيمة تتحسب لحظيًا من قواعد البيانات
-- الحقيقية وقت الطلب (مفيش قيمة مخزّنة أبدًا لهذا النوع)، type='custom' ->
-- نص حر بالكامل من الإدارة.
create table if not exists stats_slider_items (
  id bigint generated always as identity primary key,
  type text not null check (type in ('metric','custom')),
  metric_key text,
  title text,
  value text,
  subtitle text,
  icon text,
  color_theme text,
  sort_order integer not null default 0,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint stats_slider_items_metric_check check (
    (type = 'metric' and metric_key is not null) or
    (type = 'custom' and title is not null)
  )
);
create index if not exists stats_slider_items_active_sort_idx on stats_slider_items(is_active, sort_order);
