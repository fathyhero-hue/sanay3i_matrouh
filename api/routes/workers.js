const express = require("express");
const router = express.Router();
const { supabase, SUPABASE_ID_BUCKET, isSupabaseReady } = require("../config/supabase");
const { today, addMonths, bool, normalizeWorkerPhone, workerPhoneKeysFromValues, makeRegistrationCode } = require("../utils/helpers");
const { attachSmartScoresToWorkers } = require("../utils/smartScore");
const { requirePermission } = require("../middlewares/auth");
const { workerUpload, uploadImage, uploadPrivateImage, mainFile, workFiles, idFrontFile, idBackFile } = require("../controllers/uploadController");
const { logAdminActivity } = require("../utils/activityLogger");

// العواميد المسموح بعرضها للعملاء
const PUBLIC_WORKER_COLUMNS = "id,name,phone,whatsapp,trade,area,description,image,approved,active,featured,identity_verified,subscription_start,subscription_end,created_at";

// دالة فحص التكرار (لتجنب تسجيل نفس الصنايعي مرتين بنفس الرقم)
// بدل سحب كل جدول الصنايعية (ممكن يبقى آلاف الصفوف) مع كل تسجيل، بنعمل فلترة أولية
// في قاعدة البيانات على آخر أرقام الهاتف (suffix) عشان نقلل عدد الصفوف اللي بترجع،
// وبعدين نطبّق نفس منطق المطابقة الدقيقة (بعد تطبيع الرقم) على النتائج القليلة دي بس.
async function findDuplicateWorkerByPhone(phone, whatsapp, excludeId) {
  const keys = workerPhoneKeysFromValues(phone, whatsapp);
  if (!keys.length) return null;
  const suffixes = Array.from(new Set(keys.map(k => k.slice(-9)).filter(s => s.length >= 6)));
  if (!suffixes.length) return null;

  const orFilter = suffixes.map(s => `phone.ilike.%${s}%,whatsapp.ilike.%${s}%`).join(",");
  const { data, error } = await supabase.from("workers").select("id,name,phone,whatsapp").or(orFilter).limit(200);
  if (error) throw error;
  const exclude = excludeId !== undefined && excludeId !== null ? String(excludeId) : "";
  for (const worker of (data || [])) {
    if (exclude && String(worker.id) === exclude) continue;
    const otherKeys = workerPhoneKeysFromValues(worker.phone, worker.whatsapp);
    const matched = keys.find(k => otherKeys.includes(k));
    if (matched) {
      return { id: worker.id, name: worker.name || "صنايعي", phone: worker.phone || "", whatsapp: worker.whatsapp || "", matched };
    }
  }
  return null;
}

