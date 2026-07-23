const express = require("express");
const path = require("path");
const multer = require("multer");
try { require("dotenv").config(); } catch(e) {}

const app = express();

// ===============================
// 1. الإعدادات الأساسية والحماية
// ===============================
app.use(express.json({ limit: "10mb" }));
app.use(express.urlencoded({ extended: true, limit: "10mb" }));
app.disable("x-powered-by"); // إخفاء نوع السيرفر لأسباب أمنية

app.use((req, res, next) => {
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.setHeader("X-Frame-Options", "DENY");
  res.setHeader("Referrer-Policy", "strict-origin-when-cross-origin");
  // منع تخزين صفحات الإدارة في الكاش لحماية البيانات
  if (req.path.startsWith("/admin") || req.path.startsWith("/api/admin")) {
    res.setHeader("Cache-Control", "no-store, no-cache, must-revalidate");
  }
  next();
});

// ===============================
// 2. تفعيل حراس الأمان (Rate Limiters)
// ===============================
const { adminApiRateLimit, analyticsRateLimit } = require("./middlewares/rateLimit");

// حماية مسارات الإدارة من التخمين المتكرر لكلمة السر
app.use("/api/admin", (req, res, next) => {
  if (req.path === "/login") return next();
  return adminApiRateLimit(req, res, next);
});

// ===============================
// 3. استدعاء وتفعيل المسارات (Routes)
// ===============================
const adminRoutes = require("./routes/admin");
const workersRoutes = require("./routes/workers");
const whatsappRoutes = require("./routes/whatsapp");
const supportRoutes = require("./routes/support");
const coreRoutes = require("./routes/core");

// ربط كل ملف بالرابط الخاص به
app.use("/api/admin", adminRoutes);
app.use("/api/workers", workersRoutes);
app.use("/api/sanaieya", workersRoutes); // لدعم الروابط القديمة إن وجدت
app.use("/api", whatsappRoutes);
app.use("/api/support-chat", supportRoutes);
app.use("/api", coreRoutes);

// ===============================
// 4. مسارات التحليلات والإحصائيات
// ===============================
const { supabase } = require("./config/supabase");

// تسجيل ضغطات العملاء (اتصال، واتساب، زيارة صفحة)
app.post("/api/analytics/track", analyticsRateLimit, async (req, res) => {
  try {
    const body = req.body || {};
    const eventType = String(body.event_type || body.type).trim().slice(0, 40);
    const allowed = new Set(["profile_view", "call", "whatsapp", "share", "filter_trade", "filter_area", "search"]);
    if (!allowed.has(eventType)) return res.status(400).json({ success: false });

    const row = {
      worker_id: String(body.worker_id || body.workerId).trim().slice(0, 80),
      event_type: eventType,
      source: String(body.source).trim().slice(0, 160),
      page_path: String(body.page_path || body.page || req.headers.referer || "").trim().slice(0, 500),
      user_agent: String(req.headers["user-agent"]).trim().slice(0, 500),
      ip_hash: "hidden-for-privacy"
    };
    await supabase.from("analytics_events").insert(row);
    return res.json({ success: true, tracked: true });
  } catch (e) {
    return res.json({ success: true, tracked: false });
  }
});

// ===============================
// 5. إعدادات الواجهة الأمامية والملفات الثابتة
// ===============================
const STATIC_DIR = path.join(__dirname, "..");

app.use(express.static(STATIC_DIR, {
  maxAge: process.env.NODE_ENV === "production" ? "7d" : 0
}));

// مسار صريح لملف التصميم (style.css) لضمان عدم ضياعه في الروابط الفرعية
app.get(["/style.css", "/*/style.css"], (req, res) => {
  res.type("text/css");
  res.setHeader("Cache-Control", process.env.NODE_ENV === "production" ? "public, max-age=604800" : "no-cache");
  res.sendFile(path.join(STATIC_DIR, "style.css"), (err) => {
    if (err) res.status(404).send("CSS not found");
  });
});

// مسار صريح لصورة الهيدر (Hero Banner) لضمان ظهورها
const MATROUH_HERO_BANNER_FILE = path.join(STATIC_DIR, "images", "matrouh-hero-banner.jpg");

app.get(["/api/static/matrouh-hero-banner.jpg", "/images/matrouh-hero-banner.jpg", "/matrouh-hero-banner.jpg"], (req, res) => {
  res.type("image/jpeg");
  res.setHeader("Cache-Control", process.env.NODE_ENV === "production" ? "public, max-age=604800" : "no-cache");
  res.sendFile(MATROUH_HERO_BANNER_FILE, (err) => {
    if (err) {
      res.status(404).send("Image not found");
    }
  });
});

// توجيه الصفحات لملفات HTML
app.get("/", (req, res) => res.sendFile(path.join(STATIC_DIR, "index.html")));
app.get("/register", (req, res) => res.sendFile(path.join(STATIC_DIR, "register.html")));
app.get("/status", (req, res) => res.sendFile(path.join(STATIC_DIR, "status.html")));
app.get("/admin", (req, res) => res.sendFile(path.join(STATIC_DIR, "admin.html")));
app.get("/admin/add-worker", (req, res) => res.sendFile(path.join(STATIC_DIR, "admin-add-worker.html")));
app.get("/worker/:id", (req, res) => res.sendFile(path.join(STATIC_DIR, "worker.html")));
app.get("/trade/:trade", (req, res) => res.sendFile(path.join(STATIC_DIR, "index.html")));
app.get("/area/:area", (req, res) => res.sendFile(path.join(STATIC_DIR, "index.html")));

// قراءة الأيقونات والصور الخاصة بالتطبيق
app.get("/icons/:fileName", (req, res) => {
  res.type("image/png");
  res.sendFile(path.join(STATIC_DIR, "icons", req.params.fileName));
});

// ملف الـ Robots لمحركات البحث (SEO)
app.get("/robots.txt", (req, res) => {
  res.type("text/plain");
  res.send("User-agent: *\nAllow: /\nDisallow: /admin\nDisallow: /api/\n");
});

// ===============================
// 6. معالجة الأخطاء الشاملة
// ===============================
app.use((err, req, res, next) => {
  if (err instanceof multer.MulterError) {
    return res.status(400).json({ success: false, error: "خطأ في رفع الملفات: " + err.message });
  }
  if (err && err.message) {
    const msg = String(err.message || "");
    if (msg.includes("الصورة") || msg.includes("image") || msg.includes("امتداد") || msg.includes("نوع")) {
      return res.status(400).json({ success: false, error: msg });
    }
  }
  console.error("Server Error:", err.message);
  res.status(500).json({ success: false, error: "حدث خطأ داخلي في الخادم" });
});

app.use((req, res, next) => {
  if (req.path.startsWith("/api")) return res.status(404).json({ success: false, error: "API route not found" });
  next();
});

// تصدير التطبيق ليعمل على استضافة Vercel
module.exports = app;