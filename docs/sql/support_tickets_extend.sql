-- شغّل الملف ده مرة واحدة في Supabase Dashboard -> SQL Editor
-- بند 22.8: نظام تذاكر دعم حقيقي - بيوسّع جدول support_chat_conversations
-- الموجود بالفعل (نظام شات خدمة العملاء الحالي) بدل إنشاء جدول موازٍ جديد.
-- المحادثة الواحدة = التذكرة، والرسائل (support_chat_messages الموجود) =
-- الردود. أي تذكرة قديمة (من الشات القديم) هتفضل شغالة عادي بقيم افتراضية.

alter table support_chat_conversations add column if not exists customer_id bigint references customers(id) on delete set null;
alter table support_chat_conversations add column if not exists ticket_type text;
alter table support_chat_conversations add column if not exists title text;
alter table support_chat_conversations add column if not exists attachment_url text;

-- توسعة status: كانت open/closed بس، دلوقتي new/in_progress/resolved/closed
-- (open القديمة تتحول تلقائيًا لـnew عشان تتوافق مع الحالات الجديدة) - لازم
-- نشيل الـconstraint القديم الأول قبل الـupdate عشان مايرفضش القيمة الجديدة
alter table support_chat_conversations drop constraint if exists support_chat_conversations_status_check;
update support_chat_conversations set status = 'new' where status = 'open';
alter table support_chat_conversations add constraint support_chat_conversations_status_check
  check (status in ('new', 'in_progress', 'resolved', 'closed'));

create index if not exists support_chat_conversations_customer_idx on support_chat_conversations(customer_id);
