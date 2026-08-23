const webpush = require("web-push");
const { supabase } = require("../config/supabase");

// طبقة توصيل Web Push فوق نظام notifications الحالي (utils/notifications.js)
// - إضافية بالكامل ولا تغيّر عقد createNotification. أي فشل هنا لازم
// يتبلع بهدوء وميوقفش أي عملية أساسية (إنشاء الإشعار نفسه نجح بالفعل).

const VAPID_PUBLIC_KEY = process.env.VAPID_PUBLIC_KEY || "";
const VAPID_PRIVATE_KEY = process.env.VAPID_PRIVATE_KEY || "";
const VAPID_SUBJECT = process.env.VAPID_SUBJECT || "mailto:admin@example.com";

let vapidConfigured = false;
function ensureVapid() {
  if (vapidConfigured) return true;
  if (!VAPID_PUBLIC_KEY || !VAPID_PRIVATE_KEY) return false;
  try {
    webpush.setVapidDetails(VAPID_SUBJECT, VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY);
    vapidConfigured = true;
    return true;
  } catch (e) {
    console.warn("تعذر إعداد VAPID للـ Web Push:", e.message);
    return false;
  }
}

function getPublicKey() {
  return VAPID_PUBLIC_KEY || null;
}

// حماية إضافية ضد إرسال نفس الإشعار أكتر من مرة (نفس notification_id) في
// نفس عمر العملية - خط دفاع ثانٍ بعد إن sendPushToOwner أصلًا بيتنادى مرة
// واحدة بس من داخل createNotification (بعد الـ INSERT مباشرة، مش عند أي
// قراءة/polling لاحقة للصف)
const sentNotificationIds = new Set();
const SENT_IDS_MAX = 5000;

function markSent(notificationId) {
  if (notificationId == null) return;
  sentNotificationIds.add(notificationId);
  if (sentNotificationIds.size > SENT_IDS_MAX) {
    // تفريغ بسيط لأقدم عنصر لمنع تضخم الذاكرة بلا حدود
    const first = sentNotificationIds.values().next().value;
    sentNotificationIds.delete(first);
  }
}

function alreadySent(notificationId) {
  return notificationId != null && sentNotificationIds.has(notificationId);
}

// حمولة الدفع الفعلية - أقل حد ممكن من البيانات (بند أمان صريح): عنوان
// وجسم عام قصير ورابط تعميق فقط. ممنوع أي رقم هاتف/وصف طلب كامل/صورة.
function buildPayload({ notificationId, type, title, link }) {
  return {
    title: String(title || "إشعار جديد").slice(0, 100),
    body: PUSH_GENERIC_BODY_BY_TYPE[type] || "لديك تحديث جديد، افتح التطبيق لمعرفة التفاصيل.",
    icon: "/icons/icon-192.png",
    badge: "/icons/icon-192.png",
    url: link || "/",
    notification_id: notificationId,
    type: type || "general"
  };
}

// أجسام عامة ثابتة بديلة عن نص الإشعار الداخلي الفعلي في بعض الأنواع
// (خصوصًا new_request اللي جسمه الداخلي بيحتوي على أول 120 حرف من وصف
// العميل الفعلي - ممنوع نسرّبها في إشعار نظام التشغيل الظاهر حتى لو الجهاز
// مقفول). باقي الأنواع أجسامها الداخلية أصلًا نصوص عامة قصيرة فمفيش داعي
// لاستبدالها.
const PUSH_GENERIC_BODY_BY_TYPE = {
  new_request: "لديك طلب خدمة جديد بانتظار ردك.",
  // إشعارات الإدارة (بند إضافة استهداف الإدارة) - أجسامها الداخلية أصلًا
  // مختصرة (اسم حرفة/صنايعي بس، مش وصف الطلب/محتوى المستند/نص الرسالة)
  // لكن بنستبدلها هنا كمان بجسم عام تمامًا زي new_request عشان أي جهاز
  // مقفول ميعرضش حتى الاسم المختصر في إشعار نظام التشغيل الظاهر
  admin_new_service_request: "هناك طلب خدمة جديد بانتظار المراجعة.",
  admin_new_identity_request: "هناك طلب توثيق هوية جديد بانتظار المراجعة.",
  admin_new_support_conversation: "هناك محادثة دعم جديدة بانتظار الرد.",
  admin_new_support_message: "هناك رسالة دعم جديدة بانتظار الرد."
};

async function fetchActiveSubscriptions(ownerType, ownerId) {
  const { data, error } = await supabase
    .from("push_subscriptions")
    .select("*")
    .eq("owner_type", ownerType)
    .eq("owner_id", Number(ownerId))
    .eq("is_active", true);
  if (error) throw error;
  return data || [];
}

async function deactivateSubscription(id) {
  try {
    await supabase.from("push_subscriptions").update({ is_active: false }).eq("id", id);
  } catch (e) {
    console.warn("تعذر تعطيل اشتراك push منتهي:", e.message);
  }
}

async function touchLastUsed(id) {
  try {
    await supabase.from("push_subscriptions").update({ last_used_at: new Date().toISOString() }).eq("id", id);
  } catch (e) {
    // تجاهل - مش حرج
  }
}

// إرسال إشعار Push لكل اشتراكات صاحب إشعار معيّن (عميل/صنايعي/إدارة).
// best-effort بالكامل: أي خطأ هنا لازم ميوصلش لمين ما نادى الدالة.
async function sendPushToOwner(ownerType, ownerId, notification) {
  try {
    if (!ownerType || !ownerId || !notification) return;
    if (!ensureVapid()) return; // مفيش مفاتيح VAPID متاحة - تخطي بهدوء

    const notificationId = notification.id ?? notification.notification_id ?? null;
    if (alreadySent(notificationId)) return;

    const subs = await fetchActiveSubscriptions(ownerType, ownerId);
    if (!subs.length) return;

    const payload = JSON.stringify(buildPayload({
      notificationId,
      type: notification.type,
      title: notification.title,
      link: notification.link
    }));

    markSent(notificationId);

    await Promise.all(subs.map(async (sub) => {
      try {
        await webpush.sendNotification(
          { endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } },
          payload
        );
        touchLastUsed(sub.id);
      } catch (err) {
        const statusCode = err && (err.statusCode || err.status);
        if (statusCode === 404 || statusCode === 410) {
          await deactivateSubscription(sub.id);
        } else {
          console.warn("فشل إرسال push إلى اشتراك #" + sub.id + ":", err.message || err);
        }
      }
    }));
  } catch (e) {
    console.warn("تم تخطي إرسال push:", e.message);
  }
}

module.exports = { sendPushToOwner, getPublicKey, ensureVapid };
