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
    res.json({ success: true, items: [], totals: { total: 0, sent: 0, failed: 0, pending: 0 }, warning: "جدول whatsapp_message_logs غير موجود أو غير جاهز. شغّل docs/sql/whatsapp_inbox.sql أولًا." });
  }
});

router.post("/admin/whatsapp/send-worker", requirePermission("whatsapp:send"), async (req, res) => {
  if (!isSupabaseReady(res)) return;
  const workerId = String(req.body.worker_id || req.body.workerId || "").trim();
  const rawPhone = String(req.body.phone || "").trim();
  const message = String(req.body.message || req.body.text || "").trim();
  const mode = String(req.body.mode || "text").toLowerCase() === "template" ? "template" : "text";
  const templateName = String(req.body.template_name || req.body.templateName || WHATSAPP_DEFAULT_TEMPLATE).trim();
  const languageCode = String(req.body.language_code || req.body.languageCode || WHATSAPP_DEFAULT_LANGUAGE).trim();
  let worker = null;

  try {
    if (workerId) {
      const { data, error } = await supabase.from("workers").select("*").eq("id", workerId).single();
      if (error) throw error;
      worker = data;
    }
    const phone = rawPhone || worker?.whatsapp || worker?.phone || "";
    if (!phone) return res.status(400).json({ success: false, error: "لا يوجد رقم واتساب لهذا الصنايعي" });

    const sent = await sendWhatsAppCloudMessage({ to: phone, message, mode, template_name: templateName, language_code: languageCode });
    const providerMessageId = sent.response?.messages?.[0]?.id || null;

    await insertWhatsAppLog({
      worker_id: workerId || null, worker_name: worker?.name || null,
      phone: sent.recipient, message_type: String(req.body.message_type || req.body.messageType || "admin_message"),
      message_text: mode === "template" ? `[template:${templateName}]` : message,
      send_mode: mode, template_name: mode === "template" ? templateName : null,
      status: "sent", provider_message_id: providerMessageId, provider_response: sent.response,
      sent_by: req.admin?.display_name || req.admin?.username || "الإدارة"
    });
    await logAdminActivity(req, "whatsapp_send", {
      entity_type: "worker", entity_id: workerId || null, entity_name: worker?.name || sent.recipient,
      details: { phone: sent.recipient, mode, template_name: mode === "template" ? templateName : null, provider_message_id: providerMessageId }
    });

    res.json({ success: true, message: "تم إرسال رسالة واتساب بنجاح", provider_message_id: providerMessageId, to: sent.recipient, mode });
  } catch (e) {
    const normalizedPhone = normalizeWhatsAppRecipient(rawPhone || worker?.whatsapp || worker?.phone || "");
    await insertWhatsAppLog({
      worker_id: workerId || null, worker_name: worker?.name || null,
      phone: normalizedPhone || rawPhone || null, message_type: String(req.body.message_type || req.body.messageType || "admin_message"),
      message_text: mode === "template" ? `[template:${templateName}]` : message,
      send_mode: mode, template_name: mode === "template" ? templateName : null,
      status: "failed", provider_response: e.provider_response || {}, error_message: e.message,
      sent_by: req.admin?.display_name || req.admin?.username || "الإدارة"
    });
    res.status(e.status_code || 500).json({ success: false, error: e.message || "فشل إرسال رسالة واتساب", provider_response: e.provider_response || null });
  }
});

