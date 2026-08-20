const express = require("express");
const router = express.Router();
const { supabase, isSupabaseReady } = require("../config/supabase");
const { requireWorkerOwnership, verifyWorkerToken } = require("../middlewares/auth");
const { reportsRateLimit } = require("../middlewares/rateLimit");

// المرحلة الأولى فقط: new -> accepted/rejected -> in_progress -> completed.
// أي انتقال حالة تاني (زي cancelled) هيتضاف في مرحلة لاحقة.
const ALLOWED_TRANSITIONS = {
  new: ["accepted", "rejected"],
  accepted: ["in_progress"],
  in_progress: ["completed"]
};

const CONCISE_COLUMNS = "id, worker_id, customer_name, customer_phone, description, status, created_at";
const FULL_COLUMNS = "id, worker_id, customer_name, customer_phone, description, status, created_at, updated_at, accepted_at, completed_at, rejected_reason";

// نفس منطق استخراج توكن الصنايعي المستخدم جوه requireWorkerOwnership (مش
// مُصدّر من middlewares/auth.js)، عشان نقدر نتحقق من صاحب الطلب بعد ما نجيبه
// من قاعدة البيانات (مسار /:id/status معندوش worker_id في الرابط أصلاً).
function extractWorkerToken(req) {
  const auth = String(req.headers?.authorization || "");
  if (auth.toLowerCase().startsWith("bearer ")) return auth.slice(7).trim();
  return String(req.body?.worker_token || req.query?.worker_token || "").trim();
}

// حارس بسيط بيحوّل :workerId في الرابط لـ params.id عشان نقدر نعيد استخدام
// requireWorkerOwnership الحالي زي ما هو من غير أي تعديل عليه.
function withWorkerIdParam(req, res, next) {
  req.params.id = req.params.workerId;
  next();
}

// 1. إنشاء طلب خدمة جديد (عام - العميل مش مسجل دخول)
async function createServiceRequest(req, res) {
  try {
    if (!isSupabaseReady(res)) return;
    const body = req.body || {};

    const workerId = Number(body.worker_id);
    const customerName = String(body.customer_name || "").trim();
    const customerPhone = String(body.customer_phone || "").trim();
    const description = String(body.description || "").trim();

    if (!Number.isInteger(workerId) || workerId <= 0) {
      return res.status(400).json({ success: false, error: "معرف الصنايعي مطلوب وغير صحيح" });
    }
    if (!customerName || customerName.length > 100) {
      return res.status(400).json({ success: false, error: "اسم العميل مطلوب" });
    }
    if (!customerPhone || !/^[\d+\s-]{8,20}$/.test(customerPhone)) {
      return res.status(400).json({ success: false, error: "رقم هاتف العميل غير صحيح" });
    }
    if (!description || description.length > 1000) {
      return res.status(400).json({ success: false, error: "وصف الخدمة المطلوبة مطلوب" });
    }

    const { data: worker, error: workerErr } = await supabase
      .from("workers")
      .select("id")
      .eq("id", workerId)
      .maybeSingle();

    if (workerErr) throw workerErr;
    if (!worker) {
      return res.status(404).json({ success: false, error: "الصنايعي غير موجود" });
    }

    // status وكل التواريخ بتتحدد من السيرفر فقط - أي قيمة مبعوتة من العميل ليهم بتتجاهل
    const { data: created, error: insertErr } = await supabase
      .from("service_requests")
      .insert([{
        worker_id: workerId,
        customer_name: customerName,
        customer_phone: customerPhone,
        description,
        status: "new"
      }])
      .select(CONCISE_COLUMNS)
      .single();

    if (insertErr) throw insertErr;

    res.json({ success: true, request: created });
  } catch (err) {
    console.error("Create Service Request Error:", err);
    res.status(500).json({ success: false, error: err.message || "تعذر إنشاء الطلب" });
  }
}

