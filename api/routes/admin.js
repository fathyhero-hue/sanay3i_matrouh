const express = require("express");
const router = express.Router();
const crypto = require("crypto");
const { supabase, isSupabaseReady } = require("../config/supabase");
const { today, addMonths, bool, clientIp, makeRegistrationCode } = require("../utils/helpers");
const {
  requirePermission,
  createAdminToken,
  setAdminCookie,
  clearAdminCookie,
  publicAdmin,
  ADMIN_ROLES,
  getAdminFromRequest
} = require("../middlewares/auth");
const { logAdminActivity } = require("../utils/activityLogger");
const { workerUpload, uploadImage, uploadPrivateImage, mainFile, workFiles, idFrontFile, idBackFile } = require("../controllers/uploadController");
const { findDuplicateWorkerByPhone } = require("./workers");

const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || "123456";
const ADMIN_PASSWORD_ITERATIONS = 120000;

function hashAdminPassword(password, salt = crypto.randomBytes(16).toString("hex")) {
  const hash = crypto.pbkdf2Sync(String(password || ""), salt, ADMIN_PASSWORD_ITERATIONS, 64, "sha256").toString("hex");
  return { salt, hash };
}

function verifyAdminUserPassword(row, password) {
  if (!row || !row.password_salt || !row.password_hash) return false;
  const { hash } = hashAdminPassword(password, row.password_salt);
  const a = Buffer.from(hash);
  const b = Buffer.from(String(row.password_hash || ""));
  if (a.length !== b.length) return false;
  return crypto.timingSafeEqual(a, b);
}

function safePasswordEqual(input, expected) {
  const a = Buffer.from(String(input || ""));
  const b = Buffer.from(String(expected || ""));
  if (a.length !== b.length) return false;
  return crypto.timingSafeEqual(a, b);
}

router.post("/login", async (req, res) => {
  try {
    if (!process.env.ADMIN_SESSION_SECRET) {
      return res.status(500).json({ success: false, error: "ADMIN_SESSION_SECRET غير مضبوط في إعدادات السيرفر" });
    }

    const username = String(req.body?.username || "").trim().toLowerCase();
    const password = String(req.body?.password || "");

    if (username) {
      try {
        if (isSupabaseReady()) {
          const { data: user, error } = await supabase
            .from("admin_users")
            .select("id,username,display_name,role,password_salt,password_hash,active")
            .eq("username", username)
            .eq("active", true)
            .maybeSingle();

          if (!error && user && verifyAdminUserPassword(user, password)) {
            const admin = publicAdmin(user);
            setAdminCookie(res, createAdminToken(admin));
            await supabase.from("admin_users").update({ last_login_at: new Date().toISOString() }).eq("id", user.id).catch(() => {});
            return res.json({ success: true, admin });
          }
        }
      } catch (dbErr) {
        console.error("Database login check error:", dbErr);
      }
    }

    const envPassword = process.env.ADMIN_PASSWORD || "123456";
    if (password && (password === envPassword || safePasswordEqual(password, envPassword))) {
      const admin = publicAdmin({ id: null, username: "env_admin", display_name: "المدير الرئيسي", role: "super_admin" });
      setAdminCookie(res, createAdminToken(admin));
      return res.json({ success: true, admin });
    }

    return res.status(401).json({ success: false, error: "اسم المستخدم أو كلمة السر غير صحيحة" });
  } catch (err) {
    console.error("Login route exception:", err);
    return res.status(500).json({ success: false, error: err.message || "حدث خطأ داخلي في الخادم" });
  }
});

router.post("/logout", (req, res) => {
  clearAdminCookie(res);
  return res.json({ success: true });
});

router.get("/me", (req, res) => {
  const admin = getAdminFromRequest(req);
  return res.json({ authenticated: !!admin, admin: publicAdmin(admin), roles: ADMIN_ROLES });
});

router.get("/users", requirePermission("admin_users:manage"), async (req, res) => {
  if (!isSupabaseReady(res)) return;
  const { data, error } = await supabase
    .from("admin_users")
    .select("id,username,display_name,role,active,created_at,last_login_at")
    .order("id", { ascending: true });
  if (error) return res.status(500).json({ success: false, error: "جدول admin_users غير موجود." });
  res.json({ success: true, items: data || [], roles: ADMIN_ROLES });
});

