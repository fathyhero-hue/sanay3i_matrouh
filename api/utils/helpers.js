const crypto = require("crypto");

// تاريخ اليوم بصيغة YYYY-MM-DD
function today() {
  return new Date().toISOString().split("T")[0];
}

// إضافة شهور لتاريخ محدد (بنستخدمها لحساب نهاية الاشتراك)
function addMonths(start, months) {
  const d = start ? new Date(start) : new Date();
  if (isNaN(d.getTime())) d.setTime(Date.now());
  d.setMonth(d.getMonth() + months);
  return d.toISOString().split("T")[0];
}

// تمديد نهاية الاشتراك: من نهاية الاشتراك الحالي لو لسه ما انتهاش، أو من
// النهاردة لو منتهي/مش موجود أصلاً - نفس منطق مسارات التجديد الموجودة
function extendSubscription(currentEndIso, months) {
  const now = new Date();
  let currentEnd = currentEndIso ? new Date(currentEndIso) : new Date(now);
  if (isNaN(currentEnd.getTime()) || currentEnd < now) currentEnd = new Date(now);
  currentEnd.setMonth(currentEnd.getMonth() + (parseInt(months, 10) || 1));
  return currentEnd.toISOString();
}

// تحويل أي قيمة لـ (صح أو خطأ) boolean
function bool(v) {
  return v === true || v === "true" || v === "1" || v === 1;
}

// تحويل الأرقام العربية (١٢٣) إلى إنجليزية (123) وتنظيف رقم الهاتف
function normalizeWorkerPhone(raw) {
  let d = String(raw || "")
    .replace(/[٠-٩]/g, c => "٠١٢٣٤٥٦٧٨٩".indexOf(c))
    .replace(/[۰-۹]/g, c => "۰۱۲۳۴۵۶۷۸۹".indexOf(c))
    .replace(/\D/g, "");
  if (!d) return "";
  if (d.startsWith("0020")) d = d.slice(2);
  if (d.startsWith("20") && d.length === 12) d = "0" + d.slice(2);
  if (d.length === 10 && /^(10|11|12|15)/.test(d)) d = "0" + d;
  return d;
}

// استخراج أرقام الهواتف للبحث بها وتجنب التكرار
function workerPhoneKeysFromValues(phone, whatsapp) {
  const keys = [normalizeWorkerPhone(phone), normalizeWorkerPhone(whatsapp)].filter(Boolean);
  return Array.from(new Set(keys));
}

// إنتاج رقم طلب موحد للصنايعي (مثل SN-2026-00001)
function makeRegistrationCode(workerId, createdAt) {
  const year = new Date(createdAt || Date.now()).getFullYear();
  const num = String(workerId || 0).padStart(5, "0");
  return `SN-${year}-${num}`;
}

// استخراج عنوان IP الخاص بالعميل (مهم جداً للحماية من السبام)
function clientIp(req) {
  return String(req.headers["x-forwarded-for"] || req.socket?.remoteAddress || "")
    .split(",")[0].trim() || "unknown";
}

// التحقق من صيغة بريد إلكتروني بسيطة وكافية
function isValidEmail(email) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(email || "").trim());
}

// توليد توكن عشوائي آمن (لروابط إعادة تعيين كلمة المرور)
function generateSecureToken(bytes = 32) {
  return crypto.randomBytes(bytes).toString("hex");
}

// تجزئة التوكن بـ SHA-256 قبل تخزينه في قاعدة البيانات (التوكن الصريح ميتخزنش أبداً)
function hashToken(token) {
  return crypto.createHash("sha256").update(String(token || "")).digest("hex");
}

// تصدير كل الدوال عشان نستخدمها بره الملف
module.exports = {
  today,
  addMonths,
  extendSubscription,
  bool,
  normalizeWorkerPhone,
  workerPhoneKeysFromValues,
  makeRegistrationCode,
  clientIp,
  isValidEmail,
  generateSecureToken,
  hashToken
};