const express = require("express");
const router = express.Router();
const crypto = require("crypto");
const { supabase, isSupabaseReady, SUPABASE_ID_BUCKET } = require("../config/supabase");
const { normalizeWorkerPhone } = require("../utils/helpers");
const { requireCustomerAuth } = require("../middlewares/customerAuth");
const { requireWorkerOwnership } = require("../middlewares/auth");
const { chatUpload, chatAttachmentFile, uploadPrivateImage } = require("../controllers/uploadController");
const { createNotification } = require("../utils/notifications");
const { reportsRateLimit } = require("../middlewares/rateLimit");

const TICKET_TYPE_LABELS = { technical: "مشكلة تقنية", account: "الحساب", worker_issue: "مشكلة مع صنايعي", payment: "الدفع والاشتراك", other: "أخرى" };

// حارس بسيط بيحوّل :workerId في الرابط لـ params.id عشان نقدر نستخدم
// requireWorkerOwnership الحالي زي ما هو (نفس نمط serviceRequests.js/notifications.js)
function withWorkerIdParam(req, res, next) { req.params.id = req.params.workerId; next(); }

const SUPPORT_CHAT_TOKEN_TTL_MS = Number(process.env.SUPPORT_CHAT_TOKEN_TTL_MS || 7 * 24 * 60 * 60 * 1000);

function supportChatSecret() {
  return String(process.env.ADMIN_SESSION_SECRET || "sanay3i-support-chat-local-secret");
}