router.post("/users", requirePermission("admin_users:manage"), async (req, res) => {
  if (!isSupabaseReady(res)) return;
  const username = String(req.body?.username || "").trim().toLowerCase();
  const displayName = String(req.body?.display_name || username).trim();
  const role = req.body?.role || "viewer";
  const password = String(req.body?.password || "");
  
  if (!/^[a-z0-9_.-]{3,40}$/.test(username)) return res.status(400).json({ success: false, error: "اسم المستخدم يجب أن يكون إنجليزي/أرقام من 3 إلى 40 حرف" });
  if (password.length < 8) return res.status(400).json({ success: false, error: "كلمة السر يجب ألا تقل عن 8 أحرف" });
  
  const { salt, hash } = hashAdminPassword(password);
  const { data, error } = await supabase.from("admin_users").insert({
    username, display_name: displayName, role, password_salt: salt, password_hash: hash, active: true
  }).select("id,username,display_name,role,active,created_at,last_login_at").single();
  
  if (error) return res.status(500).json({ success: false, error: "تعذر إنشاء مستخدم الإدارة. تأكد أن اسم المستخدم غير مكرر." });
  
  await logAdminActivity(req, "admin_user_create", { entity_type: "admin_user", entity_id: data.id, entity_name: data.display_name });
  res.json({ success: true, user: data });
});

router.delete("/users/:id", requirePermission("admin_users:manage"), async (req, res) => {
  if (!isSupabaseReady(res)) return;
  const userId = Number(req.params.id);
  if (req.admin && String(req.admin.id || "") === String(userId)) return res.status(400).json({ success: false, error: "لا يمكن حذف حسابك الحالي" });
  
  const { data: before } = await supabase.from("admin_users").select("*").eq("id", userId).single();
  const { error } = await supabase.from("admin_users").delete().eq("id", userId);
  if (error) return res.status(500).json({ success: false, error: "تعذر حذف المستخدم" });
  
  await logAdminActivity(req, "admin_user_delete", { entity_type: "admin_user", entity_id: userId, entity_name: before?.display_name });
  res.json({ success: true });
});

router.get("/dashboard-stats", requirePermission("analytics:read"), async (req, res) => {
  if (!isSupabaseReady(res)) return;
  const t = today();
  
  try {
    const [workersRes, reviewsRes] = await Promise.all([
      supabase.from("workers").select("id,approved,active,featured,subscription_end"),
      supabase.from("reviews").select("id,approved")
    ]);

    if (workersRes.error) throw workersRes.error;

    const workers = workersRes.data || [];
    const reviews = reviewsRes.data || [];

    const approvedWorkers = workers.filter(w => bool(w.approved));
    const pendingWorkers = workers.filter(w => !bool(w.approved));
    const featuredWorkers = workers.filter(w => bool(w.featured));
    const activeSubs = workers.filter(w => !w.subscription_end || w.subscription_end >= t);
    
    const pendingReviews = reviews.filter(r => !bool(r.approved));

    res.json({
      success: true,
      workers: {
        total: workers.length,
        approved: approvedWorkers.length,
        pending: pendingWorkers.length,
        featured: featuredWorkers.length
      },
      subscriptions: { active: activeSubs.length },
      reviews: { total: reviews.length, pending: pendingReviews.length }
    });
  } catch (e) {
    res.status(500).json({ success: false, error: e.message || "تعذر تحميل الإحصائيات" });
  }
});

