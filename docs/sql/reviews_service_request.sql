-- شغّل الملف ده مرة واحدة على Supabase (أو عبر node scripts/run-migration.js
-- docs/sql/reviews_service_request.sql) - المرحلة الرابعة من نظام طلب الخدمة:
-- ربط جدول reviews الحالي بطلب خدمة محدد، بدون أي إعادة بناء للجدول ومن غير
-- ما نلمس سياسة approved الحالية أو التقييمات القديمة غير المرتبطة بطلب.

alter table reviews add column if not exists service_request_id bigint;

alter table reviews drop constraint if exists reviews_service_request_id_fkey;
alter table reviews add constraint reviews_service_request_id_fkey
  foreign key (service_request_id) references service_requests(id) on delete set null;

-- تقييم واحد بالظبط لكل طلب خدمة (بس لو الطلب مرتبط بتقييم أصلًا - التقييمات
-- القديمة اللي service_request_id فيها null مش داخلة في القيد ده خالص)
create unique index if not exists reviews_service_request_id_unique
  on reviews(service_request_id)
  where service_request_id is not null;