router.post("/admin/whatsapp/send-bulk", requirePermission("whatsapp:send"), async (req, res) => {
  if (!isSupabaseReady(res)) return;
  const rawItems = Array.isArray(req.body.items) ? req.body.items : [];
  const mode = String(req.body.mode || "text").toLowerCase() === "template" ? "template" : "text";
  const templateName = String(req.body.template_name || req.body.templateName || WHATSAPP_DEFAULT_TEMPLATE).trim();
  const languageCode = String(req.body.language_code || req.body.languageCode || WHATSAPP_DEFAULT_LANGUAGE).trim();
  const messageType = String(req.body.message_type || req.body.messageType || "bulk_admin_message").trim().slice(0, 80);
  const bulkLabel = String(req.body.bulk_label || req.body.bulkLabel || "إرسال جماعي").trim().slice(0, 120);
  const bulkGroupId = crypto.randomUUID();

  if (!rawItems.length) return res.status(400).json({ success: false, error: "لا توجد أرقام صالحة للإرسال الجماعي" });
  if (rawItems.length > 100) return res.status(400).json({ success: false, error: "الحد الأقصى للإرسال الجماعي في العملية الواحدة هو 100 صنايعي" });

  const results = [];
  let sentCount = 0;
  let failedCount = 0;

  for (const item of rawItems) {
    const workerId = String(item.worker_id || item.workerId || "").trim();
    const rawPhone = String(item.phone || "").trim();
    const message = String(item.message || item.text || req.body.message || "").trim();
    let worker = null;
    try {
      if (workerId) {
        const { data } = await supabase.from("workers").select("id,name,phone,whatsapp").eq("id", workerId).single();
        worker = data || null;
      }
      const phone = rawPhone || worker?.whatsapp || worker?.phone || "";
      if (!phone) throw new Error("لا يوجد رقم واتساب صالح");
      const sent = await sendWhatsAppCloudMessage({ to: phone, message, mode, template_name: templateName, language_code: languageCode });
      const providerMessageId = sent.response?.messages?.[0]?.id || null;
      sentCount += 1;
      await insertWhatsAppLog({
        worker_id: workerId || null, worker_name: item.worker_name || item.workerName || worker?.name || null,
        phone: sent.recipient, message_type: messageType,
        message_text: mode === "template" ? `[template:${templateName}]` : message,
        send_mode: mode, template_name: mode === "template" ? templateName : null,
        status: "sent", provider_message_id: providerMessageId, provider_response: sent.response,
        sent_by: req.admin?.display_name || req.admin?.username || "الإدارة",
        bulk_group_id: bulkGroupId, bulk_label: bulkLabel
      });
      results.push({ worker_id: workerId || null, phone: sent.recipient, success: true, provider_message_id: providerMessageId });
    } catch (e) {
      failedCount += 1;
      const normalizedPhone = normalizeWhatsAppRecipient(rawPhone || worker?.whatsapp || worker?.phone || "");
      await insertWhatsAppLog({
        worker_id: workerId || null, worker_name: item.worker_name || item.workerName || worker?.name || null,
        phone: normalizedPhone || rawPhone || "unknown", message_type: messageType,
        message_text: mode === "template" ? `[template:${templateName}]` : message,
        send_mode: mode, template_name: mode === "template" ? templateName : null,
        status: "failed", provider_response: e.provider_response || {}, error_message: e.message,
        sent_by: req.admin?.display_name || req.admin?.username || "الإدارة",
        bulk_group_id: bulkGroupId, bulk_label: bulkLabel
      });
      results.push({ worker_id: workerId || null, phone: normalizedPhone || rawPhone || null, success: false, error: e.message || "فشل الإرسال" });
    }
    // مهلة بسيطة بين كل رسالة والتانية عشان منتصدمش بحد معدل الإرسال بتاع واتساب
    await new Promise(resolve => setTimeout(resolve, 120));
  }

  await logAdminActivity(req, "whatsapp_bulk_send", {
    entity_type: "whatsapp", entity_id: bulkGroupId, entity_name: bulkLabel,
    details: { mode, template_name: mode === "template" ? templateName : null, total: rawItems.length, sent: sentCount, failed: failedCount }
  });

  res.json({ success: true, message: "انتهى الإرسال الجماعي", bulk_group_id: bulkGroupId, total: rawItems.length, sent: sentCount, failed: failedCount, results });
});

// ===============================
// صندوق وارد واتساب (ردود العملاء/الصنايعية على الرسائل)
// ===============================
function safeWaText(value, max = 4000) {
  return String(value || "").trim().slice(0, max);
}

function waUnixToIso(value) {
  const n = Number(value || 0);
  if (!n) return null;
  try { return new Date(n * 1000).toISOString(); } catch (e) { return null; }
}

