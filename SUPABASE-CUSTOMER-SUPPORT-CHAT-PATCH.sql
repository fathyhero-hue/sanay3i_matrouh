-- Customer support floating chat
-- شات خدمة العملاء العام داخل التطبيق
create table if not exists public.support_chat_conversations (
  id bigserial primary key,
  phone text not null,
  phone_key text not null,
  customer_name text,
  status text not null default 'open' check (status in ('open','closed')),
  last_message_at timestamptz not null default now(),
  created_at timestamptz not null default now()
);

create table if not exists public.support_chat_messages (
  id bigserial primary key,
  conversation_id bigint not null references public.support_chat_conversations(id) on delete cascade,
  sender_type text not null check (sender_type in ('admin','customer')),
  sender_name text,
  message_text text not null,
  is_read boolean not null default false,
  read_at timestamptz,
  created_at timestamptz not null default now()
);

create index if not exists idx_support_chat_conversations_phone_key
  on public.support_chat_conversations(phone_key, last_message_at desc);

create index if not exists idx_support_chat_conversations_last
  on public.support_chat_conversations(last_message_at desc);

create index if not exists idx_support_chat_messages_conv_created
  on public.support_chat_messages(conversation_id, created_at desc);

create index if not exists idx_support_chat_messages_admin_unread
  on public.support_chat_messages(sender_type, is_read, created_at desc);

alter table public.support_chat_conversations enable row level security;
alter table public.support_chat_messages enable row level security;

-- المشروع يستخدم Service Role Key في API، لذلك كل الوصول يمر من السيرفر وليس من المتصفح مباشرة.
