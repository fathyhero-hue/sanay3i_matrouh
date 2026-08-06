-- توحيد كل تعديلات الصنايعي الذاتية (بيانات + صور شغل + صورة شخصية) تحت نظام "معلّق بانتظار الموافقة"
alter table workers add column if not exists pending_changes jsonb;

-- ترحيل أي طلب صورة شخصية معلّق من النظام القديم (pending_image) للنظام الجديد الموحّد
update workers
set pending_changes = coalesce(pending_changes, '{}'::jsonb) || jsonb_build_object('image', pending_image),
    has_pending_changes = true
where pending_image is not null and pending_image <> '';
