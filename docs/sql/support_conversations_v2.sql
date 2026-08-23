-- شغّل الملف ده مرة واحدة في Supabase Dashboard -> SQL Editor
-- بند 22.8 (نسخة كاملة) - مركز محادثات/دعم حقيقي. بيوسّع نفس
-- support_chat_conversations/support_chat_messages (اللي كانوا شات دعم بسيط
-- بالرقم، ثم اتوسّعوا لتذاكر بند 22.8 الأول) عشان يستوعبوا: محادثات صنايعي
-- كمان (مش عملاء بس)، أولوية، تعيين لموظف إدارة، ورسائل نظام تلقائية،
-- بدل أي جدول موازٍ جديد - نفس مصدر الحقيقة الوحيد.

alter table support_chat_conversations add column if not exists worker_id bigint references workers(id) on delete set null;
alter table support_chat_conversations add column if not exists priority text not null default 'normal';
alter table support_chat_conversations add column if not exists assigned_admin_id bigint;
alter table support_chat_conversations add column if not exists customer_unread_count integer not null default 0;
alter table support_chat_conversations add column if not exists admin_unread_count integer not null default 0;
alter table support_chat_conversations add column if not exists updated_at timestamptz not null default now();

alter table support_chat_conversations drop constraint if exists support_chat_conversations_priority_check;
alter table support_chat_conversations add constraint support_chat_conversations_priority_check
  check (priority in ('low', 'normal', 'high', 'urgent'));

-- created_by_type: مين بدأ المحادثة (customer/worker) - نستنتجه من الأعمدة
-- الموجودة بالفعل بدل عمود جديد زيادة عن الحاجة (customer_id موجود = عميل،
-- worker_id موجود = صنايعي)

create index if not exists support_chat_conversations_worker_idx on support_chat_conversations(worker_id);
create index if not exists support_chat_conversations_status_idx on support_chat_conversations(status);

-- الرسائل: sender_id + attachment_url لكل رسالة على حدة + read_at + علامة
-- رسالة نظام تلقائية (تغيير حالة مثلًا)
alter table support_chat_messages add column if not exists sender_id bigint;
alter table support_chat_messages add column if not exists attachment_url text;
alter table support_chat_messages add column if not exists read_at timestamptz;
alter table support_chat_messages add column if not exists is_system boolean not null default false;

alter table support_chat_messages drop constraint if exists support_chat_messages_sender_type_check;
alter table support_chat_messages add constraint support_chat_messages_sender_type_check
  check (sender_type in ('customer', 'worker', 'admin', 'system'));

create index if not exists support_chat_messages_conversation_idx on support_chat_messages(conversation_id, created_at);
