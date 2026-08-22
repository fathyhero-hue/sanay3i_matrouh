-- شغّل الملف ده مرة واحدة على Supabase (أو عبر node scripts/run-migration.js
-- docs/sql/worker_account_deletion.sql) - إضافة additive بس، بدون حذف أو
-- إعادة بناء لأي جدول قائم.
--
-- ليه محتاجين العمود ده تحديدًا: لما الصنايعي يحذف حسابه (مطلب Apple 5.1.1v)
-- بنمسح بياناته الشخصية ونعطّل حسابه، لكن مش بنعمل DELETE حقيقي للصف لأن
-- service_requests.worker_id مربوط بـ "on delete cascade" - يعني DELETE فعلي
-- هيمسح كل تاريخ طلبات الخدمة اللي العملاء عملوها مع الصنايعي ده (بيانات
-- تشغيلية بتخص العميل كمان، مش بس الصنايعي). بدل كده بنعلّم الحساب كمحذوف
-- نهائيًا بعد تفريغ بياناته الشخصية بالكامل.
--
-- العمودين active/approved الموجودين أصلاً ليهم معنى تاني (تفعيل/تعطيل مؤقت
-- من الإدارة، أو انتظار مراجعة) فمش مناسبين لتمييز "الحساب اتحذف نهائيًا" -
-- عمود منفصل أوضح وأأمن وميغيّرش سلوك أي فلتر حالي.

alter table workers add column if not exists deleted_at timestamptz;

create index if not exists workers_deleted_at_idx on workers(deleted_at) where deleted_at is not null;
