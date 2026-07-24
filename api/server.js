const express = require("express");
const path = require("path");
const multer = require("multer");
const fs = require("fs");
try { require("dotenv").config(); } catch(e) {}

const app = express();

// ===============================
// 1. الإعدادات الأساسية والحماية
// ===============================
app.use(express.json({ limit: "10mb" }));
app.use(express.urlencoded({ extended: true, limit: "10mb" }));
app.disable("x-powered-by");

app.use((req, res, next) => {
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.setHeader("X-Frame-Options", "DENY");
  res.setHeader("Referrer-Policy", "strict-origin-when-cross-origin");
  if (req.path.startsWith("/admin") || req.path.startsWith("/api/admin")) {
    res.setHeader("Cache-Control", "no-store, no-cache, must-revalidate");
  }
  next();
});

// ===============================
// 2. تفعيل حراس الأمان (Rate Limiters)
// ===============================
const { adminApiRateLimit, analyticsRateLimit } = require("./middlewares/rateLimit");

app.use("/api/admin", (req, res, next) => {
  if (req.path === "/login") return next();
  return adminApiRateLimit(req, res, next);
});

// ===============================
// 3. إعدادات رفع الملفات (Multer) لبيئة Vercel
// ===============================
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024 }
});

const { supabase } = require("./config/supabase");

async function uploadToSupabase(file) {
  if (!file) return null;
  const ext = path.extname(file.originalname || ".jpg");
  const fileName = Date.now() + "-" + Math.round(Math.random() * 1E9) + ext;
  const bucket = process.env.SUPABASE_BUCKET || "uploads";
  
  const { data, error } = await supabase.storage
    .from(bucket)
    .upload(fileName, file.buffer, {
      contentType: file.mimetype,
      upsert: false
    });
    
  if (error) {
    console.error("Supabase Upload Error:", error);
    throw error;
  }
  return fileName;
}