function whatsappIncomingText(message = {}) {
  const type = String(message.type || "unknown").toLowerCase();
  if (type === "text") return safeWaText(message.text?.body || "");
  if (type === "button") return safeWaText(message.button?.text || message.button?.payload || "زر واتساب");
  if (type === "interactive") {
    const i = message.interactive || {};
    return safeWaText(i.button_reply?.title || i.button_reply?.id || i.list_reply?.title || i.list_reply?.description || i.list_reply?.id || "رسالة تفاعلية");
  }
  if (type === "image") return safeWaText(message.image?.caption || "[صورة واردة]");
  if (type === "document") return safeWaText(message.document?.caption || message.document?.filename || "[ملف وارد]");
  if (type === "audio") return "[رسالة صوتية]";
  if (type === "video") return safeWaText(message.video?.caption || "[فيديو وارد]");
  if (type === "sticker") return "[ملصق وارد]";
  if (type === "location") return "[موقع جغرافي وارد]";
  if (type === "contacts") return "[جهات اتصال واردة]";
  return `[رسالة واتساب واردة: ${type}]`;
}

function whatsappIncomingMedia(message = {}) {
  const type = String(message.type || "").toLowerCase();
  const obj = message[type] || null;
  if (!obj || typeof obj !== "object") return {};
  return {
    media_id: obj.id || null,
    media_mime_type: obj.mime_type || null,
    media_sha256: obj.sha256 || null,
    media_filename: obj.filename || null
  };
}

async function findWorkerByIncomingWhatsAppPhone(phone) {
  try {
    if (!supabase) return null;
    const wanted = normalizeWorkerPhone(phone) || normalizeWhatsAppRecipient(phone);
    if (!wanted) return null;
    const { data, error } = await supabase
      .from("workers")
      .select("id,registration_code,name,phone,whatsapp,trade,area,approved,active")
      .order("id", { ascending: false })
      .limit(5000);
    if (error) return null;
    return (data || []).find(w => workerPhoneKeysFromValues(w.phone, w.whatsapp).includes(wanted)) || null;
  } catch (e) {
    return null;
  }
}

async function insertWhatsAppInboxMessage(row) {
  try {
    if (!supabase) return { skipped: true };
    const clean = { ...row };
    const { data: existing } = await supabase
      .from("whatsapp_inbox_messages")
      .select("id")
      .eq("provider_message_id", clean.provider_message_id)
      .maybeSingle();
    if (existing?.id) return { duplicate: true, id: existing.id };
    const { data, error } = await supabase
      .from("whatsapp_inbox_messages")
      .insert(clean)
      .select("id")
      .single();
    if (error) throw error;
    return { inserted: true, id: data?.id || null };
  } catch (e) {
    console.warn("تم تخطي حفظ رسالة واتساب واردة:", e.message);
    return { skipped: true, error: e.message };
  }
}

async function processWhatsAppIncomingMessage(value = {}, message = {}, contact = {}) {
  const from = normalizeWhatsAppRecipient(message.from || contact.wa_id || "");
  const worker = await findWorkerByIncomingWhatsAppPhone(from);
  const media = whatsappIncomingMedia(message);
  const row = {
    provider_message_id: String(message.id || ""),
    phone_number_id: String(value.metadata?.phone_number_id || WHATSAPP_PHONE_NUMBER_ID || ""),
    display_phone_number: String(value.metadata?.display_phone_number || ""),
    from_number: from || String(message.from || contact.wa_id || ""),
    wa_id: String(contact.wa_id || message.from || ""),
    profile_name: safeWaText(contact.profile?.name || "", 160),
    worker_id: worker?.id ? String(worker.id) : null,
    worker_name: worker?.name || null,
    message_type: String(message.type || "unknown").slice(0, 80),
    message_text: whatsappIncomingText(message),
    media_id: media.media_id,
    media_mime_type: media.media_mime_type,
    media_sha256: media.media_sha256,
    media_filename: media.media_filename,
    raw_payload: message,
    contact_payload: contact || {},
    worker_snapshot: worker ? {
      id: worker.id, registration_code: worker.registration_code || null,
      name: worker.name || "", phone: worker.phone || "", whatsapp: worker.whatsapp || "",
      trade: worker.trade || "", area: worker.area || "", approved: !!worker.approved, active: !!worker.active
    } : {},
    status: "new",
    received_at: waUnixToIso(message.timestamp) || new Date().toISOString()
  };
  if (!row.provider_message_id) row.provider_message_id = crypto.randomUUID();
  return insertWhatsAppInboxMessage(row);
}

