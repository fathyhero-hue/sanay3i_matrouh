-- شغّل الملف ده مرة واحدة في Supabase Dashboard -> SQL Editor (أو عبر
-- node scripts/run-migration.js docs/sql/customers.sql)
-- المرحلة الثانية من نظام طلب الخدمة: جدول customers + ربطه بـ service_requests
-- الموجود من المرحلة الأولى. مفيش أي تعديل على workers/reviews/reports.

create table if not exists customers (
  id bigint generated always as identity primary key,
  name text not null,
  phone text not null unique,
  password_hash text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- ربط service_requests.customer_id بجدول customers (كان nullable من غير FK في
-- المرحلة الأولى لعدم وجود جدول customers وقتها) - يفضل nullable عشان يتوافق
-- مع أي طلبات قديمة اتعملت قبل ما يبقى فيه حسابات عملاء حقيقية.
alter table service_requests drop constraint if exists service_requests_customer_id_fkey;
alter table service_requests add constraint service_requests_customer_id_fkey
  foreign key (customer_id) references customers(id) on delete set null;

create index if not exists service_requests_customer_id_idx on service_requests(customer_id);