// ===============================
// 4. مسار فحص تكرار الأرقام عند التسجيل
// ===============================
app.get('/api/workers/check-duplicate', async (req, res) => {
  try {
    const { phone, whatsapp } = req.query;
    let query = supabase.from('workers').select('id, name, phone, whatsapp');
    
    if (phone && whatsapp) {
      query = query.or(`phone.eq.${phone},whatsapp.eq.${whatsapp},phone.eq.${whatsapp},whatsapp.eq.${phone}`);
    } else if (phone) {
      query = query.or(`phone.eq.${phone},whatsapp.eq.${phone}`);
    } else if (whatsapp) {
      query = query.or(`phone.eq.${whatsapp},whatsapp.eq.${whatsapp}`);
    } else {
      return res.json({ success: true, duplicate: false });
    }

    const { data, error } = await query.limit(1);
    if (error) throw error;

    if (data && data.length > 0) {
      return res.json({ success: true, duplicate: true, worker: data[0] });
    }
    res.json({ success: true, duplicate: false });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// ===============================
// 5. مسار استقبال تسجيلات الصنايعية الجدد (POST /api/register)
// ===============================
app.post('/api/register', upload.fields([
  { name: 'image', maxCount: 1 },
  { name: 'idFront', maxCount: 1 },
  { name: 'idBack', maxCount: 1 },
  { name: 'workPhotos', maxCount: 5 }
]), async (req, res) => {
  try {
    const body = req.body || {};
    const files = req.files || {};

    const name = String(body.name || '').trim();
    const phone = String(body.phone || '').trim();
    const whatsapp = String(body.whatsapp || body.phone || '').trim();
    const trade = String(body.trade || '').trim();
    const area = String(body.area || '').trim();
    const description = String(body.description || '').trim();

    if (!name || !phone || !trade || !area) {
      return res.status(400).json({ success: false, error: 'يرجى إكمال الحقول الأساسية المطلوبة' });
    }

    const profileImage = files.image && files.image[0] ? await uploadToSupabase(files.image[0]) : null;
    const idFrontImage = files.idFront && files.idFront[0] ? await uploadToSupabase(files.idFront[0]) : null;
    const idBackImage = files.idBack && files.idBack[0] ? await uploadToSupabase(files.idBack[0]) : null;
    
    let workPhotosArr = [];
    if (files.workPhotos && files.workPhotos.length > 0) {
      for (const file of files.workPhotos) {
        const uploadedName = await uploadToSupabase(file);
        if (uploadedName) workPhotosArr.push(uploadedName);
      }
    }

    const newWorker = {
      name,
      phone,
      whatsapp,
      trade,
      area,
      description,
      image: profileImage,
      id_front: idFrontImage,
      id_back: idBackImage,
      work_photos: workPhotosArr,
      approved: false,
      active: true,
      created_at: new Date().toISOString()
    };

    const { data, error } = await supabase.from('workers').insert([newWorker]).select().single();
    if (error) throw error;

    const workerId = data.id;
    const registrationCode = 'SN-' + new Date().getFullYear() + '-' + String(workerId).padStart(5, '0');

    await supabase.from('workers').update({ registration_code: registrationCode }).eq('id', workerId);

    return res.json({
      success: true,
      id: workerId,
      registration_code: registrationCode
    });
  } catch (err) {
    console.error('Registration Error:', err);
    return res.status(500).json({ success: false, error: err.message || 'حدث خطأ أثناء التسجيل' });
  }
});

// ===============================
// 5.5. مسارات الحذف، الإيقاف، والتجديد
// ===============================
app.delete('/api/workers/:id', adminApiRateLimit, async (req, res) => {
    try {
        const { error } = await supabase.from('workers').delete().eq('id', req.params.id);
        if (error) throw error;
        res.json({ success: true, message: 'تم الحذف بنجاح' });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
});

app.put('/api/workers/:id/active', adminApiRateLimit, async (req, res) => {
    try {
        const { active } = req.body;
        const { error } = await supabase.from('workers').update({ active }).eq('id', req.params.id);
        if (error) throw error;
        res.json({ success: true, message: 'تم تحديث حالة التفعيل' });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
});

app.put('/api/workers/:id/renew', adminApiRateLimit, async (req, res) => {
    try {
        const { months, amount, payment_method, payment_status, note } = req.body;
        const addMonths = parseInt(months) || 1;

        const { data: worker, error: fetchError } = await supabase
            .from('workers')
            .select('subscription_end')
            .eq('id', req.params.id)
            .single();

        if (fetchError) throw fetchError;

        let currentEnd = worker?.subscription_end ? new Date(worker.subscription_end) : new Date();
        if (currentEnd < new Date()) currentEnd = new Date();

        currentEnd.setMonth(currentEnd.getMonth() + addMonths);

        const { error: updateError } = await supabase
            .from('workers')
            .update({ subscription_end: currentEnd.toISOString() })
            .eq('id', req.params.id);

        if (updateError) throw updateError;

        res.json({ success: true, message: 'تم تجديد الاشتراك بنجاح' });
    } catch (err) {
        console.error('Renew Error:', err);
        res.status(500).json({ success: false, error: err.message });
    }
});

app.put('/api/admin/workers/renew-all', adminApiRateLimit, async (req, res) => {
    try {
        const { months } = req.body;
        const addMonths = parseInt(months) || 1;

        const { data: workers, error: fetchError } = await supabase.from('workers').select('id, subscription_end');
        if (fetchError) throw fetchError;

        const updatePromises = workers.map(worker => {
            let currentEnd = worker.subscription_end ? new Date(worker.subscription_end) : new Date();
            if (currentEnd < new Date()) currentEnd = new Date();
            currentEnd.setMonth(currentEnd.getMonth() + addMonths);

            return supabase.from('workers')
                .update({ subscription_end: currentEnd.toISOString() })
                .eq('id', worker.id);
        });

        await Promise.all(updatePromises);

        res.json({ success: true, message: `تم تجديد اشتراك ${workers.length} صنايعي بنجاح.` });
    } catch (err) {
        console.error('Renew All Error:', err);
        res.status(500).json({ success: false, error: err.message });
    }
});

// ===============================
// 6. استدعاء وتفعيل المسارات الأخرى
// ===============================
const adminRoutes = require("./routes/admin");
const workersRoutes = require("./routes/workers");
const whatsappRoutes = require("./routes/whatsapp");
const supportRoutes = require("./routes/support");
const coreRoutes = require("./routes/core");

app.use("/api/admin", adminRoutes);
app.use("/api/workers", workersRoutes);
app.use("/api/sanaieya", workersRoutes);
app.use("/api", whatsappRoutes);
app.use("/api/support-chat", supportRoutes);
app.use("/api", coreRoutes);

// ===============================
// 7. مسارات التحليلات والإحصائيات
// ===============================
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
// 8. الملفات الثابتة والصفحات (التعديل هنا)
// ===============================
const STATIC_DIR = path.join(__dirname, "..");

// السماح بالوصول لمجلد public الجديد (مهم جداً للـ CSS والـ JS)
app.use(express.static(path.join(STATIC_DIR, "public"), {
  maxAge: process.env.NODE_ENV === "production" ? "7d" : 0
}));

// السماح بالوصول للملفات في الجذر القديم
app.use(express.static(STATIC_DIR, {
  maxAge: process.env.NODE_ENV === "production" ? "7d" : 0
}));

app.get(["/style.css", "/*/style.css"], (req, res) => {
  res.type("text/css");
  res.setHeader("Cache-Control", process.env.NODE_ENV === "production" ? "public, max-age=604800" : "no-cache");
  res.sendFile(path.join(STATIC_DIR, "style.css"), (err) => {
    if (err) res.status(404).send("CSS not found");
  });
});

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

app.get("/uploads/:fileName", (req, res) => {
  const bucket = process.env.SUPABASE_BUCKET || "uploads";
  const { data } = supabase.storage.from(bucket).getPublicUrl(req.params.fileName);
  if (data && data.publicUrl) {
    res.redirect(data.publicUrl);
  } else {
    res.status(404).send("Image not found");
  }
});

app.get("/", (req, res) => res.sendFile(path.join(STATIC_DIR, "index.html")));
app.get("/register", (req, res) => res.sendFile(path.join(STATIC_DIR, "register.html")));
app.get("/status", (req, res) => res.sendFile(path.join(STATIC_DIR, "status.html")));
app.get("/admin", (req, res) => res.sendFile(path.join(STATIC_DIR, "admin.html")));
app.get("/admin/add-worker", (req, res) => res.sendFile(path.join(STATIC_DIR, "admin-add-worker.html")));
app.get("/worker/:id", (req, res) => res.sendFile(path.join(STATIC_DIR, "worker.html")));
app.get("/trade/:trade", (req, res) => res.sendFile(path.join(STATIC_DIR, "index.html")));
app.get("/area/:area", (req, res) => res.sendFile(path.join(STATIC_DIR, "index.html")));

app.get("/icons/:fileName", (req, res) => {
  res.type("image/png");
  res.sendFile(path.join(STATIC_DIR, "icons", req.params.fileName));
});

app.get("/robots.txt", (req, res) => {
  res.type("text/plain");
  res.send("User-agent: *\nAllow: /\nDisallow: /admin\nDisallow: /api/\n");
});

// ===============================
// 9. معالجة الأخطاء والتشغيل
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

module.exports = app;

const PORT = process.env.PORT || 3000;
if (!process.env.VERCEL) {
  app.listen(PORT, () => {
    console.log('-------------------------------------------');
    console.log(`Sanay3i Matrouh server is running locally`);
    console.log(`http://localhost:${PORT}`);
    console.log('-------------------------------------------');
  });
}
