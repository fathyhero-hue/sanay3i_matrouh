const http2 = require("http2");
const jwt = require("jsonwebtoken");
const { supabase } = require("../config/supabase");
const { buildSafeTitleAndBody } = require("./push");

// طبقة توصيل APNs (iOS Native Push عبر Capacitor) فوق نظام notifications
// الحالي - إضافية بالكامل وموازية لـ utils/push.js (Web Push)، ولا تغيّر
// عقد createNotification. أي فشل هنا لازم يتبلع بهدوء وميوقفش أي عملية
// أساسية، ولا يؤثر على مسار Web Push بأي شكل.
//
// اخترنا استدعاء APNs مباشرة عبر HTTP/2 + JWT (ES256) بدل مكتبة "apn" على
// npm لأن آخر إصدار ليها قديم جدًا (غير محدّث منذ سنوات) - Node's built-in
// http2 + jsonwebtoken (موجودة أصلًا كـ dependency في المشروع) كافيين
// تمامًا لبروتوكول APNs Token-based Auth الموثق من Apple، بدون أي مكتبة
// خارجية إضافية غير ضرورية.

const APPLE_TEAM_ID = process.env.APPLE_TEAM_ID || "";
const APPLE_KEY_ID = process.env.APPLE_KEY_ID || "";
const APPLE_BUNDLE_ID = process.env.APPLE_BUNDLE_ID || "";
// المفتاح الخاص .p8 - بيتخزن كمتغير بيئة نصي، مع دعم \n مهرّبة (نفس نمط
// تخزين أي سر متعدد الأسطر في هذا المشروع)
const APPLE_APNS_PRIVATE_KEY = (process.env.APPLE_APNS_PRIVATE_KEY || "").replace(/\\n/g, "\n");
const APPLE_APNS_PRODUCTION = /^(1|true|yes)$/i.test(process.env.APPLE_APNS_PRODUCTION || "");

const APNS_HOST = APPLE_APNS_PRODUCTION ? "api.push.apple.com" : "api.sandbox.push.apple.com";

function apnsConfigured() {
  return !!(APPLE_TEAM_ID && APPLE_KEY_ID && APPLE_BUNDLE_ID && APPLE_APNS_PRIVATE_KEY);
}

let warnedOnce = false;
function warnUnconfiguredOnce() {
  if (warnedOnce) return;
  warnedOnce = true;
  console.warn("APNs غير مُعد (متغيرات البيئة ناقصة) - تخطي إرسال إشعارات iOS بهدوء");
}

// JWT التوثيق (ES256) صالح لحد ساعة - Apple بتطلب إعادة توليده كل أقل من
// ساعة، فبنعيد استخدامه لو لسه صالح بدل ما نولّد واحد جديد كل طلب
let cachedToken = null;
let cachedTokenAt = 0;
const TOKEN_TTL_MS = 50 * 60 * 1000; // أقل من الساعة المسموحة بأمان

function getAuthToken() {
  const now = Date.now();
  if (cachedToken && (now - cachedTokenAt) < TOKEN_TTL_MS) return cachedToken;
  cachedToken = jwt.sign({ iss: APPLE_TEAM_ID, iat: Math.floor(now / 1000) }, APPLE_APNS_PRIVATE_KEY, {
    algorithm: "ES256",
    header: { alg: "ES256", kid: APPLE_KEY_ID }
  });
  cachedTokenAt = now;
  return cachedToken;
}

async function fetchActiveTokens(ownerType, ownerId) {
  const { data, error } = await supabase
    .from("ios_push_tokens")
    .select("*")
    .eq("owner_type", ownerType)
    .eq("owner_id", Number(ownerId))
    .eq("is_active", true);
  if (error) throw error;
  return data || [];
}

async function deactivateToken(id) {
  try {
    await supabase.from("ios_push_tokens").update({ is_active: false }).eq("id", id);
  } catch (e) {
    console.warn("تعذر تعطيل توكن APNs منتهي:", e.message);
  }
}

async function touchLastUsed(id) {
  try {
    await supabase.from("ios_push_tokens").update({ last_used_at: new Date().toISOString() }).eq("id", id);
  } catch (e) {
    // تجاهل - مش حرج
  }
}

// إرسال طلب واحد لـ APNs عبر HTTP/2 - يفتح اتصال مستقل لكل استدعاء (best
// effort بسيط، مفيش pooling معقد هنا لأن حجم الإشعارات في المشروع ده قليل)
function sendOne(deviceToken, payloadObj) {
  return new Promise((resolve, reject) => {
    let client;
    try {
      client = http2.connect(`https://${APNS_HOST}`);
    } catch (e) {
      return reject(e);
    }
    client.on("error", (err) => reject(err));

    const payload = JSON.stringify(payloadObj);
    const req = client.request({
      ":method": "POST",
      ":path": `/3/device/${deviceToken}`,
      "authorization": `bearer ${getAuthToken()}`,
      "apns-topic": APPLE_BUNDLE_ID,
      "apns-push-type": "alert",
      "content-type": "application/json",
      "content-length": Buffer.byteLength(payload)
    });

    let status = null;
    let body = "";
    req.on("response", (headers) => { status = headers[":status"]; });
    req.on("data", (chunk) => { body += chunk; });
    req.on("end", () => {
      client.close();
      resolve({ status, body });
    });
    req.on("error", (err) => {
      try { client.close(); } catch (e) {}
      reject(err);
    });

    req.end(payload);
  });
}

// إرسال إشعار APNs لكل توكنات صاحب إشعار معيّن (عميل/صنايعي/إدارة).
// best-effort بالكامل: أي خطأ هنا لازم ميوصلش لمين ما نادى الدالة، ولازم
// ميوقفش/يبطّئ مسار Web Push الموازي بأي شكل.
async function sendApnsToOwner(ownerType, ownerId, notification) {
  try {
    if (!ownerType || !ownerId || !notification) return;
    if (!apnsConfigured()) { warnUnconfiguredOnce(); return; }

    const tokens = await fetchActiveTokens(ownerType, ownerId);
    if (!tokens.length) return;

    const notificationId = notification.id ?? notification.notification_id ?? null;
    const { title, body } = buildSafeTitleAndBody({ type: notification.type, title: notification.title });

    const payload = {
      aps: { alert: { title, body }, sound: "default" },
      notification_id: notificationId,
      type: notification.type || "general",
      url: notification.link || "/"
    };

    await Promise.all(tokens.map(async (t) => {
      try {
        const { status } = await sendOne(t.device_token, payload);
        if (status === 200) {
          touchLastUsed(t.id);
        } else if (status === 400 || status === 410) {
          // BadDeviceToken / Unregistered - توكن غير صالح، عطّله
          await deactivateToken(t.id);
        } else {
          console.warn("فشل إرسال APNs إلى توكن #" + t.id + " (status=" + status + ")");
        }
      } catch (err) {
        console.warn("فشل إرسال APNs إلى توكن #" + t.id + ":", err.message || err);
      }
    }));
  } catch (e) {
    console.warn("تم تخطي إرسال APNs:", e.message);
  }
}

module.exports = { sendApnsToOwner, apnsConfigured };