function b64urlJson(obj) {
  return Buffer.from(JSON.stringify(obj)).toString("base64").replace(/=/g, "").replace(/\+/g, "-").replace(/\//g, "_");
}

function fromB64url(value) {
  let v = String(value || "").replace(/-/g, "+").replace(/_/g, "/");
  while (v.length % 4) v += "=";
  return Buffer.from(v, "base64").toString("utf8");
}

function createSupportChatToken(conversationId, phoneKey) {
  const payload = { purpose: "customer-support-chat", conversation_id: Number(conversationId), phone_key: String(phoneKey || ""), exp: Date.now() + SUPPORT_CHAT_TOKEN_TTL_MS };
  const body = b64urlJson(payload);
  const sig = crypto.createHmac("sha256", supportChatSecret()).update(body).digest("base64").replace(/=/g, "").replace(/\+/g, "-").replace(/\//g, "_");
  return `${body}.${sig}`;
}

function verifySupportChatToken(token, expectedConversationId) {
  try {
    const parts = String(token || "").split(".");
    if (parts.length !== 2) return null;
    const [body, sig] = parts;
    const expected = crypto.createHmac("sha256", supportChatSecret()).update(body).digest("base64").replace(/=/g, "").replace(/\+/g, "-").replace(/\//g, "_");
    const a = Buffer.from(sig);
    const b = Buffer.from(expected);
    if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return null;
    const payload = JSON.parse(fromB64url(body));
    if (payload.purpose !== "customer-support-chat" || Date.now() > Number(payload.exp)) return null;
    if (expectedConversationId && Number(payload.conversation_id) !== Number(expectedConversationId)) return null;
    return payload;
  } catch (e) { return null; }
}

function supportTokenFromReq(req) {
  const auth = String(req.headers.authorization || "");
  if (auth.toLowerCase().startsWith("bearer ")) return auth.slice(7).trim();
  return String(req.body?.support_token || req.query?.support_token || "").trim();
}

function supportPublicConversation(row) {
  return {
    id: row.id,
    phone: row.phone || "",
    customer_name: row.customer_name || "عميل",
    status: row.status || "open",
    last_message_at: row.last_message_at || row.created_at,
    created_at: row.created_at
  };
}

function supportPublicMessage(row) {
  return {
    id: row.id,
    conversation_id: row.conversation_id,
    sender_type: row.sender_type,
    sender_name: row.sender_name || (row.sender_type === "admin" ? "خدمة العملاء" : row.sender_type === "system" ? "نظام" : "عميل"),
    message_text: row.message_text || "",
    attachment_url: row.attachment_url || null,
    is_system: !!row.is_system,
    is_read: !!row.is_read,
    created_at: row.created_at
  };
}

// ===============================
// مسارات العميل (بدء الشات وإرسال رسائل)
// ===============================
router.post("/start", async (req, res) => {
  if (!isSupabaseReady(res)) return;
  try {
    const phoneRaw = String(req.body?.phone || "").trim();
    const phoneKey = normalizeWorkerPhone(phoneRaw);
    const customerName = String(req.body?.name || "").trim().slice(0, 80);
    if (!phoneKey || phoneKey.length < 10) return res.status(400).json({ success: false, error: "اكتب رقم هاتف صحيح لبدء المحادثة" });

    let conv = null;
    const existing = await supabase.from("support_chat_conversations").select("*").eq("phone_key", phoneKey).eq("status", "open").order("last_message_at", { ascending: false }).limit(1);
    conv = (existing.data || [])[0] || null;
    
    if (!conv) {
      const inserted = await supabase.from("support_chat_conversations").insert({
        phone: phoneRaw, phone_key: phoneKey, customer_name: customerName || "عميل", status: "open", last_message_at: new Date().toISOString()
      }).select("*").single();
      conv = inserted.data;
      await supabase.from("support_chat_messages").insert({ conversation_id: conv.id, sender_type: "customer", sender_name: customerName || "عميل", message_text: "بدأ العميل محادثة جديدة.", is_read: false });
    }
    const token = createSupportChatToken(conv.id, phoneKey);
    return res.json({ success: true, token, conversation: supportPublicConversation(conv) });
  } catch (e) {
    return res.status(500).json({ success: false, error: "تعذر بدء المحادثة" });
  }
});

router.get("/messages", async (req, res) => {
  if (!isSupabaseReady(res)) return;
  try {
    const conversationId = Number(req.query.conversation_id || 0);
    const payload = verifySupportChatToken(supportTokenFromReq(req), conversationId);
    if (!payload) return res.status(403).json({ success: false, error: "انتهت جلسة المحادثة. اكتب رقم الهاتف مرة أخرى." });
    
    const convRes = await supabase.from("support_chat_conversations").select("*").eq("id", conversationId).single();
    if (convRes.error || !convRes.data) return res.status(404).json({ success: false, error: "المحادثة غير موجودة" });
    
    if (String(req.query.mark_read || "true") !== "false") {
      await supabase.from("support_chat_messages").update({ is_read: true, read_at: new Date().toISOString() }).eq("conversation_id", conversationId).eq("sender_type", "admin").eq("is_read", false);
    }
    
    const { data } = await supabase.from("support_chat_messages").select("*").eq("conversation_id", conversationId).order("created_at", { ascending: true }).limit(250);
    return res.json({ success: true, conversation: supportPublicConversation(convRes.data), messages: (data || []).map(supportPublicMessage) });
  } catch (e) {
    return res.status(500).json({ success: false, error: "تعذر تحميل المحادثة" });
  }
});

router.post("/messages", async (req, res) => {
  if (!isSupabaseReady(res)) return;
  try {
    const conversationId = Number(req.body?.conversation_id || 0);
    const payload = verifySupportChatToken(supportTokenFromReq(req), conversationId);
    if (!payload) return res.status(403).json({ success: false, error: "انتهت جلسة المحادثة. اكتب رقم الهاتف مرة أخرى." });
    
    const message = String(req.body?.message || "").trim();
    if (!message) return res.status(400).json({ success: false, error: "اكتب رسالتك أولًا" });
    
    const { data } = await supabase.from("support_chat_messages").insert({
      conversation_id: conversationId, sender_type: "customer", sender_name: "عميل", message_text: message, is_read: false
    }).select("*").single();
    
    await supabase.from("support_chat_conversations").update({ last_message_at: new Date().toISOString() }).eq("id", conversationId);
    return res.json({ success: true, message: "تم إرسال رسالتك لخدمة العملاء", row: supportPublicMessage(data) });
  } catch (e) {
    return res.status(500).json({ success: false, error: "تعذر إرسال الرسالة" });
  }
});

// ===============================
// نظام تذاكر الدعم (بند 22.8) - نفس جدول support_chat_conversations/messages
// الموجود بالفعل (توسعة، مش نظام موازٍ)، بس محمي بحساب العميل المسجّل
// (requireCustomerAuth) بدل التوكن المجهول القديم بالرقم، عشان الملكية
// تبقى مربوطة بالحساب الحقيقي مش برقم هاتف قابل للتزوير
// ===============================
function ticketSummary(row) {
  return {
    id: row.id,
    title: row.title || "",
    ticket_type: row.ticket_type || "other",
    ticket_type_label: TICKET_TYPE_LABELS[row.ticket_type] || "أخرى",
    priority: row.priority || "normal",
    status: row.status || "new",
    has_attachment: !!row.attachment_url,
    unread_count: row.customer_unread_count || 0,
    last_message_at: row.last_message_at || row.created_at,
    created_at: row.created_at
  };
}

// رابط Signed URL قصير الصلاحية للمرفق - نفس منطق صور بطاقات التوثيق بالظبط
// (مفيش رابط عام أبدًا، الملف نفسه مخزّن في الـBucket الخاص)
async function signedAttachmentUrl(filePath) {
  if (!filePath) return null;
  const { data } = await supabase.storage.from(SUPABASE_ID_BUCKET).createSignedUrl(filePath, 300);
  return data?.signedUrl || null;
}

// دوال عامة مشتركة بين العميل والصنايعي (نفس المنطق بالضبط، الفرق بس نوع
// الحساب وعمود الملكية) - عشان نتجنب تكرار نفس الكود مرتين
async function createConversation({ senderType, ownerId, ownerName, ownerPhone, ticketType, title, description, attachmentUrl }) {
  const insertRow = {
    phone: ownerPhone || "", phone_key: normalizeWorkerPhone(ownerPhone || ""),
    customer_name: ownerName, ticket_type: ticketType, title, status: "new",
    attachment_url: attachmentUrl, last_message_at: new Date().toISOString(),
    admin_unread_count: 1
  };
  if (senderType === "worker") insertRow.worker_id = ownerId;
  else insertRow.customer_id = ownerId;

  const { data: conv, error: convErr } = await supabase.from("support_chat_conversations").insert(insertRow).select("*").single();
  if (convErr) throw convErr;

  await supabase.from("support_chat_messages").insert({
    conversation_id: conv.id, sender_type: senderType, sender_id: ownerId, sender_name: ownerName, message_text: description, is_read: false
  });
  return conv;
}

async function findOwnedConversation(id, senderType, ownerId) {
  const { data: conv, error } = await supabase.from("support_chat_conversations").select("*").eq("id", id).maybeSingle();
  if (error) throw error;
  const ownerColumn = senderType === "worker" ? conv?.worker_id : conv?.customer_id;
  if (!conv || Number(ownerColumn) !== Number(ownerId)) return null;
  return conv;
}

async function addReply(conv, senderType, ownerId, ownerName, message) {
  const { data } = await supabase.from("support_chat_messages").insert({
    conversation_id: conv.id, sender_type: senderType, sender_id: ownerId, sender_name: ownerName, message_text: message, is_read: false
  }).select("*").single();
  await supabase.from("support_chat_conversations")
    .update({ last_message_at: new Date().toISOString(), admin_unread_count: (conv.admin_unread_count || 0) + 1 })
    .eq("id", conv.id);
  return data;
}

async function markConversationReadByOwner(convId) {
  await supabase.from("support_chat_messages").update({ is_read: true, read_at: new Date().toISOString() })
    .eq("conversation_id", convId).eq("sender_type", "admin").eq("is_read", false);
  await supabase.from("support_chat_conversations").update({ customer_unread_count: 0 }).eq("id", convId);
}

// ===============================
// مسارات العميل (محمية بحساب العميل الحقيقي - requireCustomerAuth)
// ===============================
router.post("/tickets", requireCustomerAuth, reportsRateLimit, chatUpload, async (req, res) => {
  if (!isSupabaseReady(res)) return;
  try {
    const ticketType = String(req.body?.ticket_type || "other").trim();
    const title = String(req.body?.title || "").trim().slice(0, 150);
    const description = String(req.body?.description || "").trim().slice(0, 1000);
    if (!title) return res.status(400).json({ success: false, error: "اكتب عنوان التذكرة" });
    if (!description) return res.status(400).json({ success: false, error: "اكتب وصف المشكلة" });

    const { data: customer, error: custErr } = await supabase.from("customers").select("id, name, phone").eq("id", req.customerId).maybeSingle();
    if (custErr) throw custErr;
    if (!customer) return res.status(401).json({ success: false, error: "الحساب غير موجود" });

    let attachmentUrl = null;
    const file = chatAttachmentFile(req);
    if (file) attachmentUrl = await uploadPrivateImage(file, "support-tickets");

    const conv = await createConversation({ senderType: "customer", ownerId: customer.id, ownerName: customer.name, ownerPhone: customer.phone, ticketType, title, description, attachmentUrl });
    res.json({ success: true, ticket: ticketSummary(conv) });
  } catch (err) {
    console.error("Create Support Ticket Error:", err);
    res.status(500).json({ success: false, error: err.message || "تعذر إنشاء التذكرة" });
  }
});

router.get("/tickets/mine", requireCustomerAuth, async (req, res) => {
  if (!isSupabaseReady(res)) return;
  try {
    const { data, error } = await supabase.from("support_chat_conversations").select("*").eq("customer_id", req.customerId).order("last_message_at", { ascending: false });
    if (error) throw error;
    res.json({ success: true, tickets: (data || []).map(ticketSummary) });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message || "تعذر تحميل تذاكرك" });
  }
});

router.get("/tickets/:id", requireCustomerAuth, async (req, res) => {
  if (!isSupabaseReady(res)) return;
  try {
    const conv = await findOwnedConversation(Number(req.params.id), "customer", req.customerId);
    if (!conv) return res.status(404).json({ success: false, error: "التذكرة غير موجودة" });
    await markConversationReadByOwner(conv.id); conv.customer_unread_count = 0;
    const { data: messages, error: msgErr } = await supabase.from("support_chat_messages").select("*").eq("conversation_id", conv.id).order("created_at", { ascending: true });
    if (msgErr) throw msgErr;
    res.json({ success: true, ticket: ticketSummary(conv), messages: (messages || []).map(supportPublicMessage) });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message || "تعذر تحميل التذكرة" });
  }
});