// ===============================
// مسار التحليلات الاحترافي (Smart Analytics)
// ===============================
router.get('/analytics', requirePermission("analytics:read"), async (req, res) => {
  if (!isSupabaseReady(res)) return;
  try {
    const days = parseInt(req.query.days) || 30;
    const dateLimit = new Date();
    dateLimit.setDate(dateLimit.getDate() - days);

    const { data: events, error } = await supabase
      .from('analytics_events')
      .select('*')
      .gte('created_at', dateLimit.toISOString());

    if (error) throw error;

    const totals = { call: 0, whatsapp: 0, profile_view: 0, total_contacts: 0, total_events: events?.length || 0 };
    const workerStats = {};
    const tradeStats = {};
    const areaStats = {};
    const pageStats = {};

    (events || []).forEach(ev => {
      const type = ev.event_type;
      const wid = String(ev.worker_id).trim();

      if (type === 'call') { totals.call++; totals.total_contacts++; }
      if (type === 'whatsapp') { totals.whatsapp++; totals.total_contacts++; }
      if (type === 'profile_view') totals.profile_view++;

      if (ev.page_path) pageStats[ev.page_path] = (pageStats[ev.page_path] || 0) + 1;

      if (wid && wid !== 'undefined' && wid !== 'null') {
        if (!workerStats[wid]) workerStats[wid] = { call: 0, whatsapp: 0, profile_view: 0, total_contacts: 0 };
        if (type === 'call') { workerStats[wid].call++; workerStats[wid].total_contacts++; }
        if (type === 'whatsapp') { workerStats[wid].whatsapp++; workerStats[wid].total_contacts++; }
        if (type === 'profile_view') workerStats[wid].profile_view++;
      }
    });

    const workerIds = Object.keys(workerStats);
    let workersData = [];
    if (workerIds.length > 0) {
      const { data: wData } = await supabase.from('workers').select('*').in('id', workerIds);
      workersData = wData || [];
    }

    const topWorkers = [];
    workersData.forEach(w => {
      const stats = workerStats[String(w.id)];
      if (stats) {
        topWorkers.push({ worker_id: w.id, worker: w, ...stats });
        if (w.trade) tradeStats[w.trade] = (tradeStats[w.trade] || 0) + stats.total_contacts;
        if (w.area) areaStats[w.area] = (areaStats[w.area] || 0) + stats.total_contacts;
      }
    });

    topWorkers.sort((a, b) => b.total_contacts - a.total_contacts);
    const formatTop = (obj) => Object.entries(obj).map(([name, count]) => ({ name, count })).sort((a, b) => b.count - a.count);

    totals.conversion_rate = totals.profile_view > 0 ? ((totals.total_contacts / totals.profile_view) * 100).toFixed(1) : 0;

    res.json({
      success: true,
      totals,
      top_workers: topWorkers.slice(0, 10),
      top_trades: formatTop(tradeStats),
      top_areas: formatTop(areaStats),
      top_pages: formatTop(pageStats)
    });
  } catch (err) {
    console.error('Analytics Error:', err);
    res.status(500).json({ success: false, error: err.message });
  }
});

// ===============================
// مسارات البلاغات والشكاوى (Reports API) [تمت الإضافة هنا]
// ===============================
router.get("/reports", requirePermission("reports:read"), async (req, res) => {
  if (!isSupabaseReady(res)) return;
  try {
    const { data: reports, error } = await supabase
      .from("reports")
      .select("*, worker:workers(id, name, trade, area)")
      .order("id", { ascending: false });

    if (error) {
      return res.json({ success: true, items: [], stats: { total: 0, new: 0, reviewing: 0, resolved: 0, rejected: 0 } });
    }

    const items = reports || [];
    const stats = {
      total: items.length,
      new: items.filter(r => r.status === 'new').length,
      reviewing: items.filter(r => r.status === 'reviewing').length,
      resolved: items.filter(r => r.status === 'resolved').length,
      rejected: items.filter(r => r.status === 'rejected').length
    };

    res.json({ success: true, items, stats });
  } catch (e) {
    res.status(500).json({ success: false, error: e.message || "تعذر تحميل البلاغات" });
  }
});

router.put("/reports/:id", requirePermission("reports:manage"), async (req, res) => {
  if (!isSupabaseReady(res)) return;
  try {
    const reportId = req.params.id;
    const { status, admin_note } = req.body;

    const updateData = {};
    if (status) updateData.status = status;
    if (admin_note !== undefined) updateData.admin_note = admin_note;

    const { error } = await supabase
      .from("reports")
      .update(updateData)
      .eq("id", reportId);

    if (error) throw error;

    res.json({ success: true, message: "تم تحديث البلاغ بنجاح" });
  } catch (e) {
    res.status(500).json({ success: false, error: e.message || "تعذر تحديث البلاغ" });
  }
});