async function handleWhatsAppWebhookPayload(body) {
  const results = { messages: 0, statuses: 0, inserted: 0, duplicates: 0, skipped: 0 };
  const entries = Array.isArray(body?.entry) ? body.entry : [];
  for (const entry of entries) {
    const changes = Array.isArray(entry?.changes) ? entry.changes : [];
    for (const change of changes) {
      const value = change?.value || {};
      const contactsByWaId = {};
      (Array.isArray(value.contacts) ? value.contacts : []).forEach(c => {
        if (c?.wa_id) contactsByWaId[String(c.wa_id)] = c;
      });
      const messages = Array.isArray(value.messages) ? value.messages : [];
      for (const msg of messages) {
        results.messages += 1;
        const contact = contactsByWaId[String(msg.from || "")] || {};
        const out = await processWhatsAppIncomingMessage(value, msg, contact);
        if (out.inserted) results.inserted += 1;
        else if (out.duplicate) results.duplicates += 1;
        else results.skipped += 1;
      }

      // حالات تسليم الرسائل اللي إحنا بعتناها (sent/delivered/read/failed)
      const statuses = Array.isArray(value.statuses) ? value.statuses : [];
      for (const st of statuses) {
        results.statuses += 1;
        try {
          const providerId = String(st.id || "");
          if (!providerId) continue;
          const update = { provider_response: st };
          if (String(st.status || "").toLowerCase() === "failed") {
            update.status = "failed";
            update.error_message = st.errors?.[0]?.message || st.errors?.[0]?.title || "WhatsApp delivery failed";
          }
          await supabase.from("whatsapp_message_logs").update(update).eq("provider_message_id", providerId);
        } catch (e) { /* تحديث حالة تسليم اختياري - تجاهل أي خطأ هنا */ }
      }
    }
  }
  return results;
}

function whatsappWebhookVerifyHandler(req, res) {
  const mode = req.query["hub.mode"];
  const token = req.query["hub.verify_token"];
  const challenge = req.query["hub.challenge"];
  if (mode === "subscribe" && token && WHATSAPP_WEBHOOK_VERIFY_TOKEN && token === WHATSAPP_WEBHOOK_VERIFY_TOKEN) {
    return res.status(200).send(String(challenge || ""));
  }
  return res.status(403).send("Forbidden");
}

async function whatsappWebhookPostHandler(req, res) {
  try {
    const result = await handleWhatsAppWebhookPayload(req.body || {});
    return res.status(200).json({ success: true, ...result });
  } catch (e) {
    console.error("WhatsApp webhook error:", e);
    // نرد بنجاح دايمًا (حتى لو حصل خطأ) عشان ميتا متعملش إعادة محاولة متكررة
    return res.status(200).json({ success: true, warning: e.message || "webhook processing skipped" });
  }
}

// Callback URL examples:
// https://your-domain.com/api/webhooks/whatsapp
// https://your-domain.com/api/whatsapp/webhook
router.get("/webhooks/whatsapp", whatsappWebhookVerifyHandler);
router.post("/webhooks/whatsapp", whatsappWebhookPostHandler);
router.get("/whatsapp/webhook", whatsappWebhookVerifyHandler);
router.post("/whatsapp/webhook", whatsappWebhookPostHandler);

router.get("/admin/whatsapp/inbox", requirePermission("whatsapp:send"), async (req, res) => {
  if (!isSupabaseReady(res)) return;
  const limit = Math.min(300, Math.max(1, Number(req.query.limit || 120)));
  const status = String(req.query.status || "all").trim();
  const workerId = String(req.query.worker_id || req.query.workerId || "").trim();
  const qRaw = String(req.query.q || "").trim().toLowerCase();
  try {
    let query = supabase.from("whatsapp_inbox_messages").select("*").order("received_at", { ascending: false }).limit(limit);
    if (status && status !== "all") query = query.eq("status", status);
    if (workerId) query = query.eq("worker_id", workerId);
    const { data, error } = await query;
    if (error) throw error;
    let items = data || [];
    if (qRaw) {
      items = items.filter(row => [row.profile_name, row.worker_name, row.from_number, row.wa_id, row.message_text, row.message_type]
        .join(" ").toLowerCase().includes(qRaw));
    }
    const totals = items.reduce((acc, row) => {
      acc.total += 1;
      const st = row.status || "new";
      acc[st] = (acc[st] || 0) + 1;
      if (!row.read_at && st !== "archived") acc.unread += 1;
      return acc;
    }, { total: 0, new: 0, read: 0, archived: 0, unread: 0 });
    return res.json({ success: true, items, totals });
  } catch (e) {
    return res.json({ success: true, items: [], totals: { total: 0, new: 0, read: 0, archived: 0, unread: 0 }, warning: "جدول whatsapp_inbox_messages غير موجود أو غير جاهز. شغّل docs/sql/whatsapp_inbox.sql أولًا." });
  }
});

