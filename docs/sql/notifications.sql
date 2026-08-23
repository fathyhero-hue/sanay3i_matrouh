-- شغّل الملف ده مرة واحدة في Supabase Dashboard -> SQL Editor
-- نظام الإشعارات الفعلي داخل التطبيق (بند 22.7) - جدول واحد عام لكل
-- المستقبلين (عميل/صنايعي) بدل جدول منفصل لكل نوع، عشان يفضل بسيط
-- وقابل لإضافة أنواع إشعارات جديدة لاحقًا (زي رد خدمة العملاء - بند 22.8)
-- من غير أي تعديل على الجدول نفسه.

create table if not exists notifications (
  id bigint generated always as identity primary key,
  recipient_type text not null check (recipient_type in ('customer', 'worker')),
  recipient_id bigint not null,
  type text not null,
  title text not null,
  body text,
  link text,
  is_read boolean not null default false,
  created_at timestamptz not null default now(),
  read_at timestamptz
);

create index if not exists notifications_recipient_idx on notifications(recipient_type, recipient_id, created_at desc);
create index if not exists notifications_recipient_unread_idx on notifications(recipient_type, recipient_id, is_read);
