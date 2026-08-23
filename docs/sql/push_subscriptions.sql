-- شغّل الملف ده مرة واحدة عبر: node scripts/run-migration.js docs/sql/push_subscriptions.sql
-- جدول اشتراكات Web Push - طبقة توصيل إضافية فوق نظام notifications الحالي
-- (docs/sql/notifications.sql) وليست بديلة له. الجدول ده بيخزن بيانات
-- الاشتراك اللي بيرجعها المتصفح من pushManager.subscribe() بس (endpoint +
-- مفاتيح تشفير عامة p256dh/auth) - مفيش أي بيانات شخصية حساسة فيه.
-- owner_type بيشمل admin كمان (خلافًا لجدول notifications اللي بيدعم
-- customer/worker بس حاليًا) عشان تجهيز البنية التحتية لو حابب تضيف إشعارات
-- إدارة لاحقًا، لكن مفيش أي push فعلي بيتبعت للإدارة دلوقتي لعدم وجود أي
-- استدعاء createNotification بيستهدف الإدارة في الكود الحالي.

create table if not exists push_subscriptions (
  id bigint generated always as identity primary key,
  owner_type text not null check (owner_type in ('customer', 'worker', 'admin')),
  owner_id bigint not null,
  endpoint text not null unique,
  p256dh text not null,
  auth text not null,
  user_agent text,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  last_used_at timestamptz
);

create index if not exists push_subscriptions_owner_idx on push_subscriptions(owner_type, owner_id, is_active);
