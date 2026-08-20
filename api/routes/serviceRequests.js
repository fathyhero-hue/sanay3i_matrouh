const express = require("express");
const router = express.Router();
const { supabase, isSupabaseReady } = require("../config/supabase");
const { requireWorkerOwnership, verifyWorkerToken } = require("../middlewares/auth");
const { requireCustomerAuth } = require("../middlewares/customerAuth");
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

// 1. إنشاء طلب خدمة جديد (محمي - محتاج تسجيل دخول عميل؛ الاسم والتليفون
// بياخدهم السيرفر من الحساب الموثّق مش من العميل، عشان ميتقدرش حد ينتحل
// اسم/رقم حد تاني)
async function createServiceRequest(req, res) {
  try {
    if (!isSupabaseReady(res)) return;
    const body = req.body || {};

    const workerId = Number(body.worker_id);
    const description = String(body.description || "").trim();

    if (!Number.isInteger(workerId) || workerId <= 0) {
      return res.status(400).json({ success: false, error: "معرف الصنايعي مطلوب وغير صحيح" });
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

    const { data: customer, error: customerErr } = await supabase
      .from("customers")
      .select("id, name, phone")
      .eq("id", req.customerId)
      .maybeSingle();

    if (customerErr) throw customerErr;
    if (!customer) {
      return res.status(401).json({ success: false, error: "الحساب غير موجود، سجّل الدخول تاني" });
    }

    // status وكل التواريخ بتتحدد من السيرفر فقط - أي قيمة مبعوتة من العميل ليهم بتتجاهل
    const { data: created, error: insertErr } = await supabase
      .from("service_requests")
      .insert([{
        worker_id: workerId,
        customer_id: customer.id,
        customer_name: customer.name,
        customer_phone: customer.phone,
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

// 1.5 جلب طلبات العميل الحالي فقط (محمي)
async function listMyRequests(req, res) {
  try {
    if (!isSupabaseReady(res)) return;

    const { data, error } = await supabase
      .from("service_requests")
      .select(`${FULL_COLUMNS}, workers(name, trade, area)`)
      .eq("customer_id", req.customerId)
      .order("created_at", { ascending: false });

    if (error) throw error;

    const rows = data || [];
    const ids = rows.map(r => r.id);
    let reviewedIds = new Set();
    if (ids.length) {
      const { data: reviewRows, error: reviewErr } = await supabase
        .from("reviews")
        .select("service_request_id")
        .in("service_request_id", ids);
      if (reviewErr) throw reviewErr;
      reviewedIds = new Set((reviewRows || []).map(r => r.service_request_id));
    }

    const requests = rows.map(r => {
      const worker = r.workers || {};
      const row = {
        ...r,
        worker_name: worker.name || "",
        worker_trade: worker.trade || "",
        worker_area: worker.area || "",
        has_review: reviewedIds.has(r.id)
      };
      delete row.workers;
      return row;
    });

    res.json({ success: true, requests });
  } catch (err) {
    console.error("List My Service Requests Error:", err);
    res.status(500).json({ success: false, error: err.message || "تعذر جلب طلباتك" });
  }
}

// 1.6 تقييم طلب مكتمل (محمي - صاحب الطلب فقط، وبعد الاكتمال، وتقييم واحد فقط)
async function submitServiceRequestReview(req, res) {
  try {
    if (!isSupabaseReady(res)) return;

    const requestId = Number(req.params.id);
    if (!requestId) {
      return res.status(400).json({ success: false, error: "معرف الطلب غير صحيح" });
    }

    const rating = Number(req.body?.rating);
    if (!Number.isInteger(rating) || rating < 1 || rating > 5) {
      return res.status(400).json({ success: false, error: "التقييم يجب أن يكون رقمًا من 1 إلى 5" });
    }
    const comment = String(req.body?.comment || "").trim().slice(0, 1000);

    const { data: sr, error: fetchErr } = await supabase
      .from("service_requests")
      .select("id, worker_id, customer_id, customer_name, status")
      .eq("id", requestId)
      .maybeSingle();

    if (fetchErr) throw fetchErr;
    if (!sr) {
      return res.status(404).json({ success: false, error: "الطلب غير موجود" });
    }
    if (Number(sr.customer_id) !== Number(req.customerId)) {
      return res.status(403).json({ success: false, error: "هذا الطلب لا يخصك" });
    }
    if (sr.status !== "completed") {
      return res.status(400).json({ success: false, error: "لا يمكن تقييم طلب لم يكتمل بعد" });
    }

    const { data: existingReview, error: existingErr } = await supabase
      .from("reviews")
      .select("id")
      .eq("service_request_id", requestId)
      .maybeSingle();
    if (existingErr) throw existingErr;
    if (existingReview) {
      return res.status(409).json({ success: false, error: "تم تقييم هذا الطلب بالفعل" });
    }

    // worker_id وcustomer_name ماخوذين من الطلب نفسه في قاعدة البيانات - العميل
    // مش قادر يبعتهم أو يزوّرهم عن طريق الـ body
    const { data: created, error: insertErr } = await supabase
      .from("reviews")
      .insert([{
        worker_id: sr.worker_id,
        service_request_id: sr.id,
        customer_name: sr.customer_name,
        rating,
        comment,
        approved: false
      }])
      .select("id, worker_id, service_request_id, rating, comment, approved, created_at")
      .single();

    if (insertErr) {
      if (insertErr.code === "23505") {
        return res.status(409).json({ success: false, error: "تم تقييم هذا الطلب بالفعل" });
      }
      throw insertErr;
    }

    res.json({ success: true, review: created });
  } catch (err) {
    console.error("Submit Service Request Review Error:", err);
    res.status(500).json({ success: false, error: err.message || "تعذر إرسال التقييم" });
  }
}

// 1.7 إلغاء طلب بواسطة العميل صاحبه (محمي - مسموح بس من new/accepted؛ مفيش
// سبب إلغاء دلوقتي لأن واجهة العميل مش بتاخد سبب، والحقل هيتسيب null)
async function cancelServiceRequest(req, res) {
  try {
    if (!isSupabaseReady(res)) return;

    const requestId = Number(req.params.id);
    if (!requestId) {
      return res.status(400).json({ success: false, error: "معرف الطلب غير صحيح" });
    }

    const { data: sr, error: fetchErr } = await supabase
      .from("service_requests")
      .select("id, customer_id, status")
      .eq("id", requestId)
      .maybeSingle();

    if (fetchErr) throw fetchErr;
    if (!sr) {
      return res.status(404).json({ success: false, error: "الطلب غير موجود" });
    }
    if (Number(sr.customer_id) !== Number(req.customerId)) {
      return res.status(403).json({ success: false, error: "هذا الطلب لا يخصك" });
    }
    if (!["new", "accepted"].includes(sr.status)) {
      return res.status(400).json({ success: false, error: `لا يمكن إلغاء الطلب في حالته الحالية (${sr.status})` });
    }

    const { data: updated, error: updateErr } = await supabase
      .from("service_requests")
      .update({ status: "cancelled", updated_at: new Date().toISOString() })
      .eq("id", requestId)
      .select(FULL_COLUMNS)
      .single();

    if (updateErr) throw updateErr;

    res.json({ success: true, request: updated });
  } catch (err) {
    console.error("Cancel Service Request Error:", err);
    res.status(500).json({ success: false, error: err.message || "تعذر إلغاء الطلب" });
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

router.post("/", reportsRateLimit, requireCustomerAuth, createServiceRequest);
router.get("/mine", requireCustomerAuth, listMyRequests);
router.post("/:id/review", requireCustomerAuth, submitServiceRequestReview);
router.patch("/:id/cancel", requireCustomerAuth, cancelServiceRequest);
router.get("/worker/:workerId", withWorkerIdParam, requireWorkerOwnership, listWorkerRequests);
router.patch("/:id/status", updateServiceRequestStatus);

module.exports = router;
module.exports.ALLOWED_TRANSITIONS = ALLOWED_TRANSITIONS;
module.exports.withWorkerIdParam = withWorkerIdParam;
module.exports.extractWorkerToken = extractWorkerToken;
module.exports.createServiceRequest = createServiceRequest;
module.exports.listMyRequests = listMyRequests;
module.exports.submitServiceRequestReview = submitServiceRequestReview;
module.exports.cancelServiceRequest = cancelServiceRequest;
module.exports.listWorkerRequests = listWorkerRequests;
module.exports.updateServiceRequestStatus = updateServiceRequestStatus;
