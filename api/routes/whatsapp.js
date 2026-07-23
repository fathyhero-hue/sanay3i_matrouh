const express = require("express");
const router = express.Router();
const crypto = require("crypto");
const { supabase, isSupabaseReady } = require("../config/supabase");
const { normalizeWorkerPhone, workerPhoneKeysFromValues } = require("../utils/helpers");
const { requirePermission } = require("../middlewares/auth");
const { logAdminActivity } = require("../utils/activityLogger");

// ===============================
// إعدادات WhatsApp Cloud API
// ===============================
const WHATSAPP_ENABLED = String(process.env.WHATSAPP_ENABLED || "false").toLowerCase() === "true";
const WHATSAPP_ACCESS_TOKEN = process.env.WHATSAPP_ACCESS_TOKEN || "";
const WHATSAPP_PHONE_NUMBER_ID = process.env.WHATSAPP_PHONE_NUMBER_ID || "";
const WHATSAPP_BUSINESS_ACCOUNT_ID = process.env.WHATSAPP_BUSINESS_ACCOUNT_ID || "";
const WHATSAPP_API_VERSION = process.env.WHATSAPP_API_VERSION || "v25.0";
const WHATSAPP_DEFAULT_TEMPLATE = process.env.WHATSAPP_DEFAULT_TEMPLATE || "hello_world";
const WHATSAPP_DEFAULT_LANGUAGE = process.env.WHATSAPP_DEFAULT_LANGUAGE || "en_US";
const WHATSAPP_WEBHOOK_VERIFY_TOKEN = process.env.WHATSAPP_WEBHOOK_VERIFY_TOKEN || process.env.WHATSAPP_VERIFY_TOKEN || "";

function whatsappConfigStatus() {
  const missing = [];
  if (!WHATSAPP_ENABLED) missing.push("WHATSAPP_ENABLED=true");
  if (!WHATSAPP_ACCESS_TOKEN) missing.push("WHATSAPP_ACCESS_TOKEN");
  if (!WHATSAPP_PHONE_NUMBER_ID) missing.push("WHATSAPP_PHONE_NUMBER_ID");
  return {
    enabled: WHATSAPP_ENABLED && !missing.length,
    configured: !!(WHATSAPP_ACCESS_TOKEN && WHATSAPP_PHONE_NUMBER_ID),
    missing,
    api_version: WHATSAPP_API_VERSION,
    phone_number_id: WHATSAPP_PHONE_NUMBER_ID || null,
    business_account_id: WHATSAPP_BUSINESS_ACCOUNT_ID || null,
    default_template: WHATSAPP_DEFAULT_TEMPLATE,
    default_language: WHATSAPP_DEFAULT_LANGUAGE,
    webhook_verify_token_present: !!WHATSAPP_WEBHOOK_VERIFY_TOKEN
  };
}

function normalizeWhatsAppRecipient(phone) {
  let d = String(phone || "").replace(/[٠-٩]/g, c => "٠١٢٣٤٥٦٧٨٩".indexOf(c)).replace(/[۰-۹]/g, c => "۰۱۲۳۴۵۶۷۸۹".indexOf(c)).replace(/[^0-9]/g, "");
  if (!d) return "";
  if (d.startsWith("00")) d = d.slice(2);
  if (d.startsWith("0") && d.length >= 10) d = "20" + d.slice(1);
  if (d.length === 10 && /^(10|11|12|15)/.test(d)) d = "20" + d;
  return d;
}

async function insertWhatsAppLog(row) {
  try {
    if (!supabase) return;
    const safe = { ...row };
    delete safe.access_token;
    await supabase.from("whatsapp_message_logs").insert(safe);
  } catch (e) {
    console.warn("تم تخطي تسجيل الواتساب:", e.message);
  }
}

async function sendWhatsAppCloudMessage({ to, message, mode = "text", template_name, language_code }) {
  const status = whatsappConfigStatus();
  if (!status.enabled) {
    throw new Error("إعدادات WhatsApp Cloud API غير مكتملة: " + status.missing.join(", "));
  }
  const recipient = normalizeWhatsAppRecipient(to);
  if (!recipient || recipient.length < 10) throw new Error("رقم واتساب المستلم غير صحيح");

  const sendMode = String(mode || "text").toLowerCase() === "template" ? "template" : "text";
  const payload = { messaging_product: "whatsapp", to: recipient };
  if (sendMode === "template") {
    payload.type = "template";
    payload.template = {
      name: String(template_name || WHATSAPP_DEFAULT_TEMPLATE || "hello_world"),
      language: { code: String(language_code || WHATSAPP_DEFAULT_LANGUAGE || "en_US") }
    };
  } else {
    const text = String(message || "").trim();
    if (!text) throw new Error("نص الرسالة مطلوب");
    payload.type = "text";
    payload.text = { preview_url: false, body: text };
  }

  const url = `https://graph.facebook.com/${WHATSAPP_API_VERSION}/${WHATSAPP_PHONE_NUMBER_ID}/messages`;
  const r = await fetch(url, {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${WHATSAPP_ACCESS_TOKEN}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify(payload)
  });
  const data = await r.json().catch(() => ({}));
  if (!r.ok) {
    const msg = data?.error?.message || data?.error?.error_user_msg || "فشل إرسال رسالة واتساب";
    const err = new Error(msg);
    err.provider_response = data;
    err.status_code = r.status;
    throw err;
  }
  return { response: data, recipient, send_mode: sendMode, payload_type: payload.type };
}

