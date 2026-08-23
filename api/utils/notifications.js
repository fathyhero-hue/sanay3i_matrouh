const { supabase } = require("../config/supabase");

// إنشاء إشعار داخل التطبيق (بند 22.7) - جدول notifications عام لكل
// المستقبلين، بيتنادى من أي مكان في الكود لما يحصل حدث حقيقي (تغيير حالة
// طلب/نتيجة توثيق/رد دعم...) بدون أي نظام إشعارات موازٍ. فشل الإنشاء
// (مثلاً لو الجدول مش موجود لسه) بيتجاهل بهدوء عشان ميكسرش العملية الأساسية
async function createNotification({ recipientType, recipientId, type, title, body, link }) {
  try {
    if (!supabase || !recipientType || !recipientId || !type || !title) return;
    await supabase.from("notifications").insert([{
      recipient_type: recipientType,
      recipient_id: Number(recipientId),
      type: String(type),
      title: String(title).slice(0, 200),
      body: body ? String(body).slice(0, 500) : null,
      link: link ? String(link) : null
    }]);
  } catch (e) {
    console.warn("تم تخطي إنشاء إشعار:", e.message);
  }
}

module.exports = { createNotification };
