-- شغّل الملف ده مرة واحدة في Supabase Dashboard -> SQL Editor
-- بيعمل جدول إعدادات عامة (app_settings) لتخزين سعر الاشتراك ونسب الخصم،
-- وجدول سجل مدفوعات الاشتراك (subscription_payments) اللي بيغذي منه تجديد
-- الاشتراك سواء عن طريق الأدمن يدويًا أو عن طريق الصنايعي نفسه عبر PayMob،
-- وعمود جديد على workers لتتبّع آخر تنبيه انتهاء اشتراك اتبعت.

create table if not exists app_settings (
  key text primary key,
  value text,
  updated_at timestamptz not null default now()
);

create table if not exists subscription_payments (
  id uuid primary key default gen_random_uuid(),
  worker_id uuid not null references workers(id) on delete cascade,
  plan text not null check (plan in ('month', 'quarter', 'half', 'year', 'custom')),
  months integer not null,
  amount numeric not null,
  currency text not null default 'EGP',
  payment_method text not null,
  status text not null default 'pending' check (status in ('pending', 'paid', 'failed', 'cancelled')),
  paymob_intention_id text,
  paymob_transaction_id text,
  note text,
  created_at timestamptz not null default now(),
  paid_at timestamptz,
  raw_webhook jsonb
);

create index if not exists subscription_payments_worker_id_idx on subscription_payments(worker_id);
create index if not exists subscription_payments_status_idx on subscription_payments(status);

alter table workers add column if not exists last_subscription_reminder_days integer;
