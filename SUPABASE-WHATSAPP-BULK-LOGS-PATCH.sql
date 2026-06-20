-- =========================================================
-- صنايعي مطروح - WhatsApp Bulk Send & Enhanced Logs
-- يضيف أعمدة اختيارية لتجميع رسائل الإرسال الجماعي داخل سجل واتساب
-- =========================================================

create extension if not exists pgcrypto;

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

create index if not exists idx_whatsapp_message_logs_worker_id
on whatsapp_message_logs(worker_id);

create index if not exists idx_whatsapp_message_logs_phone
on whatsapp_message_logs(phone);

create index if not exists idx_whatsapp_message_logs_status
on whatsapp_message_logs(status);

create index if not exists idx_whatsapp_message_logs_bulk_group_id
on whatsapp_message_logs(bulk_group_id);

create index if not exists idx_whatsapp_message_logs_created_at
on whatsapp_message_logs(created_at desc);