router.get("/tickets/:id/attachment", requireCustomerAuth, async (req, res) => {
  if (!isSupabaseReady(res)) return;
  try {
    const conv = await findOwnedConversation(Number(req.params.id), "customer", req.customerId);
    if (!conv) return res.status(404).json({ success: false, error: "التذكرة غير موجودة" });
    const url = await signedAttachmentUrl(conv.attachment_url);
    if (!url) return res.status(404).json({ success: false, error: "لا يوجد مرفق" });
    res.json({ success: true, url });
  } catch (err) {
    res.status(500).json({ success: false, error: "تعذر جلب المرفق" });
  }
});

router.post("/tickets/:id/reply", requireCustomerAuth, reportsRateLimit, async (req, res) => {
  if (!isSupabaseReady(res)) return;
  try {
    const message = String(req.body?.message || "").trim().slice(0, 2000);
    if (!message) return res.status(400).json({ success: false, error: "اكتب رسالتك أولًا" });
    const conv = await findOwnedConversation(Number(req.params.id), "customer", req.customerId);
    if (!conv) return res.status(404).json({ success: false, error: "التذكرة غير موجودة" });
    const data = await addReply(conv, "customer", req.customerId, conv.customer_name, message);
    res.json({ success: true, message: supportPublicMessage(data) });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message || "تعذر إرسال الرد" });
  }
});

