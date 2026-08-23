const express = require("express");
const router = express.Router();
const { supabase } = require("../config/supabase");
const { requirePermission } = require("../middlewares/auth");
const { uploadImage, mainFile, secureImageFileFilter } = require("../controllers/uploadController");
const multer = require("multer");

// نفس فلتر/حدود رفع الصور المستخدم في باقي المشروع (صورة واحدة اختيارية لكل
// سلايد) - بنعيد استخدام uploadImage() من uploadController بدل تكرار منطق
// Multer/التحقق من نوع الملف، وبنستخدم نفس secureImageFileFilter (JPG/PNG/WEBP
// فقط + فحص الامتداد) بدل ترك الـMulter من غير فلتر نوع ملف عند الرفع هنا.
const sliderImageUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 6 * 1024 * 1024, files: 1 },
  fileFilter: secureImageFileFilter
}).fields([{ name: "image", maxCount: 1 }]);

// يلتقط أخطاء fileFilter/حجم الملف من Multer ويرجعها كرسالة عربية واضحة
// بدل ما تتسرب كـ500 عام أو Multer Error خام للواجهة
function handleSliderUploadErrors(req, res, next) {
  sliderImageUpload(req, res, (err) => {
    if (err) return res.status(400).json({ success: false, error: err.message || "فشل رفع الصورة" });
    next();
  });
}

// ==========================================
// Hero Slides - سلايدر البانر العلوي (بند 12 سابقًا: كان HERO_CAMPAIGNS ثابت
// في home.js بمنطق months موسمي؛ دلوقتي جدول قابل للإدارة بالكامل بجدولة
// start_at/end_at حقيقية بدل الشهور فقط)
// ==========================================

// عام: يرجّع بس الشرائح الفعالة والمجدولة صح الآن، مرتبة بـsort_order. لو
// مفيش شرائح مطابقة بيرجع مصفوفة فاضية - الواجهة الأمامية بتخفي السلايدر
// بالكامل في الحالة دي بدل ما تعرض حاجة فاضية أو Placeholder وهمي.
router.get("/hero-slides", async (req, res) => {
  const nowIso = new Date().toISOString();
  const { data, error } = await supabase
    .from("hero_slides")
    .select("*")
    .eq("is_active", true)
    .or(`start_at.is.null,start_at.lte.${nowIso}`)
    .or(`end_at.is.null,end_at.gte.${nowIso}`)
    .order("sort_order", { ascending: true });

  if (error) return res.json([]);
  res.json(data || []);
});

// إدارة: كل الشرائح (نشطة وغير نشطة) لعرضها في لوحة الإدارة
router.get("/admin/hero-slides", requirePermission("settings:manage"), async (req, res) => {
  const { data, error } = await supabase.from("hero_slides").select("*").order("sort_order", { ascending: true });
  if (error) return res.status(500).json({ success: false, error: error.message });
  res.json({ success: true, data: data || [] });
});

function heroSlidePayload(body) {
  const payload = {
    title: String(body.title || "").trim(),
    description: body.description != null ? String(body.description).trim() : null,
    button_text: body.button_text != null ? String(body.button_text).trim() : null,
    button_link: body.button_link != null ? String(body.button_link).trim() : null,
    sort_order: Number(body.sort_order) || 0,
    is_active: body.is_active === undefined ? true : (body.is_active === true || body.is_active === "true" || body.is_active === "1" || body.is_active === 1),
    start_at: body.start_at ? new Date(body.start_at).toISOString() : null,
    end_at: body.end_at ? new Date(body.end_at).toISOString() : null,
    updated_at: new Date().toISOString()
  };
  return payload;
}

router.post("/admin/hero-slides", requirePermission("settings:manage"), handleSliderUploadErrors, async (req, res) => {
  try {
    const payload = heroSlidePayload(req.body);
    if (!payload.title) return res.status(400).json({ success: false, error: "العنوان مطلوب" });

    const uploaded = mainFile(req) ? await uploadImage(mainFile(req), "hero-slides") : "";
    payload.image = uploaded || String(req.body.image || "").trim();
    if (!payload.image) return res.status(400).json({ success: false, error: "الصورة مطلوبة (ارفع ملف أو أدخل رابط)" });

    const { data, error } = await supabase.from("hero_slides").insert(payload).select().single();
    if (error) return res.status(500).json({ success: false, error: error.message });
    res.json({ success: true, data });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message || "خطأ في إنشاء الشريحة" });
  }
});

router.put("/admin/hero-slides/:id", requirePermission("settings:manage"), handleSliderUploadErrors, async (req, res) => {
  try {
    const payload = heroSlidePayload(req.body);
    const uploaded = mainFile(req) ? await uploadImage(mainFile(req), "hero-slides") : "";
    if (uploaded) payload.image = uploaded;
    else if (req.body.image) payload.image = String(req.body.image).trim();

    const { data, error } = await supabase.from("hero_slides").update(payload).eq("id", Number(req.params.id)).select().maybeSingle();
    if (error) return res.status(500).json({ success: false, error: error.message });
    if (!data) return res.status(404).json({ success: false, error: "الشريحة غير موجودة" });
    res.json({ success: true, data });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message || "خطأ في تعديل الشريحة" });
  }
});

router.delete("/admin/hero-slides/:id", requirePermission("settings:manage"), async (req, res) => {
  const { error } = await supabase.from("hero_slides").delete().eq("id", Number(req.params.id));
  if (error) return res.status(500).json({ success: false, error: error.message });
  res.json({ success: true });
});

// ==========================================
// Stats Slider - سلايدر الإحصائيات تحت شريط البحث (بديل بطاقتي "صنايعي
// متاح"/"حرفة مختلفة" الثابتتين)
// ==========================================

