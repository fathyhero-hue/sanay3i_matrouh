const crypto = require("crypto");

// سحب الإعدادات السرية من البيئة
const ADMIN_SESSION_SECRET = process.env.ADMIN_SESSION_SECRET || "fallback-secret-key-123456789";
const ADMIN_COOKIE_NAME = "sanay3i_admin_token";
const ADMIN_SESSION_DAYS = Math.max(1, Math.min(14, Number(process.env.ADMIN_SESSION_DAYS || 7)));

// تعريف مسميات الصلاحيات الموجودة في النظام
const ADMIN_ROLES = {
  super_admin: "مدير كامل",
  reviewer: "موظف مراجعة",
  subscription_manager: "موظف اشتراكات",
  viewer: "مشاهد"
};

// تعريف ما يمكن لكل دور أن يفعله بالظبط
const ADMIN_ROLE_PERMISSIONS = {
  super_admin: [
    "workers:read", "workers:create", "workers:update", "workers:review", "workers:delete",
    "subscriptions:manage", "reviews:review", "settings:manage", "backup:export",
    "analytics:read", "activity_log:read", "admin_users:manage", "whatsapp:send", "reports:read", "reports:manage"
  ],
  reviewer: ["workers:read", "workers:review", "reviews:review", "analytics:read", "activity_log:read", "whatsapp:send", "reports:read", "reports:manage"],
  subscription_manager: ["workers:read", "subscriptions:manage", "analytics:read", "activity_log:read", "whatsapp:send", "reports:read"],
  viewer: ["workers:read", "analytics:read", "activity_log:read", "reports:read"]
};

function normalizeAdminRole(role) {
  const r = String(role || "viewer").trim();
  return ADMIN_ROLES[r] ? r : "viewer";
}

function adminPermissions(role) {
  return ADMIN_ROLE_PERMISSIONS[normalizeAdminRole(role)] || ADMIN_ROLE_PERMISSIONS.viewer;
}

function adminHasPermission(admin, permission) {
  if (!admin) return false;
  if (normalizeAdminRole(admin.role) === "super_admin") return true;
  return adminPermissions(admin.role).includes(permission);
}

function publicAdmin(admin) {
  if (!admin) return null;
  const role = normalizeAdminRole(admin.role);
  return {
    id: admin.id || admin.admin_id || null,
    username: admin.username || "admin",
    display_name: admin.display_name || admin.name || "الإدارة",
    role,
    role_label: ADMIN_ROLES[role],
    permissions: adminPermissions(role)
  };
}

// استخراج بيانات تسجيل الدخول من المتصفح (Cookies)
function parseCookies(req) {
  const header = req.headers.cookie || "";
  return header.split(";").reduce((acc, part) => {
    const i = part.indexOf("=");
    if (i > -1) {
      const key = part.slice(0, i).trim();
      const value = part.slice(i + 1).trim();
      if (key) acc[key] = decodeURIComponent(value);
    }
    return acc;
  }, {});
}

function base64url(input) {
  return Buffer.from(input).toString("base64url");
}

function sign(payload) {
  return crypto.createHmac("sha256", ADMIN_SESSION_SECRET).update(payload).digest("base64url");
}

// دالة تصنع تذكرة الدخول (Token) للمدير
function createAdminToken(admin = {}) {
  const maxAgeMs = ADMIN_SESSION_DAYS * 24 * 60 * 60 * 1000;
  const cleanAdmin = publicAdmin(admin) || publicAdmin({ role: "super_admin", username: "admin", display_name: "الإدارة" });
  const payload = base64url(JSON.stringify({
    admin_id: cleanAdmin.id,
    username: cleanAdmin.username,
    display_name: cleanAdmin.display_name,
    role: cleanAdmin.role,
    exp: Date.now() + maxAgeMs
  }));
  return `${payload}.${sign(payload)}`;
}

// دالة تتأكد أن تذكرة الدخول أصلية ولم يتم تزويرها
function decodeAdminToken(token) {
  if (!ADMIN_SESSION_SECRET || !token || !token.includes(".")) return null;
  const [payload, signature] = token.split(".");
  const expected = sign(payload);

  try {
    const a = Buffer.from(signature || "");
    const b = Buffer.from(expected || "");
    if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return null;
    const data = JSON.parse(Buffer.from(payload, "base64url").toString("utf8"));
    if (Number(data.exp) <= Date.now()) return null;

    if (data.role === "admin") data.role = "super_admin";
    data.role = normalizeAdminRole(data.role || "super_admin");
    return publicAdmin(data);
  } catch (e) {
    return null;
  }
}

function getAdminFromRequest(req) {
  return decodeAdminToken(parseCookies(req)[ADMIN_COOKIE_NAME]);
}

// 🛡️ الميدل وير الأساسي: الحارس الذي نضعه على أي مسار نريد حمايته 🛡️
function requirePermission(permission) {
  return (req, res, next) => {
    const admin = getAdminFromRequest(req);
    if (!admin) {
      return res.status(401).json({ success: false, error: "غير مصرح بالدخول للوحة الإدارة" });
    }
    
    req.admin = admin; // حفظ بيانات المدير داخل الطلب لاستخدامها لاحقاً
    
    if (!adminHasPermission(admin, permission)) {
      return res.status(403).json({ success: false, error: "ليس لديك صلاحية لتنفيذ هذه العملية" });
    }
    
    return next(); // لو كله تمام، افتح له الباب للمسار المطلوب
  };
}

// إعدادات زرع الـ Cookie في متصفح المدير
function cookieOptions(maxAgeSeconds) {
  const secure = process.env.NODE_ENV === "production" || !!process.env.VERCEL;
  return [
    `${ADMIN_COOKIE_NAME}=`,
    "Path=/",
    "HttpOnly",
    "SameSite=Lax",
    `Max-Age=${maxAgeSeconds}`,
    secure ? "Secure" : ""
  ].filter(Boolean).join("; ");
}

function setAdminCookie(res, token) {
  const maxAgeSeconds = ADMIN_SESSION_DAYS * 24 * 60 * 60;
  res.setHeader("Set-Cookie", cookieOptions(maxAgeSeconds).replace(`${ADMIN_COOKIE_NAME}=`, `${ADMIN_COOKIE_NAME}=${encodeURIComponent(token)}`));
}

function clearAdminCookie(res) {
  res.setHeader("Set-Cookie", cookieOptions(0));
}

module.exports = {
  ADMIN_ROLES,
  publicAdmin,
  createAdminToken,
  getAdminFromRequest,
  requirePermission,
  setAdminCookie,
  clearAdminCookie
};