// ===============================
// مسارات الصنايعي (محمية بـrequireWorkerOwnership - نفس نمط الملكية
// المستخدم في service_requests.js/notifications.js بالضبط)
// ===============================
router.post("/worker/:workerId/tickets", withWorkerIdParam, requireWorkerOwnership, reportsRateLimit, chatUpload, async (req, res) => {
  if (!isSupabaseReady(res)) return;
  try {
    const ticketType = String(req.body?.ticket_type || "other").trim();
    const title = String(req.body?.title || "").trim().slice(0, 150);
    const description = String(req.body?.description || "").trim().slice(0, 1000);
    if (!title) return res.status(400).json({ success: false, error: "اكتب عنوان التذكرة" });
    if (!description) return res.status(400).json({ success: false, error: "اكتب وصف المشكلة" });

    const { data: worker, error: workerErr } = await supabase.from("workers").select("id, name, phone").eq("id", req.workerId).maybeSingle();
    if (workerErr) throw workerErr;
    if (!worker) return res.status(404).json({ success: false, error: "الحساب غير موجود" });

    let attachmentUrl = null;
    const file = chatAttachmentFile(req);
    if (file) attachmentUrl = await uploadPrivateImage(file, "support-tickets");

    const conv = await createConversation({ senderType: "worker", ownerId: worker.id, ownerName: worker.name, ownerPhone: worker.phone, ticketType, title, description, attachmentUrl });
    res.json({ success: true, ticket: ticketSummary(conv) });
  } catch (err) {
    console.error("Create Worker Support Ticket Error:", err);
    res.status(500).json({ success: false, error: err.message || "تعذر إنشاء التذكرة" });
  }
});

