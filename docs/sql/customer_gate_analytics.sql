-- شغّل الملف ده مرة واحدة على Supabase (أو عبر node scripts/run-migration.js
-- docs/sql/customer_gate_analytics.sql) - إضافات additive بس، بدون حذف أو
-- إعادة بناء لأي جدول قائم:
--
-- 1) customers.password_set: تمييز الحسابات اللي اتعملت بكلمة مرور حقيقية
--    (المرحلة القديمة: تسجيل/طلب خدمة) عن الحسابات الخفيفة اللي بتتعمل من
--    شاشة "تسجيل بسيط" (اسم + رقم بس) قبل إظهار رقم صنايعي. القيمة الافتراضية
--    true عشان كل الحسابات الحالية (المسجّلة بكلمة مرور فعلية) تفضل محمية
--    زي ما هي بالظبط.
-- 2) analytics_events: عمود customer_id (nullable) لربط الحدث بعميل معروف
--    لو موجود، وعمودين category_id/search_query لتسجيل بيانات الفلترة/البحث
--    وقت الحاجة، بدون التأثير على أي عمود أو صف موجود.

alter table customers add column if not exists password_set boolean not null default true;

alter table analytics_events add column if not exists customer_id bigint;
alter table analytics_events add column if not exists category_id text;
alter table analytics_events add column if not exists search_query text;

alter table analytics_events drop constraint if exists analytics_events_customer_id_fkey;
alter table analytics_events add constraint analytics_events_customer_id_fkey
  foreign key (customer_id) references customers(id) on delete set null;

create index if not exists analytics_events_customer_id_idx on analytics_events(customer_id);

-- ملحوظة اكتُشفت أثناء التنفيذ: analytics_events_event_type_check كانت بتسمح
-- بس بـ (profile_view, call, whatsapp, share) - يعني حتى الأنواع اللي كود
-- السيرفر نفسه بيعتبرها "مسموحة" من زمان (search, filter_trade, filter_area)
-- كانت بترفض بصمت على مستوى القاعدة. بنوسّع القيد ليشمل نفس القائمة المسموحة
-- في الكود بالظبط + أحداث نظام البوابة الجديدة.
alter table analytics_events drop constraint if exists analytics_events_event_type_check;
alter table analytics_events add constraint analytics_events_event_type_check
  check (event_type in (
    'profile_view', 'call', 'whatsapp', 'share', 'filter_trade', 'filter_area', 'search', 'copy_phone',
    'app_open', 'category_view', 'worker_profile_view', 'phone_reveal', 'call_click', 'whatsapp_click'
  ));
