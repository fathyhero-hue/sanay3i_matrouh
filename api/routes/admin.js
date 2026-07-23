const express = require("express");
const router = express.Router();
const crypto = require("crypto");
const { supabase, isSupabaseReady } = require("../config/supabase");
const { today, bool, clientIp } = require("../utils/helpers");
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

const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || "123456";
const ADMIN_PASSWORD_ITERATIONS = 120000;

// ===============================
// دوال مساعدة لإنشاء وفحص كلمات المرور
// ===============================
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

// ===============================
// 1. مسارات تسجيل الدخول والخروج
// ===============================
router.post("/login", async (req, res) => {
  try {
    if (!process.env.ADMIN_SESSION_SECRET) {
      return res.status(500).json({ success: false, error: "ADMIN_SESSION_SECRET غير مضبوط في إعدادات السيرفر" });
    }

    const username = String(req.body?.username || "").trim().toLowerCase();
    const password = String(req.body?.password || "");

    // 1. تسجيل الدخول باستخدام مستخدمين قاعدة البيانات (إذا تم إدخال اسم مستخدم)
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

    // 2. تسجيل الدخول لحالة الطوارئ / المدير الرئيسي (عند ترك اسم المستخدم فارغاً)
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

// ===============================
// 2. إدارة المستخدمين (المديرين)
// ===============================
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

// ===============================
// 3. الإحصائيات (Dashboard Stats)
// ===============================
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
// 4. سجل نشاط الإدارة
// ===============================
router.get("/activity-log", requirePermission("activity_log:read"), async (req, res) => {
  if (!isSupabaseReady(res)) return;
  const limit = Math.max(10, Math.min(500, Number(req.query.limit) || 150));
  const { data, error } = await supabase.from("admin_activity_log").select("*").order("id", { ascending: false }).limit(limit);
  if (error) {
    return res.json({ success: true, items: [], warning: "جدول admin_activity_log غير موجود." });
  }
  res.json({ success: true, items: data || [] });
});

module.exports = router;