// ===============================
// واجهات لوحة الإدارة لإرسال الواتساب
// ===============================
router.get("/admin/whatsapp/config", requirePermission("whatsapp:send"), async (req, res) => {
  const status = whatsappConfigStatus();
  res.json({ success: true, ...status, access_token_present: !!WHATSAPP_ACCESS_TOKEN });
});

router.get("/admin/whatsapp/logs", requirePermission("whatsapp:send"), async (req, res) => {
  if (!isSupabaseReady(res)) return;
  const limit = Math.min(500, Math.max(1, Number(req.query.limit || 100)));
  const status = String(req.query.status || "").trim();
  const workerId = String(req.query.worker_id || req.query.workerId || "").trim();
  try {
    let q = supabase.from("whatsapp_message_logs").select("*").order("created_at", { ascending: false }).limit(limit);
    if (status && status !== "all") q = q.eq("status", status);
    if (workerId) q = q.eq("worker_id", workerId);
    const { data, error } = await q;
    if (error) throw error;
    const items = data || [];
    const totals = items.reduce((acc, row) => {
      const key = row.status || "unknown";
      acc[key] = (acc[key] || 0) + 1;
      acc.total += 1;
      return acc;
    }, { total: 0, sent: 0, failed: 0, pending: 0 });
    res.json({ success: true, items, totals });
  } catch (e) {
    res.json({ success: true, items: [], totals: { total:0, sent:0, failed:0, pending:0 } });
  }
});

router.post("/admin/whatsapp/send-worker", requirePermission("whatsapp:send"), async (req, res) => {
  if (!isSupabaseReady(res)) return;
  const workerId = String(req.body.worker_id || req.body.workerId || "").trim();
  const rawPhone = String(req.body.phone || "").trim();
  const message = String(req.body.message || req.body.text || "").trim();
  const mode = String(req.body.mode || "text").toLowerCase() === "template" ? "template" : "text";
  const templateName = String(req.body.template_name || req.body.templateName || WHATSAPP_DEFAULT_TEMPLATE).trim();
  let worker = null;

  try {
    if (workerId) {
      const { data, error } = await supabase.from("workers").select("*").eq("id", workerId).single();
      if (error) throw error;
      worker = data;
    }
    const phone = rawPhone || worker?.whatsapp || worker?.phone || "";
    if (!phone) return res.status(400).json({ success: false, error: "لا يوجد رقم واتساب لهذا الصنايعي" });

    const sent = await sendWhatsAppCloudMessage({ to: phone, message, mode, template_name: templateName });
    
    await insertWhatsAppLog({
      worker_id: workerId || null, worker_name: worker?.name || null,
      phone: sent.recipient, message_type: "admin_message",
      message_text: mode === "template" ? `[template:${templateName}]` : message,
      send_mode: mode, template_name: mode === "template" ? templateName : null,
      status: "sent", provider_message_id: sent.response?.messages?.[0]?.id,
      sent_by: req.admin?.display_name || "الإدارة"
    });
    
    res.json({ success: true, message: "تم إرسال رسالة واتساب بنجاح" });
  } catch (e) {
    res.status(e.status_code || 500).json({ success: false, error: e.message || "فشل إرسال رسالة واتساب" });
  }
});

// ===============================
// Webhook - استقبال رسائل الواتساب
// ===============================
router.get("/whatsapp/webhook", (req, res) => {
  const mode = req.query["hub.mode"];
  const token = req.query["hub.verify_token"];
  const challenge = req.query["hub.challenge"];
  if (mode === "subscribe" && token === WHATSAPP_WEBHOOK_VERIFY_TOKEN) {
    return res.status(200).send(String(challenge || ""));
  }
  return res.status(403).send("Forbidden");
});

router.post("/whatsapp/webhook", async (req, res) => {
  // للرد برسالة نجاح سريعاً لفيسبوك حتى لا يقطع الاتصال
  res.status(200).json({ success: true });
  // يمكنك لاحقاً تطوير هذا الجزء لحفظ الردود في قاعدة البيانات
});

module.exports = router;