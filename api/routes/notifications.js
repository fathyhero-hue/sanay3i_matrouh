const express = require("express");
const router = express.Router();
const { supabase, isSupabaseReady } = require("../config/supabase");
const { requireCustomerAuth } = require("../middlewares/customerAuth");
const { requireWorkerOwnership } = require("../middlewares/auth");

// حارس بسيط بيحوّل :workerId في الرابط لـ params.id عشان نقدر نستخدم
// requireWorkerOwnership الحالي زي ما هو (نفس النمط المستخدم في serviceRequests.js)
function withWorkerIdParam(req, res, next) {
  req.params.id = req.params.workerId;
  next();
}

function publicNotification(row) {
  return {
    id: row.id,
    type: row.type,
    title: row.title,
    body: row.body,
    link: row.link,
    is_read: !!row.is_read,
    created_at: row.created_at
  };
}

async function listNotifications(recipientType, recipientId, res) {
  const { data, error } = await supabase
    .from("notifications")
    .select("*")
    .eq("recipient_type", recipientType)
    .eq("recipient_id", recipientId)
    .order("created_at", { ascending: false })
    .limit(100);
  if (error) throw error;
  res.json({ success: true, items: (data || []).map(publicNotification) });
}

async function unreadCount(recipientType, recipientId, res) {
  const { count, error } = await supabase
    .from("notifications")
    .select("*", { count: "exact", head: true })
    .eq("recipient_type", recipientType)
    .eq("recipient_id", recipientId)
    .eq("is_read", false);
  if (error) throw error;
  res.json({ success: true, unread_count: count || 0 });
}

// تعليم إشعار واحد كمقروء - بيتأكد إنه فعلًا بتاع نفس المستقبل (recipient_id)
// قبل التحديث عشان محدش يقدر يعلّم إشعار حد تاني كمقروء
async function markRead(recipientType, recipientId, notificationId, res) {
  const { data, error } = await supabase
    .from("notifications")
    .update({ is_read: true, read_at: new Date().toISOString() })
    .eq("id", notificationId)
    .eq("recipient_type", recipientType)
    .eq("recipient_id", recipientId)
    .select("id")
    .maybeSingle();
  if (error) throw error;
  if (!data) return res.status(404).json({ success: false, error: "الإشعار غير موجود" });
  res.json({ success: true });
}

async function markAllRead(recipientType, recipientId, res) {
  const { error } = await supabase
    .from("notifications")
    .update({ is_read: true, read_at: new Date().toISOString() })
    .eq("recipient_type", recipientType)
    .eq("recipient_id", recipientId)
    .eq("is_read", false);
  if (error) throw error;
  res.json({ success: true });
}

// ===============================
// مسارات العميل (محمية بـrequireCustomerAuth - نفس نظام الحساب الحالي)
// ===============================
router.get("/customer/list", requireCustomerAuth, async (req, res) => {
  if (!isSupabaseReady(res)) return;
  try { await listNotifications("customer", req.customerId, res); }
  catch (e) { res.status(500).json({ success: false, error: e.message || "تعذر تحميل الإشعارات" }); }
});

router.get("/customer/unread-count", requireCustomerAuth, async (req, res) => {
  if (!isSupabaseReady(res)) return;
  try { await unreadCount("customer", req.customerId, res); }
  catch (e) { res.status(200).json({ success: true, unread_count: 0 }); }
});

router.patch("/customer/:id/read", requireCustomerAuth, async (req, res) => {
  if (!isSupabaseReady(res)) return;
  try { await markRead("customer", req.customerId, Number(req.params.id), res); }
  catch (e) { res.status(500).json({ success: false, error: e.message || "تعذر تحديث الإشعار" }); }
});

router.patch("/customer/read-all", requireCustomerAuth, async (req, res) => {
  if (!isSupabaseReady(res)) return;
  try { await markAllRead("customer", req.customerId, res); }
  catch (e) { res.status(500).json({ success: false, error: e.message || "تعذر تحديث الإشعارات" }); }
});

// ===============================
// مسارات الصنايعي (محمية بـrequireWorkerOwnership - نفس نظام ملكية
// الحساب المستخدم في service_requests.js بالضبط)
// ===============================
router.get("/worker/:workerId/list", withWorkerIdParam, requireWorkerOwnership, async (req, res) => {
  if (!isSupabaseReady(res)) return;
  try { await listNotifications("worker", req.workerId, res); }
  catch (e) { res.status(500).json({ success: false, error: e.message || "تعذر تحميل الإشعارات" }); }
});

router.get("/worker/:workerId/unread-count", withWorkerIdParam, requireWorkerOwnership, async (req, res) => {
  if (!isSupabaseReady(res)) return;
  try { await unreadCount("worker", req.workerId, res); }
  catch (e) { res.status(200).json({ success: true, unread_count: 0 }); }
});

router.patch("/worker/:workerId/:id/read", withWorkerIdParam, requireWorkerOwnership, async (req, res) => {
  if (!isSupabaseReady(res)) return;
  try { await markRead("worker", req.workerId, Number(req.params.id), res); }
  catch (e) { res.status(500).json({ success: false, error: e.message || "تعذر تحديث الإشعار" }); }
});

router.patch("/worker/:workerId/read-all", withWorkerIdParam, requireWorkerOwnership, async (req, res) => {
  if (!isSupabaseReady(res)) return;
  try { await markAllRead("worker", req.workerId, res); }
  catch (e) { res.status(500).json({ success: false, error: e.message || "تعذر تحديث الإشعارات" }); }
});

module.exports = router;