router.get("/worker/:workerId/tickets", withWorkerIdParam, requireWorkerOwnership, async (req, res) => {
  if (!isSupabaseReady(res)) return;
  try {
    const { data, error } = await supabase.from("support_chat_conversations").select("*").eq("worker_id", req.workerId).order("last_message_at", { ascending: false });
    if (error) throw error;
    res.json({ success: true, tickets: (data || []).map(ticketSummary) });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message || "تعذر تحميل تذاكرك" });
  }
});

router.get("/worker/:workerId/tickets/:ticketId", withWorkerIdParam, requireWorkerOwnership, async (req, res) => {
  if (!isSupabaseReady(res)) return;
  try {
    const conv = await findOwnedConversation(Number(req.params.ticketId), "worker", req.workerId);
    if (!conv) return res.status(404).json({ success: false, error: "التذكرة غير موجودة" });
    await markConversationReadByOwner(conv.id); conv.customer_unread_count = 0;
    const { data: messages, error: msgErr } = await supabase.from("support_chat_messages").select("*").eq("conversation_id", conv.id).order("created_at", { ascending: true });
    if (msgErr) throw msgErr;
    res.json({ success: true, ticket: ticketSummary(conv), messages: (messages || []).map(supportPublicMessage) });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message || "تعذر تحميل التذكرة" });
  }
});

router.get("/worker/:workerId/tickets/:ticketId/attachment", withWorkerIdParam, requireWorkerOwnership, async (req, res) => {
  if (!isSupabaseReady(res)) return;
  try {
    const conv = await findOwnedConversation(Number(req.params.ticketId), "worker", req.workerId);
    if (!conv) return res.status(404).json({ success: false, error: "التذكرة غير موجودة" });
    const url = await signedAttachmentUrl(conv.attachment_url);
    if (!url) return res.status(404).json({ success: false, error: "لا يوجد مرفق" });
    res.json({ success: true, url });
  } catch (err) {
    res.status(500).json({ success: false, error: "تعذر جلب المرفق" });
  }
});

router.post("/worker/:workerId/tickets/:ticketId/reply", withWorkerIdParam, requireWorkerOwnership, reportsRateLimit, async (req, res) => {
  if (!isSupabaseReady(res)) return;
  try {
    const message = String(req.body?.message || "").trim().slice(0, 2000);
    if (!message) return res.status(400).json({ success: false, error: "اكتب رسالتك أولًا" });
    const conv = await findOwnedConversation(Number(req.params.ticketId), "worker", req.workerId);
    if (!conv) return res.status(404).json({ success: false, error: "التذكرة غير موجودة" });
    const data = await addReply(conv, "worker", req.workerId, conv.customer_name, message);
    res.json({ success: true, message: supportPublicMessage(data) });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message || "تعذر إرسال الرد" });
  }
});

module.exports = router;