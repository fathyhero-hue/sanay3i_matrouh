const { supabase } = require("../config/supabase");
const { sendPushToOwner } = require("./push");
const { sendApnsToOwner } = require("./pushIos");

// إنشاء إشعار داخل التطبيق (بند 22.7) - جدول notifications عام لكل
// المستقبلين، بيتنادى من أي مكان في الكود لما يحصل حدث حقيقي (تغيير حالة
// طلب/نتيجة توثيق/رد دعم...) بدون أي نظام إشعارات موازٍ. فشل الإنشاء
// (مثلاً لو الجدول مش موجود لسه) بيتجاهل بهدوء عشان ميكسرش العملية الأساسية.
//
// طبقة Web Push إضافية: بعد نجاح الـ INSERT مباشرة (ومرة واحدة بس هنا، مش
// عند أي قراءة/polling لاحقة للصف) بنحاول نوصّل push فعلي لأجهزة صاحب
// الإشعار - best-effort بالكامل، فشله ميأثرش على إنشاء الإشعار الداخلي
// اللي أصلًا نجح.
async function createNotification({ recipientType, recipientId, type, title, body, link }) {
  try {
    if (!supabase || !recipientType || !recipientId || !type || !title) return;
    const { data, error } = await supabase.from("notifications").insert([{
      recipient_type: recipientType,
      recipient_id: Number(recipientId),
      type: String(type),
      title: String(title).slice(0, 200),
      body: body ? String(body).slice(0, 500) : null,
      link: link ? String(link) : null
    }]).select("id").maybeSingle();

    if (error) throw error;

    sendPushToOwner(recipientType, recipientId, {
      id: data ? data.id : null,
      type,
      title,
      link
    }).catch(() => {});

    // طبقة APNs (iOS Native) إضافية موازية - نفس الحدث، مسار مستقل تمامًا
    // عن Web Push أعلاه، فشل أي منهما لا يؤثر على الآخر ولا على إنشاء
    // الإشعار الداخلي اللي أصلًا نجح
    sendApnsToOwner(recipientType, recipientId, {
      id: data ? data.id : null,
      type,
      title,
      link
    }).catch(() => {});
  } catch (e) {
    console.warn("تم تخطي إنشاء إشعار:", e.message);
  }
}

module.exports = { createNotification };