// 2. جلب طلبات صنايعي معيّن (محمي - صاحب الحساب فقط)
async function listWorkerRequests(req, res) {
  try {
    if (!isSupabaseReady(res)) return;
    const workerId = Number(req.params.workerId);
    if (!workerId) {
      return res.status(400).json({ success: false, error: "معرف الصنايعي غير صحيح" });
    }

    const { data, error } = await supabase
      .from("service_requests")
      .select(FULL_COLUMNS)
      .eq("worker_id", workerId)
      .order("created_at", { ascending: false });

    if (error) throw error;

    res.json({ success: true, requests: data || [] });
  } catch (err) {
    console.error("List Worker Service Requests Error:", err);
    res.status(500).json({ success: false, error: err.message || "تعذر جلب الطلبات" });
  }
}

// 3. تحديث حالة طلب (محمي - الصنايعي صاحب الطلب فقط، وبانتقالات محددة سلفًا)
async function updateServiceRequestStatus(req, res) {
  try {
    if (!isSupabaseReady(res)) return;

    const requestId = Number(req.params.id);
    if (!requestId) {
      return res.status(400).json({ success: false, error: "معرف الطلب غير صحيح" });
    }

    const workerId = verifyWorkerToken(extractWorkerToken(req));
    if (!workerId) {
      return res.status(401).json({ success: false, error: "يجب تسجيل الدخول أولاً" });
    }

    const nextStatus = String(req.body?.status || "").trim();
    if (!["accepted", "rejected", "in_progress", "completed"].includes(nextStatus)) {
      return res.status(400).json({ success: false, error: "حالة غير صحيحة" });
    }

    const { data: current, error: fetchErr } = await supabase
      .from("service_requests")
      .select("id, worker_id, status")
      .eq("id", requestId)
      .maybeSingle();

    if (fetchErr) throw fetchErr;
    if (!current) {
      return res.status(404).json({ success: false, error: "الطلب غير موجود" });
    }

    if (Number(current.worker_id) !== Number(workerId)) {
      return res.status(403).json({ success: false, error: "ليس لديك صلاحية على هذا الطلب" });
    }

    const allowedNext = ALLOWED_TRANSITIONS[current.status] || [];
    if (!allowedNext.includes(nextStatus)) {
      return res.status(400).json({ success: false, error: `لا يمكن تغيير حالة الطلب من ${current.status} إلى ${nextStatus}` });
    }

    const now = new Date().toISOString();
    const updates = { status: nextStatus, updated_at: now };
    if (nextStatus === "accepted") updates.accepted_at = now;
    if (nextStatus === "completed") updates.completed_at = now;
    if (nextStatus === "rejected") {
      const reason = String(req.body?.rejected_reason || "").trim();
      updates.rejected_reason = reason ? reason.slice(0, 500) : null;
    }

    const { data: updated, error: updateErr } = await supabase
      .from("service_requests")
      .update(updates)
      .eq("id", requestId)
      .select(FULL_COLUMNS)
      .single();

    if (updateErr) throw updateErr;

    res.json({ success: true, request: updated });
  } catch (err) {
    console.error("Update Service Request Status Error:", err);
    res.status(500).json({ success: false, error: err.message || "تعذر تحديث حالة الطلب" });
  }
}

router.post("/", reportsRateLimit, createServiceRequest);
router.get("/worker/:workerId", withWorkerIdParam, requireWorkerOwnership, listWorkerRequests);
router.patch("/:id/status", updateServiceRequestStatus);

module.exports = router;
module.exports.ALLOWED_TRANSITIONS = ALLOWED_TRANSITIONS;
module.exports.withWorkerIdParam = withWorkerIdParam;
module.exports.extractWorkerToken = extractWorkerToken;
module.exports.createServiceRequest = createServiceRequest;
module.exports.listWorkerRequests = listWorkerRequests;
module.exports.updateServiceRequestStatus = updateServiceRequestStatus;
