const { clientIp } = require("../utils/helpers");
const { supabase } = require("../config/supabase");

// حارس بالذاكرة المحلية: بسيط لكن كل instance من السيرفر (على Vercel)
// عنده عداده الخاص، فمش بيحمي فعليًا لما يبقى فيه أكتر من instance شغال.
// بنستخدمه هنا كخط دفاع احتياطي بس لو قاعدة البيانات مش متاحة.
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

// الحارس الحقيقي: العداد متخزن في Supabase (rl_hit RPC) عشان يشتغل صح
// مهما كان عدد الـ instances. لو الجدول/الفانكشن لسه متعملوش في قاعدة
// البيانات (شوف docs/sql/rate_limit.sql)، بيرجع تلقائيًا لحماية الذاكرة
// بدل ما يوقف الموقع بالكامل.
let dbRateLimitWarned = false;

function createDbRateLimiter({ windowMs, max, keyFn, message, prefix }) {
  const fallback = createMemoryRateLimiter({ windowMs, max, keyFn, message });
  return async (req, res, next) => {
    const key = (prefix ? prefix + ":" : "") + (keyFn ? keyFn(req) : clientIp(req));
    try {
      const { data, error } = await supabase.rpc("rl_hit", {
        p_key: key,
        p_window_ms: windowMs,
        p_max: max
      });
      if (error) throw error;

      const row = Array.isArray(data) ? data[0] : data;
      if (!row) throw new Error("rl_hit: لا يوجد رد من قاعدة البيانات");

      res.setHeader("X-RateLimit-Limit", String(max));
      res.setHeader("X-RateLimit-Remaining", String(row.remaining ?? 0));

      if (!row.allowed) {
        return res.status(429).json({ success: false, error: message || "طلبات كثيرة جدًا. حاول مرة أخرى بعد قليل" });
      }
      return next();
    } catch (e) {
      // قاعدة البيانات مش جاهزة أو حصل خطأ اتصال - استخدم حماية الذاكرة المؤقتة كبديل
      if (!dbRateLimitWarned) {
        dbRateLimitWarned = true;
        console.warn("⚠️ rate limiter: rl_hit RPC غير متاحة، بيتم استخدام حماية الذاكرة المؤقتة. شغّل docs/sql/rate_limit.sql على Supabase. (" + (e.message || e) + ")");
      }
      return fallback(req, res, next);
    }
  };
}

// حارس لتسجيل الإحصائيات (لمنع السبام الوهمي)
const analyticsRateLimit = createDbRateLimiter({
  windowMs: 10 * 60 * 1000, // 10 دقائق
  max: Number(process.env.ANALYTICS_RATE_LIMIT || 180),
  keyFn: req => clientIp(req),
  prefix: "analytics",
  message: "تم تجاوز الحد المسموح لتسجيل الأحداث مؤقتًا"
});

// حارس للبلاغات (عشان مفيش حد يبعت 100 بلاغ في ثانية)
const reportsRateLimit = createDbRateLimiter({
  windowMs: 10 * 60 * 1000,
  max: Number(process.env.REPORTS_RATE_LIMIT || 20),
  keyFn: req => clientIp(req),
  prefix: "reports",
  message: "تم إرسال بلاغات كثيرة مؤقتًا. حاول مرة أخرى بعد قليل"
});

// حارس لتحديث بيانات التسجيل من الصنايعية
const registrationUpdateRateLimit = createDbRateLimiter({
  windowMs: 10 * 60 * 1000,
  max: Number(process.env.REGISTRATION_UPDATE_RATE_LIMIT || 12),
  keyFn: req => clientIp(req),
  prefix: "registration-update",
  message: "تم إرسال تعديلات كثيرة مؤقتًا. حاول مرة أخرى بعد قليل"
});

// حارس لطلبات لوحة الإدارة (حماية من محاولات التخمين والاختراق)
const adminApiRateLimit = createDbRateLimiter({
  windowMs: 60 * 1000,
  max: Number(process.env.ADMIN_API_RATE_LIMIT || 240),
  keyFn: req => clientIp(req),
  prefix: "admin-api",
  message: "طلبات لوحة الإدارة كثيرة جدًا. انتظر دقيقة ثم حاول مرة أخرى"
});

// حارس صارم على تسجيل دخول الأدمن (منع تخمين كلمة السر بالتكرار)
const adminLoginRateLimit = createDbRateLimiter({
  windowMs: 15 * 60 * 1000, // 15 دقيقة
  max: Number(process.env.ADMIN_LOGIN_RATE_LIMIT || 10),
  keyFn: req => clientIp(req),
  prefix: "admin-login",
  message: "محاولات دخول كثيرة جدًا. انتظر شوية وحاول تاني"
});

// حارس صارم على تسجيل دخول الصنايعي (منع تخمين كلمة السر بالتكرار)
const workerLoginRateLimit = createDbRateLimiter({
  windowMs: 15 * 60 * 1000,
  max: Number(process.env.WORKER_LOGIN_RATE_LIMIT || 15),
  keyFn: req => clientIp(req),
  prefix: "worker-login",
  message: "محاولات دخول كثيرة جدًا. انتظر شوية وحاول تاني"
});

// حارس لتسجيل حسابات العملاء الجدد (منع سبام إنشاء حسابات)
const customerRegisterRateLimit = createDbRateLimiter({
  windowMs: 60 * 60 * 1000, // ساعة
  max: Number(process.env.CUSTOMER_REGISTER_RATE_LIMIT || 10),
  keyFn: req => clientIp(req),
  prefix: "customer-register",
  message: "محاولات تسجيل كثيرة جدًا. حاول مرة أخرى بعد قليل"
});

// حارس صارم على تسجيل دخول العميل (منع تخمين كلمة السر بالتكرار)
const customerLoginRateLimit = createDbRateLimiter({
  windowMs: 15 * 60 * 1000,
  max: Number(process.env.CUSTOMER_LOGIN_RATE_LIMIT || 15),
  keyFn: req => clientIp(req),
  prefix: "customer-login",
  message: "محاولات دخول كثيرة جدًا. انتظر شوية وحاول تاني"
});

// حارس على تفعيل حساب صنايعي قديم (منع محاولات آلية لتخمين أرقام هواتف
// صنايعية قدامى وتعيين كلمة مرور على حساباتهم)
const workerActivationRateLimit = createDbRateLimiter({
  windowMs: 15 * 60 * 1000,
  max: Number(process.env.WORKER_ACTIVATION_RATE_LIMIT || 8),
  keyFn: req => clientIp(req),
  prefix: "worker-activation",
  message: "محاولات كثيرة لتفعيل الحساب. انتظر شوية وحاول تاني"
});

// حارس على اشتراك/إلغاء اشتراك Web Push (منع سبام تسجيل اشتراكات وهمية)
const pushSubscribeRateLimit = createDbRateLimiter({
  windowMs: 10 * 60 * 1000,
  max: Number(process.env.PUSH_SUBSCRIBE_RATE_LIMIT || 30),
  keyFn: req => clientIp(req),
  prefix: "push-subscribe",
  message: "محاولات كثيرة جدًا. حاول مرة أخرى بعد قليل"
});

module.exports = {
  analyticsRateLimit,
  reportsRateLimit,
  registrationUpdateRateLimit,
  adminApiRateLimit,
  adminLoginRateLimit,
  workerLoginRateLimit,
  customerRegisterRateLimit,
  customerLoginRateLimit,
  workerActivationRateLimit,
  pushSubscribeRateLimit,
  createMemoryRateLimiter,
  createDbRateLimiter
};