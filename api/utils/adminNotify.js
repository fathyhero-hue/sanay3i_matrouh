const { supabase } = require("../config/supabase");
const { adminHasPermission } = require("../middlewares/auth");
const { createNotification } = require("./notifications");

// طبقة إضافية فوق createNotification() الحالي - مفيش تعديل على عقده أو على
// sendPushToOwner. الهدف هنا بس تحديد *مين* من موظفي الإدارة يستاهل يوصله
// إشعار حدث معيّن (طلب خدمة جديد/طلب توثيق جديد/رسالة دعم جديدة) حسب صلاحية
// دوره الفعلية (ADMIN_ROLE_PERMISSIONS/adminHasPermission في middlewares/auth.js)
// - مش بث لكل الإدارة زي ما هو ممنوع صراحة في المهمة.
//
// بتتنادى مرة واحدة بس من نفس نقطة الإنشاء الفعلية للحدث (بعد نجاح الـINSERT
// مباشرة)، وبتلوب على كل أدمن مستهدف وتنادي createNotification له - كل نداء
// بيعمل صف notifications منفصل + push منفصل (نفس آلية العميل/الصنايعي
// بالظبط، من غير أي نظام موازٍ).
async function notifyAdminsWithPermission(permission, { type, title, body, link }) {
  try {
    if (!supabase || !permission || !type || !title) return;

    const { data, error } = await supabase.from("admin_users").select("id, role").eq("active", true);
    if (error || !data) return;

    const targets = data.filter((admin) => adminHasPermission(admin, permission));
    for (const admin of targets) {
      // best-effort فردي لكل أدمن - فشل واحد ميوقفش الباقيين (نفس منطق
      // createNotification نفسه اللي بيتجاهل أخطاؤه بهدوء)
      createNotification({ recipientType: "admin", recipientId: admin.id, type, title, body, link });
    }
  } catch (e) {
    console.warn("تم تخطي إشعار الإدارة المستهدف:", e.message);
  }
}

module.exports = { notifyAdminsWithPermission };