router.get("/activity-log", requirePermission("activity_log:read"), async (req, res) => {
  if (!isSupabaseReady(res)) return;
  const limit = Math.max(10, Math.min(500, Number(req.query.limit) || 150));
  const { data, error } = await supabase.from("admin_activity_log").select("*").order("id", { ascending: false }).limit(limit);
  if (error) {
    return res.json({ success: true, items: [], warning: "جدول admin_activity_log غير موجود." });
  }
  res.json({ success: true, items: data || [] });
});

// ===============================
// إضافة صنايعي يدويًا من الإدارة (admin-add-worker.html)
// ===============================
router.post("/workers/create", requirePermission("workers:create"), workerUpload, async (req, res) => {
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

    const frontFile = idFrontFile(req);
    const backFile = idBackFile(req);
    if ((frontFile && !backFile) || (!frontFile && backFile)) {
      return res.status(400).json({ success: false, error: "لو هترفع البطاقة لازم ترفع الوجه والظهر معًا" });
    }

    const image = mainFile(req) ? await uploadImage(mainFile(req), "profiles") : "";
    const id_front_path = frontFile ? await uploadPrivateImage(frontFile, "id-cards") : "";
    const id_back_path = backFile ? await uploadPrivateImage(backFile, "id-cards") : "";
    const hasFullId = !!(id_front_path && id_back_path);

    const approved = bool(req.body.approved);
    const active = bool(req.body.active);
    const featured = bool(req.body.featured);
    const identityVerified = hasFullId && bool(req.body.identity_verified);

    const start = today();
    const months = Math.max(1, Math.min(60, Number(req.body.subscription_months) || 1));
    const end = addMonths(start, months);

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
      id_submitted_at: hasFullId ? new Date().toISOString() : null,
      identity_status: identityVerified ? "verified" : "pending",
      identity_verified: identityVerified,
      approved,
      active,
      featured,
      subscription_start: start,
      subscription_end: end
    }).select().single();

    if (error) {
      if (error.code === "23505") {
        return res.status(400).json({ success: false, error: "رقم الهاتف مسجل بالفعل لصنايعي آخر" });
      }
      throw error;
    }

    const registrationCode = makeRegistrationCode(worker.id, worker.created_at);
    await supabase.from("workers").update({ registration_code: registrationCode }).eq("id", worker.id);

    const photos = [];
    for (const f of workFiles(req)) {
      photos.push({ worker_id: worker.id, image: await uploadImage(f, "work-photos") });
    }
    if (photos.length) {
      await supabase.from("worker_photos").insert(photos);
    }

    await logAdminActivity(req, "worker_create", {
      entity_type: "worker", entity_id: worker.id, entity_name: worker.name,
      details: { registration_code: registrationCode, trade, area, approved, active, featured, identity_verified: identityVerified }
    });

    res.json({
      success: true,
      id: worker.id,
      registration_code: registrationCode,
      identity_verified: identityVerified
    });
  } catch (e) {
    res.status(500).json({ success: false, error: e.message || "حدث خطأ أثناء إضافة الصنايعي" });
  }
});

router.get('/workers/:id/id-card/:side', requirePermission("workers:read"), async (req, res) => {
  if (!isSupabaseReady(res)) return;
  try {
    const { id, side } = req.params;
    const { data: worker, error: dbError } = await supabase.from('workers').select('*').eq('id', id).single();

    if (dbError || !worker) return res.status(404).json({ success: false, error: 'الصنايعي غير موجود' });

    let rawFileName = side === 'front' ? (worker.id_front || worker.id_front_path || worker.id_front_url) : (worker.id_back || worker.id_back_path || worker.id_back_url);
    if (!rawFileName) return res.status(404).json({ success: false, error: 'لم يتم رفع صورة لهذا الجانب' });

    let fileName = rawFileName;
    if (fileName.includes('/')) fileName = fileName.split('/').pop(); 
    const folderPath = `id-cards/${fileName}`;

    const { data: signedData, error: signedError } = await supabase.storage.from('identity-docs').createSignedUrl(folderPath, 60);

    if (signedError || !signedData?.signedUrl) {
      const { data: rootData } = await supabase.storage.from('identity-docs').createSignedUrl(fileName, 60);
      if (rootData && rootData.signedUrl) return res.json({ success: true, url: rootData.signedUrl });

      const { data: fallbackData } = await supabase.storage.from('uploads').createSignedUrl(folderPath, 60);
      if (fallbackData && fallbackData.signedUrl) return res.json({ success: true, url: fallbackData.signedUrl });

      return res.status(404).json({ success: false, error: 'الصورة غير موجودة في التخزين' });
    }
    res.json({ success: true, url: signedData.signedUrl });
  } catch (error) {
    res.status(500).json({ success: false, error: 'حدث خطأ أثناء جلب الصورة' });
  }
});

