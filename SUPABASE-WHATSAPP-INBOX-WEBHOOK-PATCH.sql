-- =========================================================
-- صنايعي مطروح - WhatsApp Inbox & Webhook Patch
-- يستقبل ردود الصنايعية الواردة من WhatsApp Cloud API ويعرضها داخل لوحة الإدارة
-- =========================================================

create extension if not exists pgcrypto;

create table if not exists whatsapp_inbox_messages (
  id uuid primary key default gen_random_uuid(),
  provider_message_id text not null unique,
  phone_number_id text,
  display_phone_number text,
  from_number text not null,
  wa_id text,
  profile_name text,
  worker_id text,
  worker_name text,
  message_type text not null default 'unknown',
  message_text text,
  media_id text,
  media_mime_type text,
  media_sha256 text,
  media_filename text,
  raw_payload jsonb default '{}'::jsonb,
  contact_payload jsonb default '{}'::jsonb,
  worker_snapshot jsonb default '{}'::jsonb,
  status text not null default 'new' check (status in ('new','read','archived')),
  received_at timestamptz not null default now(),
  read_at timestamptz,
  replied_at timestamptz,
  archived_at timestamptz,
  created_at timestamptz not null default now()
);

create index if not exists idx_whatsapp_inbox_messages_from_number
on whatsapp_inbox_messages(from_number);

create index if not exists idx_whatsapp_inbox_messages_worker_id
on whatsapp_inbox_messages(worker_id);

create index if not exists idx_whatsapp_inbox_messages_status
on whatsapp_inbox_messages(status);

create index if not exists idx_whatsapp_inbox_messages_received_at
on whatsapp_inbox_messages(received_at desc);

-- يتأكد أن جدول سجل الإرسال موجود ثم يضيف أعمدة اختيارية لتتبع حالة التسليم لاحقًا.
create table if not exists whatsapp_message_logs (
  id uuid primary key default gen_random_uuid(),
  worker_id text,
  worker_name text,
  phone text not null,
  message_type text,
  message_text text,
  send_mode text not null default 'text' check (send_mode in ('text','template')),
  template_name text,
  status text not null default 'pending' check (status in ('pending','sent','failed')),
  provider_message_id text,
  provider_response jsonb default '{}'::jsonb,
  error_message text,
  sent_by text,
  created_at timestamptz not null default now()
);

alter table whatsapp_message_logs
  add column if not exists bulk_group_id text;

alter table whatsapp_message_logs
  add column if not exists bulk_label text;

alter table whatsapp_message_logs
  add column if not exists delivery_status text;

alter table whatsapp_message_logs
  add column if not exists delivery_payload jsonb default '{}'::jsonb;