router.put("/admin/whatsapp/inbox/:id/status", requirePermission("whatsapp:send"), async (req, res) => {
  if (!isSupabaseReady(res)) return;
  const msgId = String(req.params.id || "").trim();
  const status = String(req.body?.status || "read").trim();
  if (!msgId) return res.status(400).json({ success: false, error: "معرف الرسالة مطلوب" });
  if (!["new", "read", "archived"].includes(status)) return res.status(400).json({ success: false, error: "حالة الوارد غير صحيحة" });
  const update = { status };
  if (status === "read" || status === "archived") update.read_at = new Date().toISOString();
  if (status === "archived") update.archived_at = new Date().toISOString();
  const { error } = await supabase.from("whatsapp_inbox_messages").update(update).eq("id", msgId);
  if (error) return res.status(500).json({ success: false, error: error.message });
  return res.json({ success: true, status });
});

router.post("/admin/whatsapp/inbox/:id/reply", requirePermission("whatsapp:send"), async (req, res) => {
  if (!isSupabaseReady(res)) return;
  const msgId = String(req.params.id || "").trim();
  const message = String(req.body?.message || req.body?.text || "").trim();
  const mode = String(req.body?.mode || "text").toLowerCase() === "template" ? "template" : "text";
  const templateName = String(req.body?.template_name || req.body?.templateName || WHATSAPP_DEFAULT_TEMPLATE).trim();
  const languageCode = String(req.body?.language_code || req.body?.languageCode || WHATSAPP_DEFAULT_LANGUAGE).trim();
  if (!msgId) return res.status(400).json({ success: false, error: "معرف الرسالة مطلوب" });
  if (mode === "text" && !message) return res.status(400).json({ success: false, error: "اكتب نص الرد أولًا" });

  try {
    const { data: inbox, error: readError } = await supabase.from("whatsapp_inbox_messages").select("*").eq("id", msgId).single();
    if (readError || !inbox) return res.status(404).json({ success: false, error: "الرسالة الواردة غير موجودة" });
    const phone = inbox.from_number || inbox.wa_id;
    const sent = await sendWhatsAppCloudMessage({ to: phone, message, mode, template_name: templateName, language_code: languageCode });
    const providerMessageId = sent.response?.messages?.[0]?.id || null;
    await insertWhatsAppLog({
      worker_id: inbox.worker_id || null, worker_name: inbox.worker_name || inbox.profile_name || null,
      phone: sent.recipient, message_type: "inbox_reply",
      message_text: mode === "template" ? `[template:${templateName}]` : message,
      send_mode: mode, template_name: mode === "template" ? templateName : null,
      status: "sent", provider_message_id: providerMessageId, provider_response: sent.response,
      sent_by: req.admin?.display_name || req.admin?.username || "الإدارة"
    });
    await supabase.from("whatsapp_inbox_messages").update({ status: "read", read_at: new Date().toISOString(), replied_at: new Date().toISOString() }).eq("id", msgId);
    await logAdminActivity(req, "whatsapp_inbox_reply", {
      entity_type: "whatsapp", entity_id: msgId, entity_name: inbox.worker_name || inbox.profile_name || sent.recipient,
      details: { phone: sent.recipient, provider_message_id: providerMessageId }
    });
    return res.json({ success: true, message: "تم إرسال الرد", to: sent.recipient, provider_message_id: providerMessageId });
  } catch (e) {
    return res.status(e.status_code || 500).json({ success: false, error: e.message || "فشل إرسال الرد", provider_response: e.provider_response || null });
  }
});

module.exports = router;
