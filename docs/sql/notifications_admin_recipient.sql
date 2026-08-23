-- شغّل الملف ده مرة واحدة عبر: node scripts/run-migration.js docs/sql/notifications_admin_recipient.sql
-- توسعة recipient_type في جدول notifications (docs/sql/notifications.sql)
-- عشان يسمح بـ'admin' زي ما بيسمح بـ'customer'/'worker' حاليًا - مطلوبة
-- لإشعارات الإدارة الجديدة (طلب خدمة/توثيق هوية/دعم) اللي بتتنادى عبر نفس
-- createNotification() الحالي بدون أي تعديل على عقده. اسم الـconstraint
-- الحالي notifications_recipient_type_check اتأكد منه فعليًا عبر استعلام
-- pg_constraint قبل كتابة الملف ده (مش تخمين).

alter table notifications drop constraint if exists notifications_recipient_type_check;
alter table notifications add constraint notifications_recipient_type_check
  check (recipient_type in ('customer', 'worker', 'admin'));