// مفاتيح المقاييس المسموحة + دالة حساب كل مقياس مباشرة من الجداول الحقيقية.
// COUNT(*) بسيطة بس ضد أعمدة موجودة فعلاً (approved/active/identity_verified/
// availability_status في workers، وجدول trades/areas المستقلين) - القيمة
// بتترجع لحظيًا مع كل طلب، مفيش تخزين لها في الجدول أبدًا.
const METRIC_LABELS = {
  workers_count: "صنايعي متاح",
  trades_count: "حرفة مختلفة",
  verified_workers_count: "صنايعي موثّق",
  available_workers_count: "صنايعي متاح الآن",
  areas_count: "منطقة نخدمها"
};

async function computeMetric(key) {
  switch (key) {
    case "workers_count": {
      const { count } = await supabase.from("workers").select("id", { count: "exact", head: true }).eq("approved", true).eq("active", true);
      return count || 0;
    }
    case "trades_count": {
      const { count } = await supabase.from("trades").select("id", { count: "exact", head: true });
      return count || 0;
    }
    case "verified_workers_count": {
      const { count } = await supabase.from("workers").select("id", { count: "exact", head: true }).eq("approved", true).eq("active", true).eq("identity_verified", true);
      return count || 0;
    }
    case "available_workers_count": {
      const { count } = await supabase.from("workers").select("id", { count: "exact", head: true }).eq("approved", true).eq("active", true).eq("availability_status", "available");
      return count || 0;
    }
    case "areas_count": {
      const { count } = await supabase.from("areas").select("id", { count: "exact", head: true });
      return count || 0;
    }
    default:
      return 0;
  }
}

// عام: العناصر الفعالة مرتبة، مع حساب لحظي لقيمة أي عنصر من نوع metric
router.get("/stats-slider", async (req, res) => {
  const { data, error } = await supabase
    .from("stats_slider_items")
    .select("*")
    .eq("is_active", true)
    .order("sort_order", { ascending: true });

  if (error) return res.json([]);

  const items = await Promise.all((data || []).map(async (item) => {
    if (item.type === "metric") {
      const value = await computeMetric(item.metric_key);
      return {
        ...item,
        title: item.title || METRIC_LABELS[item.metric_key] || item.metric_key,
        value: String(value)
      };
    }
    return item;
  }));

  res.json(items);
});

router.get("/admin/stats-slider", requirePermission("settings:manage"), async (req, res) => {
  const { data, error } = await supabase.from("stats_slider_items").select("*").order("sort_order", { ascending: true });
  if (error) return res.status(500).json({ success: false, error: error.message });
  res.json({ success: true, data: data || [], metric_keys: Object.keys(METRIC_LABELS), metric_labels: METRIC_LABELS, color_themes: Array.from(ALLOWED_COLOR_THEMES) });
});

// لوحة ألوان ثابتة فقط - بدون أي CSS حر من الإدارة (مطابقة لتوكنز التصميم في
// public/css/global.css: navy/blue/green/gold وbنفسجي زي badge-top-rated)
const ALLOWED_COLOR_THEMES = new Set(["navy", "blue", "green", "amber", "purple"]);

function statsItemPayload(body) {
  const type = body.type === "custom" ? "custom" : "metric";
  const requestedTheme = String(body.color_theme || "").trim();
  const payload = {
    type,
    metric_key: type === "metric" ? String(body.metric_key || "").trim() : null,
    title: body.title != null ? String(body.title).trim() || null : null,
    value: type === "custom" ? String(body.value != null ? body.value : "").trim() : null,
    subtitle: body.subtitle != null ? String(body.subtitle).trim() : null,
    icon: body.icon != null ? String(body.icon).trim() : null,
    color_theme: ALLOWED_COLOR_THEMES.has(requestedTheme) ? requestedTheme : "blue",
    sort_order: Number(body.sort_order) || 0,
    is_active: body.is_active === undefined ? true : (body.is_active === true || body.is_active === "true" || body.is_active === "1" || body.is_active === 1),
    updated_at: new Date().toISOString()
  };
  return payload;
}

router.post("/admin/stats-slider", requirePermission("settings:manage"), async (req, res) => {
  const payload = statsItemPayload(req.body);
  if (payload.type === "metric" && !METRIC_LABELS[payload.metric_key]) {
    return res.status(400).json({ success: false, error: "مقياس غير معروف" });
  }
  if (payload.type === "custom" && !payload.title) {
    return res.status(400).json({ success: false, error: "العنوان مطلوب للعنصر المخصص" });
  }
  const { data, error } = await supabase.from("stats_slider_items").insert(payload).select().single();
  if (error) return res.status(500).json({ success: false, error: error.message });
  res.json({ success: true, data });
});

router.put("/admin/stats-slider/:id", requirePermission("settings:manage"), async (req, res) => {
  const payload = statsItemPayload(req.body);
  if (payload.type === "metric" && !METRIC_LABELS[payload.metric_key]) {
    return res.status(400).json({ success: false, error: "مقياس غير معروف" });
  }
  if (payload.type === "custom" && !payload.title) {
    return res.status(400).json({ success: false, error: "العنوان مطلوب للعنصر المخصص" });
  }
  const { data, error } = await supabase.from("stats_slider_items").update(payload).eq("id", Number(req.params.id)).select().maybeSingle();
  if (error) return res.status(500).json({ success: false, error: error.message });
  if (!data) return res.status(404).json({ success: false, error: "العنصر غير موجود" });
  res.json({ success: true, data });
});

router.delete("/admin/stats-slider/:id", requirePermission("settings:manage"), async (req, res) => {
  const { error } = await supabase.from("stats_slider_items").delete().eq("id", Number(req.params.id));
  if (error) return res.status(500).json({ success: false, error: error.message });
  res.json({ success: true });
});

module.exports = router;
