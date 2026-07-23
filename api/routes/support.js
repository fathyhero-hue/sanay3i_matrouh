const express = require("express");
const router = express.Router();
const crypto = require("crypto");
const { supabase, isSupabaseReady } = require("../config/supabase");
const { normalizeWorkerPhone } = require("../utils/helpers");
const { requirePermission } = require("../middlewares/auth");

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
    sender_name: row.sender_name || (row.sender_type === "admin" ? "خدمة العملاء" : "عميل"),
    message_text: row.message_text || "",
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
// مسارات الإدارة (عرض المحادثات والردود)
// ===============================
router.get("/admin/threads", requirePermission("workers:read"), async (req, res) => {
  if (!isSupabaseReady(res)) return;
  try {
    const convRes = await supabase.from("support_chat_conversations").select("*").order("last_message_at", { ascending: false }).limit(300);
    if (convRes.error) throw convRes.error;
    
    const convs = convRes.data || [];
    const threads = convs.map(c => ({ conversation: supportPublicConversation(c), latest: { message_text: "تحديث", created_at: c.last_message_at } }));
    return res.json({ success: true, threads, unread_count: 0 });
  } catch (e) {
    return res.status(500).json({ success: false, error: "تعذر تحميل محادثات خدمة العملاء" });
  }
});

module.exports = router;