// ===============================
// النسخ الاحتياطي (Backups)
// ===============================
const BACKUP_TABLES = [
  { table: "workers", label: "الصنايعية" },
  { table: "reviews", label: "التقييمات" },
  { table: "reports", label: "البلاغات" },
  { table: "trades", label: "الحرف" },
  { table: "areas", label: "المناطق" },
  { table: "admin_users", label: "مستخدمو الإدارة" }
];

router.get("/backups/summary", requirePermission("backup:export"), async (req, res) => {
  if (!isSupabaseReady(res)) return;
  const items = await Promise.all(BACKUP_TABLES.map(async ({ table, label }) => {
    const { count, error } = await supabase.from(table).select("*", { count: "exact", head: true });
    if (error) return { table, label, count: null, error: true };
    return { table, label, count: count || 0 };
  }));
  res.json({ success: true, items });
});

router.get("/backups/full-json", requirePermission("backup:export"), async (req, res) => {
  if (!isSupabaseReady(res)) return;
  try {
    const [workers, reviews, trades, areas] = await Promise.all([
      supabase.from("workers").select("*"),
      supabase.from("reviews").select("*"),
      supabase.from("trades").select("*"),
      supabase.from("areas").select("*")
    ]);
    const payload = {
      exported_at: new Date().toISOString(),
      workers: workers.data || [],
      reviews: reviews.data || [],
      trades: trades.data || [],
      areas: areas.data || []
    };
    await logAdminActivity(req, "backup_export_json", { entity_type: "backup" }).catch(() => {});
    res.setHeader("Content-Disposition", `attachment; filename="sanay3i-matrouh-backup-${today()}.json"`);
    res.setHeader("Content-Type", "application/json; charset=utf-8");
    res.send(JSON.stringify(payload, null, 2));
  } catch (e) {
    res.status(500).json({ success: false, error: e.message || "تعذر إنشاء النسخة الاحتياطية" });
  }
});

router.get("/notifications", requirePermission("workers:read"), async (req, res) => {
  if (!isSupabaseReady(res)) return;
  const t = today();
  try {
    const [workersRes, reviewsRes] = await Promise.all([
      supabase.from("workers").select("id, approved, subscription_end, has_pending_changes, pending_image"),
      supabase.from("reviews").select("id, approved")
    ]);

    const workers = workersRes.data || [];
    const reviews = reviewsRes.data || [];

    const pendingWorkers = workers.filter(w => !bool(w.approved)).length;
    const pendingReviews = reviews.filter(r => !bool(r.approved)).length;
    const pendingWorkerChanges = workers.filter(w => bool(w.has_pending_changes) || !!w.pending_image).length;

    let subscriptionsSoon = 0, subscriptionsExpired = 0;

    workers.forEach(w => {
      if (!w.subscription_end) return;
      const end = new Date(w.subscription_end), now = new Date();
      now.setHours(0,0,0,0); end.setHours(0,0,0,0);
      const days = Math.ceil((end - now) / (1000 * 60 * 60 * 24));
      if (days < 0) subscriptionsExpired++; else if (days <= 7) subscriptionsSoon++;
    });

    res.json({ success: true, pendingWorkers, pendingReviews, subscriptionsSoon, subscriptionsExpired, pendingWorkerChanges });
  } catch (e) {
    res.json({ success: true, pendingWorkers: 0, pendingReviews: 0, subscriptionsSoon: 0, subscriptionsExpired: 0, pendingWorkerChanges: 0 });
  }
});

module.exports = router;