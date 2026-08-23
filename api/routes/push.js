const express = require("express");
const router = express.Router();
const { supabase, isSupabaseReady } = require("../config/supabase");
const { requireCustomerAuth } = require("../middlewares/customerAuth");
const { requireWorkerOwnership, getAdminFromRequest } = require("../middlewares/auth");
const { pushSubscribeRateLimit } = require("../middlewares/rateLimit");
const { getPublicKey } = require("../utils/push");

// حارس بسيط بيحوّل :workerId في الرابط لـ params.id عشان نقدر نستخدم
// requireWorkerOwnership الحالي زي ما هو (نفس النمط المستخدم في notifications.js)
function withWorkerIdParam(req, res, next) {
  req.params.id = req.params.workerId;
  next();
}

// حارس أدمن بسيط: أي أدمن مسجل دخول (بأي دور) يقدر يشترك/يلغي اشتراكه هو
// نفسه فقط - مفيش صلاحية خاصة مطلوبة هنا لأنها عملية شخصية بحتة بجهازه
function requireAnyAdminAuth(req, res, next) {
  const admin = getAdminFromRequest(req);
  if (!admin) return res.status(401).json({ success: false, error: "غير مصرح بالدخول للوحة الإدارة" });
  req.admin = admin;
  return next();
}

// ===============================
// المفتاح العام - بلا مصادقة، مطلوب لأي متصفح قبل pushManager.subscribe()
// ===============================
router.get("/public-key", (req, res) => {
  const publicKey = getPublicKey();
  if (!publicKey) return res.status(503).json({ success: false, error: "خدمة الإشعارات غير مفعّلة على الخادم حاليًا" });
  res.json({ publicKey });
});

// هوية صاحب الاشتراك تُشتق من التوكن/الجلسة فقط - أبدًا من body العميل،
// عشان محدش يقدر يشترك باسم owner_id شخص تاني (بند أمان صريح في المهمة)
function ownerFromAuthenticatedRequest(req) {
  if (req.customerId) return { ownerType: "customer", ownerId: Number(req.customerId) };
  if (req.workerId) return { ownerType: "worker", ownerId: Number(req.workerId) };
  if (req.admin) return { ownerType: "admin", ownerId: Number(req.admin.id) };
  return null;
}

async function handleSubscribe(req, res) {
  if (!isSupabaseReady(res)) return;
  try {
    const owner = ownerFromAuthenticatedRequest(req);
    if (!owner || !owner.ownerId) {
      return res.status(401).json({ success: false, error: "يجب تسجيل الدخول أولاً" });
    }

    const body = req.body || {};
    const endpoint = String(body.endpoint || "").trim();
    const keys = body.keys || {};
    const p256dh = String(keys.p256dh || "").trim();
    const auth = String(keys.auth || "").trim();
    const userAgent = body.user_agent ? String(body.user_agent).slice(0, 300) : (req.headers["user-agent"] || "").slice(0, 300);

    if (!endpoint || !p256dh || !auth) {
      return res.status(400).json({ success: false, error: "بيانات الاشتراك غير مكتملة" });
    }

    // Upsert على endpoint (فريد) - لو الاشتراك موجود بالفعل (حتى لو كان
    // معطّل is_active=false من قبل) بيتفعّل ويتحدّث لنفس صاحب الجلسة الحالية
    // بدل ما يرمي خطأ تكرار
    const { error } = await supabase.from("push_subscriptions").upsert([{
      owner_type: owner.ownerType,
      owner_id: owner.ownerId,
      endpoint,
      p256dh,
      auth,
      user_agent: userAgent || null,
      is_active: true,
      updated_at: new Date().toISOString()
    }], { onConflict: "endpoint" });

    if (error) throw error;
    res.json({ success: true });
  } catch (e) {
    console.error("Push Subscribe Error:", e.message);
    res.status(500).json({ success: false, error: "تعذر حفظ الاشتراك" });
  }
}

async function handleUnsubscribe(req, res) {
  if (!isSupabaseReady(res)) return;
  try {
    const owner = ownerFromAuthenticatedRequest(req);
    if (!owner || !owner.ownerId) {
      return res.status(401).json({ success: false, error: "يجب تسجيل الدخول أولاً" });
    }

    const endpoint = String((req.body || {}).endpoint || "").trim();
    if (!endpoint) return res.status(400).json({ success: false, error: "endpoint مطلوب" });

    // لازم يتأكد إن الاشتراك ده فعلًا بتاع نفس صاحب الجلسة الحالية قبل
    // الحذف - عشان محدش يقدر يلغي اشتراك حد تاني بمجرد معرفة الـ endpoint
    // بتاعه (بند أمان صريح في المهمة)
    const { data, error } = await supabase
      .from("push_subscriptions")
      .delete()
      .eq("endpoint", endpoint)
      .eq("owner_type", owner.ownerType)
      .eq("owner_id", owner.ownerId)
      .select("id")
      .maybeSingle();

    if (error) throw error;
    if (!data) return res.status(404).json({ success: false, error: "الاشتراك غير موجود" });
    res.json({ success: true });
  } catch (e) {
    console.error("Push Unsubscribe Error:", e.message);
    res.status(500).json({ success: false, error: "تعذر إلغاء الاشتراك" });
  }
}

// ===============================
// اشتراك/إلغاء اشتراك - لكل الأدوار الثلاثة (عميل/صنايعي/إدارة) عبر نفس
// المسار، بنفس نمط middlewares الحالي بالظبط لكل دور
// ===============================
router.post("/subscribe/customer", pushSubscribeRateLimit, requireCustomerAuth, handleSubscribe);
router.post("/subscribe/worker/:workerId", pushSubscribeRateLimit, withWorkerIdParam, requireWorkerOwnership, handleSubscribe);
router.post("/subscribe/admin", pushSubscribeRateLimit, requireAnyAdminAuth, handleSubscribe);

router.delete("/unsubscribe/customer", pushSubscribeRateLimit, requireCustomerAuth, handleUnsubscribe);
router.delete("/unsubscribe/worker/:workerId", pushSubscribeRateLimit, withWorkerIdParam, requireWorkerOwnership, handleUnsubscribe);
router.delete("/unsubscribe/admin", pushSubscribeRateLimit, requireAnyAdminAuth, handleUnsubscribe);

module.exports = router;
