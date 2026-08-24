const express = require("express");
const router = express.Router();
const { supabase, isSupabaseReady } = require("../config/supabase");
const { requireCustomerAuth } = require("../middlewares/customerAuth");
const { requireWorkerOwnership, getAdminFromRequest } = require("../middlewares/auth");
const { pushSubscribeRateLimit } = require("../middlewares/rateLimit");

// نفس نمط api/routes/push.js (Web Push) بالظبط - مسار موازٍ لتسجيل/إلغاء
// تسجيل توكن APNs (iOS Native Push عبر Capacitor). owner_type/owner_id
// تُشتق من الجلسة/التوكن فقط، أبدًا من body العميل.

function withWorkerIdParam(req, res, next) {
  req.params.id = req.params.workerId;
  next();
}

function requireAnyAdminAuth(req, res, next) {
  const admin = getAdminFromRequest(req);
  if (!admin) return res.status(401).json({ success: false, error: "غير مصرح بالدخول للوحة الإدارة" });
  req.admin = admin;
  return next();
}

function ownerFromAuthenticatedRequest(req) {
  if (req.customerId) return { ownerType: "customer", ownerId: Number(req.customerId) };
  if (req.workerId) return { ownerType: "worker", ownerId: Number(req.workerId) };
  if (req.admin) return { ownerType: "admin", ownerId: Number(req.admin.id) };
  return null;
}

async function handleRegister(req, res) {
  if (!isSupabaseReady(res)) return;
  try {
    const owner = ownerFromAuthenticatedRequest(req);
    if (!owner || !owner.ownerId) {
      return res.status(401).json({ success: false, error: "يجب تسجيل الدخول أولاً" });
    }

    const body = req.body || {};
    const deviceToken = String(body.device_token || "").trim();
    const bundleId = body.bundle_id ? String(body.bundle_id).slice(0, 200) : null;

    if (!deviceToken) {
      return res.status(400).json({ success: false, error: "device_token مطلوب" });
    }

    // Upsert على device_token (فريد) - لو موجود بالفعل (حتى لو معطّل) بيتفعّل
    // ويتحدّث لنفس صاحب الجلسة الحالية بدل ما يرمي خطأ تكرار
    const { error } = await supabase.from("ios_push_tokens").upsert([{
      owner_type: owner.ownerType,
      owner_id: owner.ownerId,
      device_token: deviceToken,
      bundle_id: bundleId,
      is_active: true,
      updated_at: new Date().toISOString()
    }], { onConflict: "device_token" });

    if (error) throw error;
    res.json({ success: true });
  } catch (e) {
    console.error("iOS Push Register Error:", e.message);
    res.status(500).json({ success: false, error: "تعذر حفظ التوكن" });
  }
}

async function handleUnregister(req, res) {
  if (!isSupabaseReady(res)) return;
  try {
    const owner = ownerFromAuthenticatedRequest(req);
    if (!owner || !owner.ownerId) {
      return res.status(401).json({ success: false, error: "يجب تسجيل الدخول أولاً" });
    }

    const deviceToken = String((req.body || {}).device_token || "").trim();
    if (!deviceToken) return res.status(400).json({ success: false, error: "device_token مطلوب" });

    // لازم يتأكد إن التوكن ده فعلًا بتاع نفس صاحب الجلسة الحالية قبل الحذف
    const { data, error } = await supabase
      .from("ios_push_tokens")
      .delete()
      .eq("device_token", deviceToken)
      .eq("owner_type", owner.ownerType)
      .eq("owner_id", owner.ownerId)
      .select("id")
      .maybeSingle();

    if (error) throw error;
    if (!data) return res.status(404).json({ success: false, error: "التوكن غير موجود" });
    res.json({ success: true });
  } catch (e) {
    console.error("iOS Push Unregister Error:", e.message);
    res.status(500).json({ success: false, error: "تعذر إلغاء التسجيل" });
  }
}

router.post("/register/customer", pushSubscribeRateLimit, requireCustomerAuth, handleRegister);
router.post("/register/worker/:workerId", pushSubscribeRateLimit, withWorkerIdParam, requireWorkerOwnership, handleRegister);
router.post("/register/admin", pushSubscribeRateLimit, requireAnyAdminAuth, handleRegister);

router.delete("/unregister/customer", pushSubscribeRateLimit, requireCustomerAuth, handleUnregister);
router.delete("/unregister/worker/:workerId", pushSubscribeRateLimit, withWorkerIdParam, requireWorkerOwnership, handleUnregister);
router.delete("/unregister/admin", pushSubscribeRateLimit, requireAnyAdminAuth, handleUnregister);

module.exports = router;