// 1. جلب قائمة الصنايعية للعملاء (الصفحة الرئيسية)
router.get("/", async (req, res) => {
  if (!isSupabaseReady(res)) return;
  const limit = Math.min(Math.max(Number(req.query.limit || 1200) || 1200, 1), 3000);
  
  try {
    const { data, error } = await supabase
      .from("workers")
      .select(PUBLIC_WORKER_COLUMNS)
      .eq("approved", true)
      .eq("active", true)
      .eq("identity_status", "verified")
      .or(`subscription_end.is.null,subscription_end.gte.${today()}`)
      .order("featured", { ascending: false })
      .order("created_at", { ascending: false })
      .limit(limit);
      
    if (error) throw error;
    
    // حساب التقييم الذكي للترتيب
    const scored = await attachSmartScoresToWorkers(data || []);
    
    // 🚀 Vercel Edge Caching: هنا نستخدم التخزين السحابي لـ Vercel لسرعة خارقة بدلاً من ذاكرة السيرفر
    res.setHeader("Cache-Control", "s-maxage=60, stale-while-revalidate=120");
    res.json(scored);
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// 2. جلب بيانات صنايعي واحد (صفحة التفاصيل)
router.get("/:id", async (req, res) => {
  if (!isSupabaseReady(res)) return;
  const id = Number(req.params.id);
  // ملحوظة: صفحة البروفايل الفردي تفضل متاحة برابط مباشر حتى قبل التوثيق
  // (الحساب "متاح على التطبيق" لصاحبه فور التسجيل) — الإخفاء عن العملاء بيتم فقط
  // في قائمة البحث العامة (GET /) عن طريق فلتر identity_status أعلاه.
  const { data, error } = await supabase
    .from("workers")
    .select(PUBLIC_WORKER_COLUMNS + ",deleted_at")
    .eq("id", id)
    .single();
  if (error || !data || data.deleted_at) return res.status(404).json({ success: false, error: "الصنايعي غير موجود" });
  delete data.deleted_at;

  const scored = await attachSmartScoresToWorkers([data]);
  res.json(scored[0] || data);
});

// 3. تسجيل صنايعي جديد من التطبيق
router.post("/register", workerUpload, async (req, res) => {
  if (!isSupabaseReady(res)) return;
  try {
    const { name, phone, whatsapp, trade, area, description } = req.body;
    if (!name || !phone || !trade || !area) {
      return res.status(400).json({ success: false, error: "الاسم ورقم الاتصال والحرفة والمنطقة مطلوبين" });
    }

    const duplicate = await findDuplicateWorkerByPhone(phone, whatsapp);
    if (duplicate) {
      return res.status(409).json({
        success: false,
        error: `هذا الرقم مسجل بالفعل باسم ${duplicate.name}. لا يمكن تسجيل نفس الرقم أكثر من مرة.`,
        duplicate: true,
        duplicate_worker_id: duplicate.id
      });
    }

    // صور البطاقة الشخصية اختيارية - مش شرط لإتمام التسجيل
    const frontFile = idFrontFile(req);
    const backFile = idBackFile(req);

    const image = mainFile(req) ? await uploadImage(mainFile(req), "profiles") : "";
    const id_front_path = frontFile ? await uploadPrivateImage(frontFile, "id-cards") : "";
    const id_back_path = backFile ? await uploadPrivateImage(backFile, "id-cards") : "";

    const start = today();
    const end = addMonths(start, 1); // إعطاء شهر مجاني للمسجل الجديد

    const { data: worker, error } = await supabase.from("workers").insert({
      name: String(name).trim(),
      phone: String(phone).trim(),
      whatsapp: whatsapp ? String(whatsapp).trim() : "",
      trade: String(trade).trim(),
      area: String(area).trim(),
      description: description ? String(description).trim() : "",
      image,
      id_front_path,
      id_back_path,
      id_submitted_at: (id_front_path || id_back_path) ? new Date().toISOString() : null,
      identity_status: "pending",
      identity_verified: false,
      approved: false,
      active: true,
      featured: false,
      subscription_start: start,
      subscription_end: end
    }).select().single();
    
    if (error) throw error;
    
    const registrationCode = makeRegistrationCode(worker.id, worker.created_at);
    await supabase.from("workers").update({ registration_code: registrationCode }).eq("id", worker.id);
    
    // رفع صور الأعمال إن وجدت
    const photos = [];
    for (const f of workFiles(req)) {
      photos.push({ worker_id: worker.id, image: await uploadImage(f, "work-photos") });
    }
    if (photos.length) {
      await supabase.from("worker_photos").insert(photos);
    }
    
    await logAdminActivity(req, "worker_register", {
      entity_type: "worker", entity_id: worker.id, entity_name: worker.name,
      details: { registration_code: registrationCode, trade, area }
    });
    
    res.json({ success: true, message: "تم إرسال طلب التسجيل بنجاح", id: worker.id, registration_code: registrationCode });
  } catch (e) {
    res.status(500).json({ success: false, error: e.message || "حدث خطأ أثناء التسجيل" });
  }
});

// 4. حذف صنايعي (للإدارة فقط بفضل الميدل وير requirePermission)
router.delete("/:id", requirePermission("workers:delete"), async (req, res) => {
  if (!isSupabaseReady(res)) return;
  const id = Number(req.params.id);
  const { data: worker } = await supabase.from("workers").select("id,name,phone,trade,area").eq("id", id).single();
  const { error } = await supabase.from("workers").delete().eq("id", id);
  if (error) return res.status(500).json({ success: false, error: error.message });
  
  await logAdminActivity(req, "worker_delete", {
    entity_type: "worker", entity_id: id, entity_name: worker?.name || "صنايعي",
    details: { phone: worker?.phone, trade: worker?.trade, area: worker?.area }
  });
  res.json({ success: true });
});

module.exports = router;
module.exports.findDuplicateWorkerByPhone = findDuplicateWorkerByPhone;