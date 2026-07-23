const { clientIp } = require("../utils/helpers");

// هذه الدالة تصنع حارس أمن يمنع المستخدم من إرسال طلبات كثيرة في وقت قصير
// ملحوظة: تعمل حالياً في الذاكرة، وهي مناسبة لمنع الضغط المفاجئ
function createMemoryRateLimiter({ windowMs, max, keyFn, message }) {
  const hits = new Map();
  return (req, res, next) => {
    const now = Date.now();
    const key = keyFn ? keyFn(req) : clientIp(req);
    const item = hits.get(key) || { count: 0, resetAt: now + windowMs };
    
    // لو الوقت المسموح خلص، صفر العداد
    if (now > item.resetAt) {
      item.count = 0;
      item.resetAt = now + windowMs;
    }
    
    item.count += 1;
    hits.set(key, item);
    
    res.setHeader("X-RateLimit-Limit", String(max));
    res.setHeader("X-RateLimit-Remaining", String(Math.max(0, max - item.count)));
    
    // لو تجاوز الحد المسموح، نرفض الطلب
    if (item.count > max) {
      return res.status(429).json({ success: false, error: message || "طلبات كثيرة جدًا. حاول مرة أخرى بعد قليل" });
    }
    
    // لو كله تمام، اسمح للطلب يمر للخطوة اللي بعدها
    return next();
  };
}

// حارس لتسجيل الإحصائيات (لمنع السبام الوهمي)
const analyticsRateLimit = createMemoryRateLimiter({
  windowMs: 10 * 60 * 1000, // 10 دقائق
  max: Number(process.env.ANALYTICS_RATE_LIMIT || 180),
  keyFn: req => `analytics:${clientIp(req)}`,
  message: "تم تجاوز الحد المسموح لتسجيل الأحداث مؤقتًا"
});

// حارس للبلاغات (عشان مفيش حد يبعت 100 بلاغ في ثانية)
const reportsRateLimit = createMemoryRateLimiter({
  windowMs: 10 * 60 * 1000,
  max: Number(process.env.REPORTS_RATE_LIMIT || 20),
  keyFn: req => `reports:${clientIp(req)}`,
  message: "تم إرسال بلاغات كثيرة مؤقتًا. حاول مرة أخرى بعد قليل"
});

// حارس لتحديث بيانات التسجيل من الصنايعية
const registrationUpdateRateLimit = createMemoryRateLimiter({
  windowMs: 10 * 60 * 1000,
  max: Number(process.env.REGISTRATION_UPDATE_RATE_LIMIT || 12),
  keyFn: req => `registration-update:${clientIp(req)}`,
  message: "تم إرسال تعديلات كثيرة مؤقتًا. حاول مرة أخرى بعد قليل"
});

// حارس لطلبات لوحة الإدارة (حماية من محاولات التخمين والاختراق)
const adminApiRateLimit = createMemoryRateLimiter({
  windowMs: 60 * 1000,
  max: Number(process.env.ADMIN_API_RATE_LIMIT || 240),
  keyFn: req => `admin-api:${clientIp(req)}`,
  message: "طلبات لوحة الإدارة كثيرة جدًا. انتظر دقيقة ثم حاول مرة أخرى"
});

module.exports = {
  analyticsRateLimit,
  reportsRateLimit,
  registrationUpdateRateLimit,
  adminApiRateLimit,
  createMemoryRateLimiter
};