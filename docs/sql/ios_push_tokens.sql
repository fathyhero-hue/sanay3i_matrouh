-- شغّل الملف ده مرة واحدة عبر: node scripts/run-migration.js docs/sql/ios_push_tokens.sql
-- جدول توكنات APNs (iOS Native Push عبر Capacitor) - طبقة توصيل إضافية
-- موازية لجدول push_subscriptions (Web Push) وليست بديلة له. الجدول ده
-- بيخزن device token اللي بيرجعه نظام iOS بعد نجاح التسجيل عبر
-- @capacitor/push-notifications فقط - مفيش أي بيانات شخصية حساسة فيه.

create table if not exists ios_push_tokens (
  id bigint generated always as identity primary key,
  owner_type text not null check (owner_type in ('customer', 'worker', 'admin')),
  owner_id bigint not null,
  device_token text not null unique,
  bundle_id text,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  last_used_at timestamptz
);

create index if not exists ios_push_tokens_owner_idx on ios_push_tokens(owner_type, owner_id, is_active);
