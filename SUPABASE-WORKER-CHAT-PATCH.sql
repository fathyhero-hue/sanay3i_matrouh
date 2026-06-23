-- Internal app chat between workers and admin
create table if not exists public.worker_messages (
  id bigserial primary key,
  worker_id bigint not null references public.workers(id) on delete cascade,
  sender_type text not null check (sender_type in ('admin','worker')),
  sender_name text,
  message_text text,
  attachment_url text,
  attachment_type text,
  is_read boolean not null default false,
  read_at timestamptz,
  created_at timestamptz not null default now()
);

create index if not exists idx_worker_messages_worker_created
  on public.worker_messages(worker_id, created_at desc);

create index if not exists idx_worker_messages_admin_unread
  on public.worker_messages(sender_type, is_read, created_at desc);

alter table public.worker_messages enable row level security;

-- المشروع يستخدم Service Role Key في API، لذلك RLS لا يمنع السيرفر.
-- لا تفتح سياسات public insert/select من المتصفح مباشرة؛ كل الوصول يمر من API.
