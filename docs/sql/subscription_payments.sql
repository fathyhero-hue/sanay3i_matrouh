-- شغّل الملف ده مرة واحدة في Supabase Dashboard -> SQL Editor
-- ملحوظة: جدول subscription_payments كان موجود بالفعل من محاولة قديمة (بتصميم
-- مختلف: payment_status بدل status، وworker_id/id من نوع bigint) وفيه بيانات
-- حقيقية (6 صفوف تجديد قديمة) - السكريبت ده بيضيف الأعمدة الناقصة على نفس
-- الجدول من غير ما يمسح أو يلمس أي بيانات موجودة.

create table if not exists app_settings (
  key text primary key,
  value text,
  updated_at timestamptz not null default now()
);

-- إضافة الأعمدة الناقصة على الجدول الموجود (باقي على حاله لو كانت موجودة أصلاً)
alter table subscription_payments add column if not exists status text;
update subscription_payments set status = 'paid' where status is null;
alter table subscription_payments alter column status set not null;
alter table subscription_payments alter column status set default 'pending';

alter table subscription_payments add column if not exists currency text not null default 'EGP';
alter table subscription_payments add column if not exists paid_at timestamptz;
update subscription_payments set paid_at = renewed_at where paid_at is null and renewed_at is not null;
alter table subscription_payments add column if not exists paymob_intention_id text;
alter table subscription_payments add column if not exists paymob_transaction_id text;
alter table subscription_payments add column if not exists raw_webhook jsonb;

-- الأعمدة القديمة (previous_subscription_end / new_subscription_end / renewed_at /
-- payment_status) بتفضل موجودة وما بتتمسحش، بس منخليهاش تمنع إدخال صفوف جديدة
-- من الميزة الجديدة اللي مش بتملأها
alter table subscription_payments alter column previous_subscription_end drop not null;
alter table subscription_payments alter column new_subscription_end drop not null;
alter table subscription_payments alter column renewed_at drop not null;
alter table subscription_payments alter column payment_status drop not null;

-- قيود التحقق (نحذف القديم لو موجود بنفس الاسم قبل ما نضيفه من جديد)
alter table subscription_payments drop constraint if exists subscription_payments_status_check;
alter table subscription_payments add constraint subscription_payments_status_check
  check (status in ('pending', 'paid', 'failed', 'cancelled'));

alter table subscription_payments drop constraint if exists subscription_payments_plan_check;
alter table subscription_payments add constraint subscription_payments_plan_check
  check (plan in ('month', 'quarter', 'half', 'year', 'custom'));

create index if not exists subscription_payments_worker_id_idx on subscription_payments(worker_id);
create index if not exists subscription_payments_status_idx on subscription_payments(status);

alter table workers add column if not exists last_subscription_reminder_days integer;
