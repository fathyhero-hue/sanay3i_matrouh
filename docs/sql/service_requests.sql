-- شغّل الملف ده مرة واحدة في Supabase Dashboard -> SQL Editor
-- المرحلة الأولى من نظام طلب الخدمة: إنشاء جدول service_requests فقط.
-- ملحوظة: مفيش أي تعديل على أي جدول قائم (workers / reviews / reports وغيرها
-- ما اتلمستش خالص).

create table if not exists service_requests (
  id bigint generated always as identity primary key,
  worker_id bigint not null references workers(id) on delete cascade,
  customer_name text not null,
  customer_phone text not null,
  customer_id bigint, -- nullable مؤقتًا: هيتربط بجدول عملاء حقيقي في مرحلة لاحقة
  description text not null,
  status text not null default 'new',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  accepted_at timestamptz,
  completed_at timestamptz,
  rejected_reason text
);

alter table service_requests drop constraint if exists service_requests_status_check;
alter table service_requests add constraint service_requests_status_check
  check (status in ('new', 'accepted', 'in_progress', 'completed', 'rejected', 'cancelled'));

create index if not exists service_requests_worker_status_idx on service_requests(worker_id, status);
create index if not exists service_requests_customer_phone_idx on service_requests(customer_phone);
