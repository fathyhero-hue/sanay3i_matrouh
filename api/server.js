
const express = require("express");
const multer = require("multer");
const path = require("path");
const crypto = require("crypto");
const { AsyncLocalStorage } = require("async_hooks");
const { createClient } = require("@supabase/supabase-js");
try { require("dotenv").config(); } catch(e) {}

const app = express();
app.use(express.json({ limit: "10mb" }));
app.use(express.urlencoded({ extended: true, limit: "10mb" }));

const requestContext = new AsyncLocalStorage();
app.use((req, res, next) => requestContext.run({ req }, next));

// ===============================
// Security Hardening Patch
// ===============================
app.disable("x-powered-by");

function clientIp(req) {
  return String(req.headers["x-forwarded-for"] || req.socket?.remoteAddress || "")
    .split(",")[0]
    .trim() || "unknown";
}

app.use((req, res, next) => {
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.setHeader("X-Frame-Options", "DENY");
  res.setHeader("Referrer-Policy", "strict-origin-when-cross-origin");
  res.setHeader("Permissions-Policy", "camera=(), microphone=(), geolocation=()");
  if (req.path.startsWith("/admin") || req.path.startsWith("/api/admin")) {
    res.setHeader("Cache-Control", "no-store, no-cache, must-revalidate, proxy-revalidate");
    res.setHeader("Pragma", "no-cache");
    res.setHeader("Expires", "0");
  }
  next();
});

function createMemoryRateLimiter({ windowMs, max, keyFn, message }) {
  const hits = new Map();
  return (req, res, next) => {
    const now = Date.now();
    const key = keyFn ? keyFn(req) : clientIp(req);
    const item = hits.get(key) || { count: 0, resetAt: now + windowMs };
    if (now > item.resetAt) {
      item.count = 0;
      item.resetAt = now + windowMs;
    }
    item.count += 1;
    hits.set(key, item);
    res.setHeader("X-RateLimit-Limit", String(max));
    res.setHeader("X-RateLimit-Remaining", String(Math.max(0, max - item.count)));
    if (item.count > max) {
      return res.status(429).json({ success: false, error: message || "طلبات كثيرة جدًا. حاول مرة أخرى بعد قليل" });
    }
    return next();
  };
}

const analyticsRateLimit = createMemoryRateLimiter({
  windowMs: 10 * 60 * 1000,
  max: Number(process.env.ANALYTICS_RATE_LIMIT || 180),
  keyFn: req => `analytics:${clientIp(req)}`,
  message: "تم تجاوز الحد المسموح لتسجيل الأحداث مؤقتًا"
});

const reportsRateLimit = createMemoryRateLimiter({
  windowMs: 10 * 60 * 1000,
  max: Number(process.env.REPORTS_RATE_LIMIT || 20),
  keyFn: req => `reports:${clientIp(req)}`,
  message: "تم إرسال بلاغات كثيرة مؤقتًا. حاول مرة أخرى بعد قليل"
});

const adminApiRateLimit = createMemoryRateLimiter({
  windowMs: 60 * 1000,
  max: Number(process.env.ADMIN_API_RATE_LIMIT || 240),
  keyFn: req => `admin-api:${clientIp(req)}`,
  message: "طلبات لوحة الإدارة كثيرة جدًا. انتظر دقيقة ثم حاول مرة أخرى"
});

app.use("/api/admin", (req, res, next) => {
  if (req.path === "/login") return next();
  return adminApiRateLimit(req, res, next);
});

// ===============================
// Static / PWA files for Local + Vercel
// ===============================
const STATIC_DIR = path.join(__dirname, "..");

app.use(express.static(STATIC_DIR, {
  etag: true,
  maxAge: process.env.NODE_ENV === "production" ? "7d" : 0,
  setHeaders: (res, filePath) => {
    if (filePath.endsWith(".html")) res.setHeader("Cache-Control", "no-store");
    if (/\.(css|js|png|jpg|jpeg|webp|svg|ico|json)$/i.test(filePath)) {
      res.setHeader("Cache-Control", process.env.NODE_ENV === "production" ? "public, max-age=604800, immutable" : "no-cache");
    }
  }
}));

app.get("/style.css", (req, res) => {
  res.type("text/css");
  res.sendFile(path.join(STATIC_DIR, "style.css"));
});

app.get("/manifest.json", (req, res) => {
  res.type("application/manifest+json");
  res.sendFile(path.join(STATIC_DIR, "manifest.json"));
});

app.get("/service-worker.js", (req, res) => {
  res.type("application/javascript");
  res.setHeader("Service-Worker-Allowed", "/");
  res.sendFile(path.join(STATIC_DIR, "service-worker.js"));
});

app.get("/offline.html", (req, res) => {
  res.type("text/html");
  res.sendFile(path.join(STATIC_DIR, "offline.html"));
});

app.get("/privacy-policy.html", (req, res) => {
  res.type("text/html");
  res.sendFile(path.join(STATIC_DIR, "privacy-policy.html"));
});

app.get("/favicon.ico", (req, res) => {
  res.status(204).end();
});

app.get("/.well-known/assetlinks.json", (req, res) => {
  res.type("application/json");
  res.sendFile(path.join(STATIC_DIR, "assetlinks.json"));
});

app.get("/icons/:fileName", (req, res) => {
  res.type("image/png");
  res.sendFile(path.join(STATIC_DIR, "icons", req.params.fileName));
});

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const SUPABASE_BUCKET = process.env.SUPABASE_BUCKET || "uploads";
const SUPABASE_ID_BUCKET = process.env.SUPABASE_ID_BUCKET || "identity-docs";
const supabase = createClient(SUPABASE_URL || "", SUPABASE_SERVICE_ROLE_KEY || "");

// ===============================
// WhatsApp Cloud API Settings
// ===============================
const WHATSAPP_ENABLED = String(process.env.WHATSAPP_ENABLED || "false").toLowerCase() === "true";
const WHATSAPP_ACCESS_TOKEN = process.env.WHATSAPP_ACCESS_TOKEN || "";
const WHATSAPP_PHONE_NUMBER_ID = process.env.WHATSAPP_PHONE_NUMBER_ID || "";
const WHATSAPP_BUSINESS_ACCOUNT_ID = process.env.WHATSAPP_BUSINESS_ACCOUNT_ID || "";
const WHATSAPP_API_VERSION = process.env.WHATSAPP_API_VERSION || "v25.0";
const WHATSAPP_DEFAULT_TEMPLATE = process.env.WHATSAPP_DEFAULT_TEMPLATE || "hello_world";
const WHATSAPP_DEFAULT_LANGUAGE = process.env.WHATSAPP_DEFAULT_LANGUAGE || "en_US";

function whatsappConfigStatus() {
  const missing = [];
  if (!WHATSAPP_ENABLED) missing.push("WHATSAPP_ENABLED=true");
  if (!WHATSAPP_ACCESS_TOKEN) missing.push("WHATSAPP_ACCESS_TOKEN");
  if (!WHATSAPP_PHONE_NUMBER_ID) missing.push("WHATSAPP_PHONE_NUMBER_ID");
  return {
    enabled: WHATSAPP_ENABLED && !missing.length,
    configured: !!(WHATSAPP_ACCESS_TOKEN && WHATSAPP_PHONE_NUMBER_ID),
    missing,
    api_version: WHATSAPP_API_VERSION,
    phone_number_id: WHATSAPP_PHONE_NUMBER_ID || null,
    business_account_id: WHATSAPP_BUSINESS_ACCOUNT_ID || null,
    default_template: WHATSAPP_DEFAULT_TEMPLATE,
    default_language: WHATSAPP_DEFAULT_LANGUAGE
  };
}

function normalizeWhatsAppRecipient(phone) {
  let d = String(phone || "").replace(/[٠-٩]/g, c => "٠١٢٣٤٥٦٧٨٩".indexOf(c)).replace(/[۰-۹]/g, c => "۰۱۲۳۴۵۶۷۸۹".indexOf(c)).replace(/[^0-9]/g, "");
  if (!d) return "";
  if (d.startsWith("00")) d = d.slice(2);
  if (d.startsWith("0") && d.length >= 10) d = "20" + d.slice(1);
  if (d.length === 10 && /^(10|11|12|15)/.test(d)) d = "20" + d;
  return d;
}

async function insertWhatsAppLog(row) {
  try {
    if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) return;
    const safe = { ...row };
    delete safe.access_token;
    await supabase.from("whatsapp_message_logs").insert(safe);
  } catch (e) {
    console.warn("WhatsApp log skipped:", e.message);
  }
}

async function sendWhatsAppCloudMessage({ to, message, mode = "text", template_name, language_code }) {
  const status = whatsappConfigStatus();
  if (!status.enabled) {
    throw new Error("إعدادات WhatsApp Cloud API غير مكتملة: " + status.missing.join(", "));
  }
  const recipient = normalizeWhatsAppRecipient(to);
  if (!recipient || recipient.length < 10) throw new Error("رقم واتساب المستلم غير صحيح");

  const sendMode = String(mode || "text").toLowerCase() === "template" ? "template" : "text";
  const payload = { messaging_product: "whatsapp", to: recipient };
  if (sendMode === "template") {
    payload.type = "template";
    payload.template = {
      name: String(template_name || WHATSAPP_DEFAULT_TEMPLATE || "hello_world"),
      language: { code: String(language_code || WHATSAPP_DEFAULT_LANGUAGE || "en_US") }
    };
  } else {
    const text = String(message || "").trim();
    if (!text) throw new Error("نص الرسالة مطلوب");
    payload.type = "text";
    payload.text = { preview_url: false, body: text };
  }

  const url = `https://graph.facebook.com/${WHATSAPP_API_VERSION}/${WHATSAPP_PHONE_NUMBER_ID}/messages`;
  const r = await fetch(url, {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${WHATSAPP_ACCESS_TOKEN}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify(payload)
  });
  const data = await r.json().catch(() => ({}));
  if (!r.ok) {
    const msg = data?.error?.message || data?.error?.error_user_msg || "فشل إرسال رسالة واتساب";
    const err = new Error(msg);
    err.provider_response = data;
    err.status_code = r.status;
    throw err;
  }
  return { response: data, recipient, send_mode: sendMode, payload_type: payload.type };
}


// ===============================
// Admin Auth + Roles (server-side only)
// ===============================
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || "";
const ADMIN_SESSION_SECRET = process.env.ADMIN_SESSION_SECRET || "";
const ADMIN_COOKIE_NAME = "sanay3i_admin_token";
const ADMIN_SESSION_DAYS = Math.max(1, Math.min(14, Number(process.env.ADMIN_SESSION_DAYS || 7)));
const ADMIN_PASSWORD_ITERATIONS = 120000;

const ADMIN_ROLES = {
  super_admin: "مدير كامل",
  reviewer: "موظف مراجعة",
  subscription_manager: "موظف اشتراكات",
  viewer: "مشاهد"
};

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

    // Backward compatibility with old cookies: role was "admin".
    if (data.role === "admin") data.role = "super_admin";
    data.role = normalizeAdminRole(data.role || "super_admin");
    return publicAdmin(data);
  } catch (e) {
    return null;
  }
}

function verifyAdminToken(token) {
  return !!decodeAdminToken(token);
}

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

function safePasswordEqual(input, expected) {
  const a = Buffer.from(String(input || ""));
  const b = Buffer.from(String(expected || ""));
  if (a.length !== b.length) return false;
  return crypto.timingSafeEqual(a, b);
}

function getAdminFromRequest(req) {
  return decodeAdminToken(parseCookies(req)[ADMIN_COOKIE_NAME]);
}

function currentAdminFromContext() {
  const store = requestContext.getStore();
  return store && store.req ? (store.req.admin || getAdminFromRequest(store.req)) : null;
}

function isAdminRequest(req) {
  const admin = getAdminFromRequest(req);
  if (admin) req.admin = admin;
  return !!admin;
}

function requireAdmin(req, res, next) {
  const admin = getAdminFromRequest(req);
  if (admin) {
    req.admin = admin;
    return next();
  }
  return res.status(401).json({ success: false, error: "غير مصرح بالدخول للوحة الإدارة" });
}

function requirePermission(permission) {
  return (req, res, next) => {
    const admin = getAdminFromRequest(req);
    if (!admin) return res.status(401).json({ success: false, error: "غير مصرح بالدخول للوحة الإدارة" });
    req.admin = admin;
    if (!adminHasPermission(admin, permission)) {
      return res.status(403).json({ success: false, error: "ليس لديك صلاحية لتنفيذ هذه العملية" });
    }
    return next();
  };
}

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

const adminLoginAttempts = new Map();
const ADMIN_LOGIN_MAX_ATTEMPTS = Number(process.env.ADMIN_LOGIN_MAX_ATTEMPTS || 8);
const ADMIN_LOGIN_LOCK_MINUTES = Number(process.env.ADMIN_LOGIN_LOCK_MINUTES || 15);

function adminLoginAttemptKey(req, username) {
  return `${clientIp(req)}:${String(username || "env_admin").trim().toLowerCase()}`;
}

function getAdminLoginAttempt(req, username) {
  const key = adminLoginAttemptKey(req, username);
  const now = Date.now();
  const item = adminLoginAttempts.get(key) || { count: 0, lockedUntil: 0, lastFailAt: 0 };
  if (item.lockedUntil && item.lockedUntil <= now) {
    adminLoginAttempts.delete(key);
    return { key, item: { count: 0, lockedUntil: 0, lastFailAt: 0 } };
  }
  return { key, item };
}

function isAdminLoginLocked(req, username) {
  const { item } = getAdminLoginAttempt(req, username);
  return item.lockedUntil && item.lockedUntil > Date.now();
}

function registerAdminLoginFailure(req, username) {
  const { key, item } = getAdminLoginAttempt(req, username);
  item.count += 1;
  item.lastFailAt = Date.now();
  if (item.count >= ADMIN_LOGIN_MAX_ATTEMPTS) {
    item.lockedUntil = Date.now() + ADMIN_LOGIN_LOCK_MINUTES * 60 * 1000;
  }
  adminLoginAttempts.set(key, item);
}

function clearAdminLoginFailures(req, username) {
  adminLoginAttempts.delete(adminLoginAttemptKey(req, username));
}

function adminLoginBlockedResponse(req, res, username) {
  const { item } = getAdminLoginAttempt(req, username);
  const seconds = Math.max(1, Math.ceil(((item.lockedUntil || Date.now()) - Date.now()) / 1000));
  res.setHeader("Retry-After", String(seconds));
  return res.status(429).json({ success: false, error: `محاولات دخول كثيرة. حاول مرة أخرى بعد ${Math.ceil(seconds / 60)} دقيقة` });
}

app.post("/api/admin/login", async (req, res) => {
  if (!ADMIN_SESSION_SECRET) {
    return res.status(500).json({ success: false, error: "ADMIN_SESSION_SECRET غير مضبوط" });
  }

  const username = String(req.body?.username || "").trim().toLowerCase();
  const password = req.body ? req.body.password : "";

  if (isAdminLoginLocked(req, username || "env_admin")) {
    return adminLoginBlockedResponse(req, res, username || "env_admin");
  }

  // New multi-admin login: username + password from admin_users table.
  if (username) {
    if (!ready(res)) return;
    const { data: user, error } = await supabase
      .from("admin_users")
      .select("id,username,display_name,role,password_salt,password_hash,active")
      .eq("username", username)
      .eq("active", true)
      .maybeSingle();

    if (error) {
      return res.status(500).json({ success: false, error: "جدول admin_users غير جاهز. شغّل ملف SQL الخاص بالصلاحيات أولًا." });
    }
    if (!user || !verifyAdminUserPassword(user, password)) {
      registerAdminLoginFailure(req, username);
      return res.status(401).json({ success: false, error: "اسم المستخدم أو كلمة السر غير صحيحة" });
    }

    clearAdminLoginFailures(req, username);
    const admin = publicAdmin(user);
    setAdminCookie(res, createAdminToken(admin));
    await supabase.from("admin_users").update({ last_login_at: new Date().toISOString() }).eq("id", user.id);
    return res.json({ success: true, admin });
  }

  // Backward-compatible emergency login using ADMIN_PASSWORD from environment.
  if (!ADMIN_PASSWORD) {
    return res.status(500).json({ success: false, error: "ADMIN_PASSWORD غير مضبوط" });
  }
  if (!safePasswordEqual(password, ADMIN_PASSWORD)) {
    registerAdminLoginFailure(req, "env_admin");
    return res.status(401).json({ success: false, error: "كلمة السر غير صحيحة" });
  }

  clearAdminLoginFailures(req, "env_admin");
  const admin = publicAdmin({ id: null, username: "env_admin", display_name: "المدير الرئيسي", role: "super_admin" });
  setAdminCookie(res, createAdminToken(admin));
  return res.json({ success: true, admin });
});

app.post("/api/admin/logout", (req, res) => {
  clearAdminCookie(res);
  return res.json({ success: true });
});

app.get("/api/admin/me", (req, res) => {
  const admin = getAdminFromRequest(req);
  return res.json({ authenticated: !!admin, admin: publicAdmin(admin), roles: ADMIN_ROLES });
});

// ===============================
// Admin users management
// ===============================
app.get("/api/admin/users", requirePermission("admin_users:manage"), async (req, res) => {
  if (!ready(res)) return;
  const { data, error } = await supabase
    .from("admin_users")
    .select("id,username,display_name,role,active,created_at,last_login_at")
    .order("id", { ascending: true });
  if (error) return res.status(500).json({ success: false, error: "جدول admin_users غير موجود. شغّل SQL الصلاحيات أولًا." });
  res.json({ success: true, items: data || [], roles: ADMIN_ROLES });
});

app.post("/api/admin/users", requirePermission("admin_users:manage"), async (req, res) => {
  if (!ready(res)) return;
  const username = String(req.body?.username || "").trim().toLowerCase();
  const displayName = String(req.body?.display_name || req.body?.displayName || username).trim();
  const role = normalizeAdminRole(req.body?.role || "viewer");
  const password = String(req.body?.password || "");
  if (!/^[a-z0-9_.-]{3,40}$/.test(username)) return res.status(400).json({ success: false, error: "اسم المستخدم يجب أن يكون إنجليزي/أرقام من 3 إلى 40 حرف" });
  if (password.length < 8) return res.status(400).json({ success: false, error: "كلمة السر يجب ألا تقل عن 8 أحرف" });
  const { salt, hash } = hashAdminPassword(password);
  const { data, error } = await supabase.from("admin_users").insert({
    username,
    display_name: displayName,
    role,
    password_salt: salt,
    password_hash: hash,
    active: true
  }).select("id,username,display_name,role,active,created_at,last_login_at").single();
  if (error) return res.status(500).json({ success: false, error: "تعذر إنشاء مستخدم الإدارة. تأكد أن اسم المستخدم غير مكرر." });
  await logAdminActivity("admin_user_create", { entity_type: "admin_user", entity_id: data.id, entity_name: data.display_name || data.username, after_data: { username, display_name: displayName, role, active: true } });
  res.json({ success: true, user: data });
});

app.put("/api/admin/users/:id", requirePermission("admin_users:manage"), async (req, res) => {
  if (!ready(res)) return;
  const userId = Number(req.params.id);
  const update = {};
  if (req.body?.display_name !== undefined || req.body?.displayName !== undefined) update.display_name = String(req.body.display_name || req.body.displayName || "").trim();
  if (req.body?.role !== undefined) update.role = normalizeAdminRole(req.body.role);
  if (req.body?.active !== undefined) update.active = bool(req.body.active);
  update.updated_at = new Date().toISOString();
  const { data: before } = await supabase.from("admin_users").select("id,username,display_name,role,active").eq("id", userId).single();
  const { data, error } = await supabase.from("admin_users").update(update).eq("id", userId).select("id,username,display_name,role,active,created_at,last_login_at").single();
  if (error) return res.status(500).json({ success: false, error: "تعذر تعديل مستخدم الإدارة" });
  await logAdminActivity("admin_user_update", { entity_type: "admin_user", entity_id: userId, entity_name: data.display_name || data.username, before_data: before || {}, after_data: data || {}, details: { fields: Object.keys(update) } });
  res.json({ success: true, user: data });
});

app.put("/api/admin/users/:id/password", requirePermission("admin_users:manage"), async (req, res) => {
  if (!ready(res)) return;
  const userId = Number(req.params.id);
  const password = String(req.body?.password || "");
  if (password.length < 8) return res.status(400).json({ success: false, error: "كلمة السر يجب ألا تقل عن 8 أحرف" });
  const { salt, hash } = hashAdminPassword(password);
  const { data: user } = await supabase.from("admin_users").select("id,username,display_name").eq("id", userId).single();
  const { error } = await supabase.from("admin_users").update({ password_salt: salt, password_hash: hash, updated_at: new Date().toISOString() }).eq("id", userId);
  if (error) return res.status(500).json({ success: false, error: "تعذر تغيير كلمة السر" });
  await logAdminActivity("admin_user_password_change", { entity_type: "admin_user", entity_id: userId, entity_name: user?.display_name || user?.username || "مستخدم إدارة" });
  res.json({ success: true });
});

app.delete("/api/admin/users/:id", requirePermission("admin_users:manage"), async (req, res) => {
  if (!ready(res)) return;
  const userId = Number(req.params.id);
  if (req.admin && String(req.admin.id || "") === String(userId)) return res.status(400).json({ success: false, error: "لا يمكن حذف حسابك الحالي" });
  const { data: before } = await supabase.from("admin_users").select("id,username,display_name,role,active").eq("id", userId).single();
  const { error } = await supabase.from("admin_users").delete().eq("id", userId);
  if (error) return res.status(500).json({ success: false, error: "تعذر حذف مستخدم الإدارة" });
  await logAdminActivity("admin_user_delete", { entity_type: "admin_user", entity_id: userId, entity_name: before?.display_name || before?.username || "مستخدم إدارة", before_data: before || {} });
  res.json({ success: true });
});

const ALLOWED_IMAGE_MIME_TYPES = new Set(["image/jpeg", "image/png", "image/webp"]);
const ALLOWED_IMAGE_EXTENSIONS = new Set([".jpg", ".jpeg", ".png", ".webp"]);

function secureImageFileFilter(req, file, cb) {
  const mimetype = String(file.mimetype || "").toLowerCase();
  const extension = path.extname(String(file.originalname || "")).toLowerCase();
  if (!ALLOWED_IMAGE_MIME_TYPES.has(mimetype)) {
    return cb(new Error("نوع الصورة غير مسموح. المسموح JPG / PNG / WEBP فقط"));
  }
  if (extension && !ALLOWED_IMAGE_EXTENSIONS.has(extension)) {
    return cb(new Error("امتداد الصورة غير مسموح"));
  }
  return cb(null, true);
}

const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 6 * 1024 * 1024,
    files: 8,
    fields: 80,
    fieldSize: 512 * 1024
  },
  fileFilter: secureImageFileFilter
});
const workerUpload = upload.fields([{ name: "image", maxCount: 1 }, { name: "workPhotos", maxCount: 5 }, { name: "idFront", maxCount: 1 }, { name: "idBack", maxCount: 1 }]);

function ready(res){ if(!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY){ res.status(500).json({success:false,error:"Supabase environment variables are missing"}); return false;} return true; }
function today(){ return new Date().toISOString().split("T")[0]; }

function siteBaseUrl(req){
  const protoHeader = String(req.headers["x-forwarded-proto"] || req.protocol || "https").split(",")[0].trim();
  const hostHeader = String(req.headers["x-forwarded-host"] || req.get("host") || "localhost:3000").split(",")[0].trim();
  return `${protoHeader}://${hostHeader}`.replace(/\/+$/, "");
}
function xmlEscape(value){
  return String(value || "").replace(/[&<>"']/g, ch => ({"&":"&amp;","<":"&lt;",">":"&gt;","\"":"&quot;","'":"&apos;"}[ch]));
}
function sitemapUrl(base, pathName, changefreq, priority, lastmod){
  return `  <url>\n    <loc>${xmlEscape(base + pathName)}</loc>\n    <changefreq>${changefreq}</changefreq>\n    <priority>${priority}</priority>${lastmod ? `\n    <lastmod>${xmlEscape(lastmod)}</lastmod>` : ""}\n  </url>`;
}

app.get("/robots.txt", (req,res)=>{
  const base = siteBaseUrl(req);
  res.type("text/plain");
  res.send([
    "User-agent: *",
    "Allow: /",
    "Disallow: /admin",
    "Disallow: /api/",
    `Sitemap: ${base}/sitemap.xml`,
    ""
  ].join("\n"));
});

app.get("/sitemap.xml", async (req,res)=>{
  const base = siteBaseUrl(req);
  const urls = new Map();
  const add = (pathName, changefreq="weekly", priority="0.7", lastmod="") => {
    if(!pathName.startsWith("/")) pathName = "/" + pathName;
    urls.set(pathName, {changefreq, priority, lastmod});
  };

  add("/", "daily", "1.0");
  add("/register", "monthly", "0.5");
  add("/status", "monthly", "0.4");
  add("/privacy-policy.html", "yearly", "0.2");

  if (SUPABASE_URL && SUPABASE_SERVICE_ROLE_KEY) {
    try {
      const [{data: trades}, {data: areas}, {data: workers}] = await Promise.all([
        supabase.from("trades").select("name"),
        supabase.from("areas").select("name"),
        supabase.from("workers").select("id,name,trade,area,created_at,updated_at,approved,active,subscription_end").eq("approved", true).eq("active", true).or(`subscription_end.is.null,subscription_end.gte.${today()}`).limit(1000)
      ]);

      (trades || []).forEach(t => {
        const name = String(t.name || "").trim();
        if(name) add(`/trade/${encodeURIComponent(name)}`, "weekly", "0.8");
      });

      (areas || []).forEach(a => {
        const name = String(a.name || "").trim();
        if(name) add(`/area/${encodeURIComponent(name)}`, "weekly", "0.7");
      });

      (workers || []).forEach(w => {
        if(w.id) add(`/worker/${encodeURIComponent(w.id)}`, "weekly", "0.75", String(w.updated_at || w.created_at || "").slice(0,10));
        const trade = String(w.trade || "").trim();
        const area = String(w.area || "").trim();
        if(trade && area) add(`/trade/${encodeURIComponent(trade)}/area/${encodeURIComponent(area)}`, "weekly", "0.8");
      });
    } catch(e) {}
  }

  const body = `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${Array.from(urls.entries()).map(([pathName, meta]) => sitemapUrl(base, pathName, meta.changefreq, meta.priority, meta.lastmod)).join("\n")}\n</urlset>`;
  res.type("application/xml");
  res.send(body);
});

function addMonths(start, months){ const d=start?new Date(start):new Date(); if(isNaN(d.getTime())) d.setTime(Date.now()); d.setMonth(d.getMonth()+months); return d.toISOString().split("T")[0]; }
function bool(v){ return v===true || v==="true" || v==="1" || v===1; }
const IDENTITY_STATUSES = new Set(["pending","verified","rejected","needs_data","needs_id_reupload"]);
function normalizeIdentityStatus(value){ const s=String(value||"pending").trim(); return IDENTITY_STATUSES.has(s)?s:"pending"; }
function identityStatusLabel(value){ return {pending:"بانتظار المراجعة",verified:"تم التحقق",rejected:"مرفوض",needs_data:"يحتاج تعديل بيانات",needs_id_reupload:"إعادة رفع البطاقة"}[value] || "بانتظار المراجعة"; }
function makeRegistrationCode(workerId, createdAt){ const year=new Date(createdAt||Date.now()).getFullYear(); const num=String(workerId||0).padStart(5,"0"); return `SN-${year}-${num}`; }
function id(req){ return Number(req.params.id); }
function ext(file){ const e=path.extname(file.originalname||""); if(e) return e.toLowerCase(); if(file.mimetype==="image/png") return ".png"; if(file.mimetype==="image/webp") return ".webp"; return ".jpg"; }
function assertValidImageBuffer(file){
  if(!file || !file.buffer) return;
  const b = file.buffer;
  const mime = String(file.mimetype || "").toLowerCase();
  const jpg = b.length > 3 && b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff;
  const png = b.length > 8 && b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4e && b[3] === 0x47;
  const webp = b.length > 12 && b.slice(0,4).toString("ascii") === "RIFF" && b.slice(8,12).toString("ascii") === "WEBP";
  if((mime === "image/jpeg" && !jpg) || (mime === "image/png" && !png) || (mime === "image/webp" && !webp)){
    throw new Error("ملف الصورة غير صالح أو امتداده لا يطابق محتواه");
  }
}
function safeStorageFolder(folder){
  const f = String(folder || "uploads").replace(/[^a-zA-Z0-9_-]/g, "").slice(0, 40);
  return f || "uploads";
}
async function uploadImage(file, folder){ if(!file) return ""; assertValidImageBuffer(file); const name=`${safeStorageFolder(folder)}/${Date.now()}-${crypto.randomBytes(8).toString("hex")}${ext(file)}`; const {error}=await supabase.storage.from(SUPABASE_BUCKET).upload(name,file.buffer,{contentType:file.mimetype||"image/jpeg",upsert:false}); if(error) throw error; return supabase.storage.from(SUPABASE_BUCKET).getPublicUrl(name).data.publicUrl; }
async function uploadPrivateImage(file, folder){ if(!file) return ""; assertValidImageBuffer(file); const name=`${safeStorageFolder(folder)}/${Date.now()}-${crypto.randomBytes(8).toString("hex")}${ext(file)}`; const {error}=await supabase.storage.from(SUPABASE_ID_BUCKET).upload(name,file.buffer,{contentType:file.mimetype||"image/jpeg",upsert:false}); if(error) throw error; return name; }
function mainFile(req){ return req.files && req.files.image && req.files.image[0] ? req.files.image[0] : null; }
function workFiles(req){ return req.files && req.files.workPhotos ? req.files.workPhotos : []; }
function idFrontFile(req){ return req.files && req.files.idFront && req.files.idFront[0] ? req.files.idFront[0] : null; }
function idBackFile(req){ return req.files && req.files.idBack && req.files.idBack[0] ? req.files.idBack[0] : null; }


function normalizeWorkerPhone(raw){
  let d = String(raw || "")
    .replace(/[٠-٩]/g, c => "٠١٢٣٤٥٦٧٨٩".indexOf(c))
    .replace(/[۰-۹]/g, c => "۰۱۲۳۴۵۶۷۸۹".indexOf(c))
    .replace(/\D/g, "");
  if(!d) return "";
  if(d.startsWith("0020")) d = d.slice(2);
  if(d.startsWith("20") && d.length === 12) d = "0" + d.slice(2);
  if(d.length === 10 && /^(10|11|12|15)/.test(d)) d = "0" + d;
  return d;
}
function workerPhoneKeysFromValues(phone, whatsapp){
  const keys = [normalizeWorkerPhone(phone), normalizeWorkerPhone(whatsapp)].filter(Boolean);
  return Array.from(new Set(keys));
}
async function findDuplicateWorkerByPhone(phone, whatsapp, excludeId){
  const keys = workerPhoneKeysFromValues(phone, whatsapp);
  if(!keys.length) return null;
  const {data,error}=await supabase.from("workers").select("id,name,phone,whatsapp").limit(5000);
  if(error) throw error;
  const exclude = excludeId !== undefined && excludeId !== null ? String(excludeId) : "";
  for(const worker of (data||[])){
    if(exclude && String(worker.id) === exclude) continue;
    const otherKeys = workerPhoneKeysFromValues(worker.phone, worker.whatsapp);
    const matched = keys.find(k => otherKeys.includes(k));
    if(matched){
      return {id:worker.id,name:worker.name||"صنايعي",phone:worker.phone||"",whatsapp:worker.whatsapp||"",matched};
    }
  }
  return null;
}

const PUBLIC_WORKER_COLUMNS = "id,name,phone,whatsapp,trade,area,description,image,approved,active,featured,identity_verified,subscription_start,subscription_end,created_at";


// ===============================
// Smart Worker Score
// ترتيب الصنايعية بذكاء بدون إضافة أعمدة جديدة
// ===============================
function smartBool(value) {
  return value === 1 || value === true || value === "1" || value === "true" || value === "yes" || value === "approved" || value === "active";
}

function smartClamp(value, min, max) {
  const n = Number(value) || 0;
  return Math.max(min, Math.min(max, n));
}

function smartDateMs(value) {
  if (!value) return 0;
  const t = new Date(value).getTime();
  return Number.isFinite(t) ? t : 0;
}

function smartSubscriptionActive(worker) {
  const end = worker?.subscription_end || worker?.subscriptionEnd || "";
  if (!end) return true;
  return String(end).slice(0, 10) >= today();
}

function smartScoreWorker(worker, signals) {
  const s = signals || {};
  const avgRating = Number(s.rating_average || 0);
  const reviewCount = Number(s.review_count || 0);
  const calls = Number(s.call || 0);
  const whatsapps = Number(s.whatsapp || 0);
  const views = Number(s.profile_view || 0);
  const shares = Number(s.share || 0);
  const createdMs = smartDateMs(worker?.created_at);
  const ageDays = createdMs ? Math.floor((Date.now() - createdMs) / (24 * 60 * 60 * 1000)) : 9999;

  const parts = {
    featured: smartBool(worker?.featured) ? 350 : 0,
    verified: smartBool(worker?.identity_verified || worker?.verified || worker?.is_verified) ? 250 : 0,
    subscription: smartSubscriptionActive(worker) ? 180 : 0,
    rating: Math.round(smartClamp(avgRating, 0, 5) * 35),
    reviews: Math.round(smartClamp(reviewCount * 8, 0, 90)),
    contacts: Math.round(smartClamp((calls * 20) + (whatsapps * 18) + (shares * 4), 0, 220)),
    views: Math.round(smartClamp(views * 3, 0, 90)),
    recency: Math.round(smartClamp(60 - (ageDays * 2), 0, 60))
  };

  const total = Object.values(parts).reduce((a, b) => a + b, 0);
  const reasons = [];
  if (parts.featured) reasons.push("مميز");
  if (parts.verified) reasons.push("موثق");
  if (parts.subscription) reasons.push("اشتراك نشط");
  if (avgRating > 0) reasons.push(`تقييم ${Math.round(avgRating * 10) / 10}/5`);
  if (calls + whatsapps > 0) reasons.push("تواصل مرتفع");
  if (views > 0) reasons.push("زيارات");
  if (parts.recency) reasons.push("حديث");

  return {
    smart_score: total,
    smart_score_parts: parts,
    smart_score_signals: {
      rating_average: Math.round(avgRating * 10) / 10,
      review_count: reviewCount,
      call: calls,
      whatsapp: whatsapps,
      profile_view: views,
      share: shares
    },
    smart_score_reasons: reasons
  };
}

async function attachSmartScoresToWorkers(workers) {
  const rows = Array.isArray(workers) ? workers : [];
  const ids = rows.map(w => w && w.id).filter(v => v !== undefined && v !== null);
  if (!ids.length) return rows;

  const idKeys = ids.map(v => String(v));
  const signalsById = {};
  idKeys.forEach(k => { signalsById[k] = { rating_sum: 0, review_count: 0, rating_average: 0, call: 0, whatsapp: 0, profile_view: 0, share: 0 }; });

  try {
    const { data: reviews, error: reviewsError } = await supabase
      .from("reviews")
      .select("worker_id,rating,approved")
      .in("worker_id", ids)
      .eq("approved", true)
      .limit(50000);

    if (!reviewsError) {
      (reviews || []).forEach(r => {
        const key = String(r.worker_id || "");
        if (!signalsById[key]) return;
        signalsById[key].rating_sum += Number(r.rating || 0);
        signalsById[key].review_count += 1;
      });
    }
  } catch (e) {}

  Object.values(signalsById).forEach(s => {
    s.rating_average = s.review_count ? s.rating_sum / s.review_count : 0;
  });

  try {
    const since = new Date(Date.now() - Number(process.env.SMART_SCORE_ANALYTICS_DAYS || 30) * 24 * 60 * 60 * 1000).toISOString();
    const { data: events, error: eventsError } = await supabase
      .from("analytics_events")
      .select("worker_id,event_type,created_at")
      .in("worker_id", idKeys)
      .gte("created_at", since)
      .limit(50000);

    if (!eventsError) {
      (events || []).forEach(ev => {
        const key = String(ev.worker_id || "");
        const type = String(ev.event_type || "");
        if (!signalsById[key]) return;
        if (["call", "whatsapp", "profile_view", "share"].includes(type)) {
          signalsById[key][type] = (signalsById[key][type] || 0) + 1;
        }
      });
    }
  } catch (e) {}

  const scored = rows.map(w => ({
    ...w,
    ...smartScoreWorker(w, signalsById[String(w.id)] || {})
  }));

  scored.sort((a, b) => {
    const scoreDiff = Number(b.smart_score || 0) - Number(a.smart_score || 0);
    if (scoreDiff) return scoreDiff;
    const featuredDiff = (smartBool(b.featured) ? 1 : 0) - (smartBool(a.featured) ? 1 : 0);
    if (featuredDiff) return featuredDiff;
    const verifiedDiff = (smartBool(b.identity_verified) ? 1 : 0) - (smartBool(a.identity_verified) ? 1 : 0);
    if (verifiedDiff) return verifiedDiff;
    return smartDateMs(b.created_at) - smartDateMs(a.created_at);
  });

  scored.forEach((w, index) => { w.smart_rank = index + 1; });
  return scored;
}


// ===============================
// Admin Activity Log
// ===============================
function activityActionLabel(action){
  return {
    worker_update:"تعديل بيانات صنايعي",
    worker_register:"تسجيل صنايعي جديد",
    worker_approve:"اعتماد صنايعي",
    worker_unapprove:"إلغاء اعتماد صنايعي",
    worker_activate:"تفعيل صنايعي",
    worker_deactivate:"إيقاف صنايعي",
    worker_feature:"تمييز صنايعي",
    worker_unfeature:"إلغاء تمييز صنايعي",
    worker_delete:"حذف صنايعي",
    subscription_renew:"تجديد اشتراك",
    identity_review:"مراجعة تحقق",
    work_photos_add:"إضافة صور أعمال",
    work_photo_delete:"حذف صورة عمل",
    review_approve:"اعتماد تقييم",
    review_unapprove:"إلغاء اعتماد تقييم",
    review_delete:"حذف تقييم",
    trade_add:"إضافة حرفة",
    trade_delete:"حذف حرفة",
    area_add:"إضافة منطقة",
    area_delete:"حذف منطقة",
    admin_user_create:"إنشاء مستخدم إدارة",
    admin_user_update:"تعديل مستخدم إدارة",
    admin_user_password_change:"تغيير كلمة سر مستخدم إدارة",
    admin_user_delete:"حذف مستخدم إدارة",
    backup_export_json:"تصدير نسخة JSON",
    backup_create_storage:"إنشاء نسخة احتياطية في Storage",
    backup_export_subscriptions_csv:"تصدير الاشتراكات CSV",
    backup_export_payments_csv:"تصدير المدفوعات CSV",
    backup_auto_daily:"نسخ احتياطي يومي تلقائي",
    worker_report_status_update:"تحديث حالة بلاغ",
    worker_report_delete:"حذف بلاغ",
    whatsapp_send:"إرسال واتساب تلقائي"
  }[action] || action;
}
async function logAdminActivity(action, options={}){
  try{
    if(!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) return;
    const admin = options.admin || currentAdminFromContext() || null;
    const baseRow={
      action:String(action||"admin_action"),
      action_label:activityActionLabel(action),
      entity_type:options.entity_type?String(options.entity_type):null,
      entity_id:options.entity_id!==undefined && options.entity_id!==null && options.entity_id!=="" ? Number(options.entity_id) : null,
      entity_name:options.entity_name?String(options.entity_name):null,
      details:options.details || {},
      admin_name:options.admin_name || admin?.display_name || admin?.username || "الإدارة"
    };
    const fullRow={
      ...baseRow,
      admin_id: admin?.id || null,
      admin_username: admin?.username || null,
      admin_role: admin?.role || null,
      before_data: options.before_data || options.before || {},
      after_data: options.after_data || options.after || {}
    };
    let {error}=await supabase.from("admin_activity_log").insert(fullRow);
    if(error){
      const retry = await supabase.from("admin_activity_log").insert(baseRow);
      error = retry.error;
    }
    if(error) console.warn("Admin activity log skipped:", error.message);
  }catch(e){
    console.warn("Admin activity log skipped:", e.message);
  }
}

// Local page fallback
app.get("/", (req,res)=>res.sendFile(path.join(STATIC_DIR,"index.html")));
app.get("/register", (req,res)=>res.sendFile(path.join(STATIC_DIR,"register.html")));
app.get("/status", (req,res)=>res.sendFile(path.join(STATIC_DIR,"status.html")));
app.get("/admin", (req,res)=>res.sendFile(path.join(STATIC_DIR,"admin.html")));
app.get("/admin/add-worker", (req,res)=>res.sendFile(path.join(STATIC_DIR,"admin-add-worker.html")));
app.get("/worker/:id", (req,res)=>res.sendFile(path.join(STATIC_DIR,"worker.html")));
app.get("/trade/:trade/area/:area", (req,res)=>res.sendFile(path.join(STATIC_DIR,"index.html")));
app.get("/trade/:trade", (req,res)=>res.sendFile(path.join(STATIC_DIR,"index.html")));
app.get("/area/:area", (req,res)=>res.sendFile(path.join(STATIC_DIR,"index.html")));

// Workers
// ===============================
// Performance optimized public directory
// ===============================
const PUBLIC_WORKERS_CACHE = new Map();
function perfCacheGet(key){
  const x = PUBLIC_WORKERS_CACHE.get(key);
  if(!x) return null;
  if(Date.now() > x.expires){ PUBLIC_WORKERS_CACHE.delete(key); return null; }
  return x.data;
}
function perfCacheSet(key, data, ttlMs){
  PUBLIC_WORKERS_CACHE.set(key, { data, expires: Date.now() + ttlMs });
}

app.get("/api/workers", async (req,res)=>{
  if(!ready(res))return;
  const limit = Math.min(Math.max(Number(req.query.limit || 1200) || 1200, 1), 3000);
  const cacheKey = `public-workers:${limit}:${today()}`;
  const cached = perfCacheGet(cacheKey);
  if(cached){
    res.setHeader("X-Sanay3i-Cache", "hit");
    return res.json(cached);
  }
  try{
    const {data,error}=await supabase
      .from("workers")
      .select(PUBLIC_WORKER_COLUMNS)
      .eq("approved",true)
      .eq("active",true)
      .or(`subscription_end.is.null,subscription_end.gte.${today()}`)
      .order("featured", { ascending:false })
      .order("created_at", { ascending:false })
      .limit(limit);
    if(error)throw error;
    const scored=await attachSmartScoresToWorkers(data||[]);
    perfCacheSet(cacheKey, scored, Number(process.env.PUBLIC_WORKERS_CACHE_MS || 60000));
    res.setHeader("X-Sanay3i-Cache", "miss");
    res.json(scored);
  }catch(error){
    res.status(500).json({success:false,error:error.message});
  }
});
app.get("/api/sanaieya", (req,res)=>{ req.url="/api/workers"; app._router.handle(req,res); });
app.get("/sanaieya", (req,res)=>{ req.url="/api/workers"; app._router.handle(req,res); });

app.get("/api/admin/workers", requirePermission("workers:read"), async (req,res)=>{
  if(!ready(res))return;
  const limit = Math.min(Math.max(Number(req.query.limit || 1000) || 1000, 1), 5000);
  const {data,error}=await supabase
    .from("workers")
    .select("*")
    .order("id",{ascending:false})
    .limit(limit);
  if(error)return res.status(500).json({success:false,error:error.message});
  res.json(data||[]);
});
app.get("/api/workers/all", requirePermission("workers:read"), (req,res)=>{ req.url="/api/admin/workers"; app._router.handle(req,res); });

app.get("/api/admin/workers/:id/id-card/:side", requirePermission("workers:review"), async (req,res)=>{
  if(!ready(res))return;
  const side=String(req.params.side||"");
  if(side!=="front" && side!=="back") return res.status(400).json({success:false,error:"نوع صورة البطاقة غير صحيح"});
  const {data,error}=await supabase.from("workers").select("id_front_path,id_back_path").eq("id",id(req)).single();
  if(error||!data) return res.status(404).json({success:false,error:"الصنايعي غير موجود"});
  const filePath = side==="front" ? data.id_front_path : data.id_back_path;
  if(!filePath) return res.status(404).json({success:false,error:"صورة البطاقة غير مرفوعة"});
  const signed=await supabase.storage.from(SUPABASE_ID_BUCKET).createSignedUrl(filePath, 60 * 5);
  if(signed.error) return res.status(500).json({success:false,error:signed.error.message});
  res.json({success:true,url:signed.data.signedUrl});
});

app.put("/api/admin/workers/:id/identity-review", requirePermission("workers:review"), async (req,res)=>{
  if(!ready(res))return;
  const status=normalizeIdentityStatus(req.body.identity_status || req.body.status);
  const reason=String(req.body.reason || req.body.identity_rejection_reason || "").trim();
  const note=String(req.body.note || req.body.identity_review_note || "").trim();

  const {data:worker,error:readError}=await supabase.from("workers").select("id,name,id_front_path,id_back_path").eq("id",id(req)).single();
  if(readError||!worker) return res.status(404).json({success:false,error:"الصنايعي غير موجود"});

  // Admin override: the admin may verify/approve a worker even if ID card images are missing.
  // New registrations still require front/back ID images from /api/register.

  const updates={
    identity_status:status,
    identity_verified:status==="verified",
    identity_rejection_reason:reason,
    identity_review_note:note,
    identity_reviewed_at:new Date().toISOString()
  };

  if(status==="verified"){
    updates.approved=true;
    updates.active=true;
  }else if(status==="rejected" || status==="needs_data" || status==="needs_id_reupload" || status==="pending"){
    updates.approved=false;
    updates.identity_verified=false;
  }

  const {error}=await supabase.from("workers").update(updates).eq("id",id(req));
  if(error)return res.status(500).json({success:false,error:error.message});
  await logAdminActivity("identity_review",{entity_type:"worker",entity_id:id(req),entity_name:worker.name||"صنايعي",details:{status,label:identityStatusLabel(status),reason,note}});
  res.json({success:true,status,label:identityStatusLabel(status)});
});

app.get("/api/workers/check-duplicate", async (req,res)=>{
  if(!ready(res))return;
  try{
    const duplicate = await findDuplicateWorkerByPhone(req.query.phone, req.query.whatsapp);
    if(!duplicate) return res.json({success:true,duplicate:false});
    return res.json({success:true,duplicate:true,field:"phone_or_whatsapp",worker:{id:duplicate.id,name:duplicate.name}});
  }catch(e){
    return res.status(500).json({success:false,error:e.message||"تعذر فحص تكرار الرقم"});
  }
});

function normalizeStatusLookup(raw){ return String(raw || "").trim().toUpperCase().replace(/\s+/g, ""); }
function publicStatusForWorker(w){
  const identity = normalizeIdentityStatus(w.identity_status || (bool(w.identity_verified) ? "verified" : "pending"));
  const approved = bool(w.approved);
  const active = bool(w.active);
  let key = identity;
  if(approved && identity === "verified" && active) key = "accepted";
  else if(approved && identity === "verified" && !active) key = "accepted_inactive";
  else if(approved) key = active ? "accepted" : "accepted_inactive";

  const map = {
    accepted: {
      label: "تم القبول",
      tone: "success",
      message: "تم قبول طلبك ويمكن أن يظهر في الدليل حسب حالة الاشتراك والتفعيل."
    },
    accepted_inactive: {
      label: "تم القبول - غير نشط حاليًا",
      tone: "warning",
      message: "تم قبول طلبك، لكن الحساب غير نشط حاليًا. تواصل مع الإدارة لمعرفة سبب الإيقاف أو الاشتراك."
    },
    pending: {
      label: "بانتظار المراجعة",
      tone: "pending",
      message: "طلبك وصل للإدارة ولم يتم اتخاذ قرار نهائي بعد."
    },
    rejected: {
      label: "مرفوض",
      tone: "danger",
      message: "تم رفض الطلب. يمكنك التواصل مع الإدارة لمعرفة المطلوب."
    },
    needs_data: {
      label: "يحتاج تعديل بيانات",
      tone: "warning",
      message: "الإدارة تحتاج تعديل أو استكمال بعض البيانات قبل الاعتماد."
    },
    needs_id_reupload: {
      label: "إعادة رفع البطاقة",
      tone: "warning",
      message: "الإدارة تحتاج إعادة إرسال صورة البطاقة الشخصية بوضوح."
    }
  };
  const out = map[key] || map.pending;
  return {
    key,
    identity_status: identity,
    label: out.label,
    tone: out.tone,
    message: out.message,
    reason: ["rejected","needs_data","needs_id_reupload"].includes(identity) ? String(w.identity_rejection_reason || "").trim() : ""
  };
}

app.get("/api/registration-status", async (req,res)=>{
  if(!ready(res))return;
  try{
    const raw = String(req.query.q || req.query.query || req.query.code || req.query.phone || "").trim();
    if(!raw) return res.status(400).json({success:false,error:"اكتب رقم الطلب أو رقم الهاتف أولًا"});

    const columns = "id,registration_code,name,trade,area,phone,whatsapp,approved,active,identity_status,identity_verified,identity_rejection_reason,created_at,subscription_end";
    const normalizedLookup = normalizeStatusLookup(raw);
    let worker = null;

    if(/^SN-\d{4}-\d{5}$/i.test(normalizedLookup)){
      const byCode = await supabase.from("workers").select(columns).eq("registration_code", normalizedLookup).limit(1);
      if(byCode.error) return res.status(500).json({success:false,error:byCode.error.message});
      worker = (byCode.data || [])[0] || null;

      if(!worker){
        const match = normalizedLookup.match(/^SN-\d{4}-(\d{5})$/i);
        const possibleId = match ? Number(match[1]) : 0;
        if(possibleId){
          const byId = await supabase.from("workers").select(columns).eq("id", possibleId).limit(1);
          if(byId.error) return res.status(500).json({success:false,error:byId.error.message});
          worker = (byId.data || [])[0] || null;
        }
      }
    }else{
      const wantedPhone = normalizeWorkerPhone(raw);
      if(!wantedPhone || wantedPhone.length < 10){
        return res.status(400).json({success:false,error:"اكتب رقم طلب صحيح مثل SN-2026-00025 أو رقم هاتف صحيح"});
      }
      const list = await supabase.from("workers").select(columns).order("id",{ascending:false}).limit(5000);
      if(list.error) return res.status(500).json({success:false,error:list.error.message});
      worker = (list.data || []).find(w => workerPhoneKeysFromValues(w.phone, w.whatsapp).includes(wantedPhone)) || null;
    }

    if(!worker){
      return res.status(404).json({success:false,found:false,error:"لم يتم العثور على طلب بهذا الرقم"});
    }

    const status = publicStatusForWorker(worker);
    const registrationCode = worker.registration_code || makeRegistrationCode(worker.id, worker.created_at);
    return res.json({
      success:true,
      found:true,
      request:{
        registration_code: registrationCode,
        name: worker.name || "",
        trade: worker.trade || "",
        area: worker.area || "",
        created_at: worker.created_at || ""
      },
      status
    });
  }catch(e){
    return res.status(500).json({success:false,error:e.message || "تعذر معرفة حالة الطلب"});
  }
});

app.get("/api/workers/:id", async (req,res)=>{ if(!ready(res))return; const {data,error}=await supabase.from("workers").select(PUBLIC_WORKER_COLUMNS).eq("id",id(req)).single(); if(error||!data)return res.status(404).json({success:false,error:"الصنايعي غير موجود"}); const scored=await attachSmartScoresToWorkers([data]); res.json(scored[0]||data); });

async function insertWorker(req,res){
  if(!ready(res))return;
  try{
    const {name,phone,whatsapp,trade,area,description}=req.body;
    if(!name||!phone||!trade||!area) return res.status(400).json({success:false,error:"الاسم ورقم الاتصال والحرفة والمنطقة مطلوبين"});

    const duplicate = await findDuplicateWorkerByPhone(phone, whatsapp);
    if(duplicate){
      return res.status(409).json({
        success:false,
        error:`هذا الرقم مسجل بالفعل باسم ${duplicate.name}. لا يمكن تسجيل نفس رقم الهاتف أو الواتساب أكثر من مرة.`,
        duplicate:true,
        duplicate_worker_id:duplicate.id
      });
    }

    const frontFile = idFrontFile(req);
    const backFile = idBackFile(req);
    if(!frontFile || !backFile){
      return res.status(400).json({success:false,error:"صورة البطاقة الشخصية وجه وظهر مطلوبة لإكمال طلب التسجيل"});
    }

    const image = mainFile(req) ? await uploadImage(mainFile(req),"profiles") : "";
    const id_front_path = await uploadPrivateImage(frontFile,"id-cards");
    const id_back_path = await uploadPrivateImage(backFile,"id-cards");
    const start=today(), end=addMonths(start,1);
    const {data:worker,error}=await supabase.from("workers").insert({name:String(name).trim(),phone:String(phone).trim(),whatsapp:whatsapp?String(whatsapp).trim():"",trade:String(trade).trim(),area:String(area).trim(),description:description?String(description).trim():"",image,id_front_path,id_back_path,id_submitted_at:new Date().toISOString(),identity_status:"pending",identity_verified:false,identity_rejection_reason:"",identity_review_note:"",identity_reviewed_at:null,approved:false,active:true,featured:false,subscription_start:start,subscription_end:end}).select().single();
    if(error) throw error;
    const registrationCode = makeRegistrationCode(worker.id, worker.created_at || Date.now());
    const {error:codeError}=await supabase.from("workers").update({registration_code:registrationCode}).eq("id",worker.id);
    if(codeError) console.warn("Registration code was generated but not saved. Run Patch 19 SQL:", codeError.message);
    const photos=[];
    for(const f of workFiles(req)){ photos.push({worker_id:worker.id,image:await uploadImage(f,"work-photos")}); }
    if(photos.length){ const {error:pe}=await supabase.from("worker_photos").insert(photos); if(pe) throw pe; }
    await logAdminActivity("worker_register",{entity_type:"worker",entity_id:worker.id,entity_name:worker.name||String(name).trim(),details:{registration_code:registrationCode,trade:String(trade).trim(),area:String(area).trim()}});
    res.json({success:true,message:"تم إرسال طلب التسجيل بنجاح",id:worker.id,registration_code:registrationCode,registrationCode});
  }catch(e){ res.status(500).json({success:false,error:e.message||"حدث خطأ أثناء التسجيل"}); }
}
app.post("/api/register", workerUpload, insertWorker);
app.post("/api/sanaieya", workerUpload, insertWorker);
app.post("/api/workers", workerUpload, insertWorker);

// ===============================
// Admin Direct Worker Create
// ===============================
async function createWorkerFromAdmin(req,res){
  if(!ready(res))return;
  try{
    const b = req.body || {};
    const name = String(b.name || "").trim();
    const phone = String(b.phone || "").trim();
    const whatsapp = String(b.whatsapp || "").trim();
    const trade = String(b.trade || "").trim();
    const area = String(b.area || "").trim();
    const description = String(b.description || "").trim();

    if(!name || !phone || !trade || !area){
      return res.status(400).json({success:false,error:"الاسم ورقم الهاتف والحرفة والمنطقة مطلوبين"});
    }

    const duplicate = await findDuplicateWorkerByPhone(phone, whatsapp);
    if(duplicate){
      return res.status(409).json({
        success:false,
        error:`هذا الرقم مسجل بالفعل باسم ${duplicate.name}. لا يمكن تسجيل نفس رقم الهاتف أو الواتساب أكثر من مرة.`,
        duplicate:true,
        duplicate_worker_id:duplicate.id
      });
    }

    const frontFile = idFrontFile(req);
    const backFile = idBackFile(req);

    if((frontFile && !backFile) || (!frontFile && backFile)){
      return res.status(400).json({success:false,error:"لو هترفع البطاقة لازم ترفع الوجه والظهر معًا، أو اترك الاثنين فارغين."});
    }

    const image = mainFile(req) ? await uploadImage(mainFile(req),"profiles") : "";
    const id_front_path = frontFile ? await uploadPrivateImage(frontFile,"id-cards") : "";
    const id_back_path = backFile ? await uploadPrivateImage(backFile,"id-cards") : "";

    const start = today();
    const monthsRaw = Number(b.subscription_months || b.months || 1);
    const months = Math.max(1, Math.min(60, Number.isFinite(monthsRaw) ? monthsRaw : 1));
    const end = addMonths(start, months);

    const hasFullId = !!(frontFile && backFile);
    const identityVerified = hasFullId && bool(b.identity_verified);
    const approved = b.approved === undefined ? true : bool(b.approved);
    const active = b.active === undefined ? true : bool(b.active);
    const featured = bool(b.featured);

    const insertRow = {
      name,
      phone,
      whatsapp,
      trade,
      area,
      description,
      image,
      id_front_path,
      id_back_path,
      id_submitted_at: hasFullId ? new Date().toISOString() : null,
      identity_status: identityVerified ? "verified" : "pending",
      identity_verified: identityVerified,
      identity_rejection_reason: "",
      identity_review_note: "",
      identity_reviewed_at: identityVerified ? new Date().toISOString() : null,
      approved,
      active,
      featured,
      subscription_start: start,
      subscription_end: end
    };

    const {data:worker,error}=await supabase.from("workers").insert(insertRow).select().single();
    if(error) throw error;

    const registrationCode = makeRegistrationCode(worker.id, worker.created_at || Date.now());
    const {error:codeError}=await supabase.from("workers").update({registration_code:registrationCode}).eq("id",worker.id);
    if(codeError) console.warn("Registration code was generated but not saved:", codeError.message);

    const photos = [];
    for(const f of workFiles(req)){
      photos.push({worker_id:worker.id,image:await uploadImage(f,"work-photos")});
    }
    if(photos.length){
      const {error:pe}=await supabase.from("worker_photos").insert(photos);
      if(pe) throw pe;
    }

    await logAdminActivity("worker_register",{
      entity_type:"worker",
      entity_id:worker.id,
      entity_name:worker.name || name,
      details:{
        source:"admin_direct_create",
        registration_code:registrationCode,
        trade,
        area,
        approved,
        active,
        featured,
        identity_verified:identityVerified,
        has_identity_files:hasFullId,
        subscription_months:months,
        work_photos:photos.length
      }
    });

    try{
      if(typeof refreshLiveStats === "function") await refreshLiveStats();
    }catch(e){}

    return res.json({
      success:true,
      message:"تمت إضافة الصنايعي من الإدارة بنجاح",
      id:worker.id,
      registration_code:registrationCode,
      registrationCode,
      approved,
      active,
      featured,
      identity_verified:identityVerified,
      identity_status:identityVerified ? "verified" : "pending"
    });
  }catch(e){
    return res.status(500).json({success:false,error:e.message || "حدث خطأ أثناء إضافة الصنايعي من الإدارة"});
  }
}
app.post("/api/admin/workers/create", requirePermission("workers:create"), workerUpload, createWorkerFromAdmin);


async function updateWorker(req,res){
  if(!ready(res))return;
  const u={}, b=req.body||{};
  ["name","phone","whatsapp","trade","area","description"].forEach(k=>{ if(b[k]!==undefined) u[k]=b[k]; });
  if(b.approved!==undefined) u.approved=bool(b.approved);
  if(b.active!==undefined) u.active=bool(b.active);
  if(b.featured!==undefined) u.featured=bool(b.featured);
  const {data:before}=await supabase.from("workers").select("*").eq("id",id(req)).single();
  const beforeFields={};
  Object.keys(u).forEach(k=>{ beforeFields[k]=before ? before[k] : null; });
  const {data:afterRow,error}=await supabase.from("workers").update(u).eq("id",id(req)).select("*").single();
  if(error)return res.status(500).json({success:false,error:error.message});
  const afterFields={};
  Object.keys(u).forEach(k=>{ afterFields[k]=afterRow ? afterRow[k] : u[k]; });
  await logAdminActivity("worker_update",{entity_type:"worker",entity_id:id(req),entity_name:(u.name||before?.name||"صنايعي"),details:{fields:Object.keys(u)},before_data:beforeFields,after_data:afterFields});
  res.json({success:true});
}
app.put("/api/workers/:id", requirePermission("workers:update"), updateWorker); app.put("/api/sanaieya/:id", requirePermission("workers:update"), updateWorker);
async function setBool(req,res,col){
  if(!ready(res))return;
  const value=bool(req.body[col]);
  const updates={[col]:value};
  const {data:worker}=await supabase.from("workers").select("*").eq("id",id(req)).single();

  if(col==="approved" && value){
    // Admin override: approval is allowed from the dashboard even if ID card images are missing.
    updates.identity_status="verified";
    updates.identity_verified=true;
    updates.identity_rejection_reason="";
    updates.identity_reviewed_at=new Date().toISOString();
  }

  if(col==="approved" && !value){
    updates.identity_verified=false;
  }

  const {error}=await supabase.from("workers").update(updates).eq("id",id(req));
  if(error)return res.status(500).json({success:false,error:error.message});
  const action = col==="approved" ? (value?"worker_approve":"worker_unapprove") : col==="active" ? (value?"worker_activate":"worker_deactivate") : col==="featured" ? (value?"worker_feature":"worker_unfeature") : "worker_update";
  await logAdminActivity(action,{entity_type:"worker",entity_id:id(req),entity_name:worker?.name||"صنايعي",details:{field:col,value},before_data:{[col]:worker?worker[col]:null,identity_status:worker?worker.identity_status:null,identity_verified:worker?worker.identity_verified:null},after_data:updates});
  res.json({success:true});
}
app.put("/api/workers/:id/approve", requirePermission("workers:review"), (req,res)=>setBool(req,res,"approved")); app.put("/api/sanaieya/:id/approve", requirePermission("workers:review"), (req,res)=>setBool(req,res,"approved"));
app.put("/api/workers/:id/active", requirePermission("workers:update"), (req,res)=>setBool(req,res,"active")); app.put("/api/sanaieya/:id/active", requirePermission("workers:update"), (req,res)=>setBool(req,res,"active"));
app.put("/api/workers/:id/featured", requirePermission("workers:update"), (req,res)=>setBool(req,res,"featured")); app.put("/api/sanaieya/:id/featured", requirePermission("workers:update"), (req,res)=>setBool(req,res,"featured"));

function subscriptionPlanDefaults(plan){
  const plans = {
    month: {months: 1, amount: 100, label: "شهر"},
    half: {months: 6, amount: 600, label: "نصف سنة"},
    year: {months: 12, amount: 1200, label: "سنة"},
    custom: {months: 1, amount: 0, label: "مخصص"}
  };
  return plans[plan] || plans.month;
}

async function renew(req,res){
  if(!ready(res))return;
  const body=req.body||{};
  const plan=String(body.plan||"month").trim();
  const defaults=subscriptionPlanDefaults(plan);
  const months=Math.max(1, Math.min(60, Number(body.months)||defaults.months));
  const amount=Math.max(0, Number(body.amount ?? defaults.amount) || 0);
  const paymentMethod=String(body.payment_method||body.paymentMethod||"cash").trim();
  const paymentStatus=String(body.payment_status||body.paymentStatus||"paid").trim();
  const note=String(body.note||body.notes||"").trim();

  const {data:w,error}=await supabase.from("workers").select("*").eq("id",id(req)).single();
  if(error||!w)return res.status(404).json({success:false,error:"الصنايعي غير موجود"});

  const t=today();
  const previousEnd=w.subscription_end||null;
  let start=t;
  if(previousEnd){
    const d=new Date(previousEnd), td=new Date(t);
    if(!isNaN(d.getTime())&&d>td) start=previousEnd;
  }

  const newEnd=addMonths(start,months);
  const {error:ue}=await supabase.from("workers").update({subscription_start:t,subscription_end:newEnd,active:true}).eq("id",id(req));
  if(ue)return res.status(500).json({success:false,error:ue.message});

  let paymentLog=null, paymentLogWarning="";
  const paymentRow={
    worker_id:id(req),
    plan,
    months,
    amount,
    payment_method:paymentMethod,
    payment_status:paymentStatus,
    note,
    previous_subscription_end:previousEnd,
    new_subscription_end:newEnd
  };

  const {data:log,error:le}=await supabase.from("subscription_payments").insert(paymentRow).select().single();
  if(le){
    paymentLogWarning="تم تجديد الاشتراك، لكن لم يتم حفظ سجل الدفع. تأكد من إنشاء جدول subscription_payments في Supabase.";
  }else{
    paymentLog=log;
  }

  await logAdminActivity("subscription_renew",{entity_type:"worker",entity_id:id(req),entity_name:w.name||"صنايعي",details:{plan,months,amount,payment_method:paymentMethod,payment_status:paymentStatus,previous_subscription_end:previousEnd,new_subscription_end:newEnd}});

  res.json({
    success:true,
    subscription_start:t,
    subscription_end:newEnd,
    previous_subscription_end:previousEnd,
    months,
    amount,
    payment_log:paymentLog,
    warning:paymentLogWarning
  });
}
app.put("/api/workers/:id/renew", requirePermission("subscriptions:manage"), renew); app.put("/api/sanaieya/:id/renew", requirePermission("subscriptions:manage"), renew); app.put("/api/workers/:id/subscription", requirePermission("subscriptions:manage"), renew); app.put("/api/sanaieya/:id/subscription", requirePermission("subscriptions:manage"), renew);

app.get("/api/workers/:id/subscription-payments", requirePermission("subscriptions:manage"), async (req,res)=>{
  if(!ready(res))return;
  const {data,error}=await supabase
    .from("subscription_payments")
    .select("*")
    .eq("worker_id",id(req))
    .order("id",{ascending:false});
  if(error){
    return res.json({success:true,items:[],warning:"جدول subscription_payments غير موجود أو غير قابل للقراءة"});
  }
  res.json({success:true,items:data||[]});
});

// Photos
app.get("/api/workers/:id/photos", async (req,res)=>{ if(!ready(res))return; const {data,error}=await supabase.from("worker_photos").select("*").eq("worker_id",id(req)).order("id",{ascending:false}); if(error)return res.status(500).json({success:false,error:error.message}); res.json(data||[]); });
app.post("/api/workers/:id/photos", requirePermission("workers:update"), upload.array("workPhotos",5), async (req,res)=>{ if(!ready(res))return; try{ if(!req.files||!req.files.length)return res.status(400).json({success:false,error:"لم يتم رفع أي صور"}); const rows=[]; for(const f of req.files){ rows.push({worker_id:id(req),image:await uploadImage(f,"work-photos")}); } const {error}=await supabase.from("worker_photos").insert(rows); if(error)throw error; const {data:worker}=await supabase.from("workers").select("id,name").eq("id",id(req)).single(); await logAdminActivity("work_photos_add",{entity_type:"worker",entity_id:id(req),entity_name:worker?.name||"صنايعي",details:{count:rows.length}}); res.json({success:true,count:rows.length}); }catch(e){ res.status(500).json({success:false,error:e.message}); }});
app.delete("/api/workers/photos/:photoId", requirePermission("workers:update"), async (req,res)=>{ if(!ready(res))return; const photoId=Number(req.params.photoId); const {data:photo}=await supabase.from("worker_photos").select("id,worker_id").eq("id",photoId).single(); const {error}=await supabase.from("worker_photos").delete().eq("id",photoId); if(error)return res.status(500).json({success:false,error:error.message}); await logAdminActivity("work_photo_delete",{entity_type:"worker_photo",entity_id:photoId,entity_name:"صورة عمل",details:{worker_id:photo?.worker_id||null}}); res.json({success:true}); });

// Reviews
app.get("/api/workers/:id/reviews", async (req,res)=>{ if(!ready(res))return; const {data,error}=await supabase.from("reviews").select("*").eq("worker_id",id(req)).eq("approved",true).order("id",{ascending:false}); if(error)return res.status(500).json({success:false,error:error.message}); res.json(data||[]); });
app.get("/api/workers/:id/reviews/summary", async (req,res)=>{ if(!ready(res))return; const {data,error}=await supabase.from("reviews").select("rating").eq("worker_id",id(req)).eq("approved",true); if(error)return res.status(500).json({success:false,error:error.message}); const count=(data||[]).length, sum=(data||[]).reduce((a,r)=>a+Number(r.rating||0),0); res.json({count,average:count?Math.round((sum/count)*10)/10:0}); });
app.post("/api/workers/:id/reviews", async (req,res)=>{ if(!ready(res))return; const rating=Number(req.body.rating), comment=String(req.body.comment||req.body.review||"").trim(), customer=String(req.body.customer_name||req.body.customerName||req.body.name||"عميل").trim(); if(!rating||rating<1||rating>5)return res.status(400).json({success:false,error:"التقييم يجب أن يكون من 1 إلى 5"}); if(!comment)return res.status(400).json({success:false,error:"من فضلك اكتب الريفيو"}); const {error}=await supabase.from("reviews").insert({worker_id:id(req),customer_name:customer||"عميل",rating,comment,approved:false}); if(error)return res.status(500).json({success:false,error:error.message}); res.json({success:true,message:"تم إرسال التقييم بنجاح، وسيظهر بعد مراجعة الإدارة"}); });
app.get("/api/admin/reviews", requirePermission("workers:read"), async (req,res)=>{ if(!ready(res))return; const {data,error}=await supabase.from("reviews").select("*, workers(name, trade, area)").order("id",{ascending:false}); if(error)return res.status(500).json({success:false,error:error.message}); res.json((data||[]).map(r=>({...r,worker_name:r.workers?r.workers.name:"",worker_trade:r.workers?r.workers.trade:"",worker_area:r.workers?r.workers.area:""}))); });
app.put("/api/reviews/:id/approve", requirePermission("reviews:review"), async (req,res)=>{ if(!ready(res))return; const reviewId=Number(req.params.id); const approved=bool(req.body.approved); const {data:review}=await supabase.from("reviews").select("id,worker_id,customer_name,rating").eq("id",reviewId).single(); const {error}=await supabase.from("reviews").update({approved}).eq("id",reviewId); if(error)return res.status(500).json({success:false,error:error.message}); await logAdminActivity(approved?"review_approve":"review_unapprove",{entity_type:"review",entity_id:reviewId,entity_name:review?.customer_name||"تقييم",details:{worker_id:review?.worker_id||null,rating:review?.rating||null,approved}}); res.json({success:true}); });
app.delete("/api/reviews/:id", requirePermission("reviews:review"), async (req,res)=>{ if(!ready(res))return; const reviewId=Number(req.params.id); const {data:review}=await supabase.from("reviews").select("id,worker_id,customer_name,rating").eq("id",reviewId).single(); const {error}=await supabase.from("reviews").delete().eq("id",reviewId); if(error)return res.status(500).json({success:false,error:error.message}); await logAdminActivity("review_delete",{entity_type:"review",entity_id:reviewId,entity_name:review?.customer_name||"تقييم",details:{worker_id:review?.worker_id||null,rating:review?.rating||null}}); res.json({success:true}); });

// Delete worker
async function deleteWorker(req,res){ if(!ready(res))return; const {data:worker}=await supabase.from("workers").select("id,name,phone,trade,area").eq("id",id(req)).single(); const {error}=await supabase.from("workers").delete().eq("id",id(req)); if(error)return res.status(500).json({success:false,error:error.message}); await logAdminActivity("worker_delete",{entity_type:"worker",entity_id:id(req),entity_name:worker?.name||"صنايعي",details:{phone:worker?.phone||"",trade:worker?.trade||"",area:worker?.area||""}}); res.json({success:true}); }
app.delete("/api/workers/:id", requirePermission("workers:delete"), deleteWorker); app.delete("/api/sanaieya/:id", requirePermission("workers:delete"), deleteWorker);

// Trades / Areas
async function listTable(res,table){ const {data,error}=await supabase.from(table).select("*").order("id",{ascending:false}); if(error)return res.status(500).json({success:false,error:error.message}); res.json(data||[]); }
async function addToTable(req,res,table,label){ const name=req.body.name||req.body.trade||req.body.craft||req.body.area||req.body.location; if(!name||!String(name).trim())return res.status(400).json({success:false,error:`اسم ${label} مطلوب`}); const cleanName=String(name).trim(); const {data,error}=await supabase.from(table).insert({name:cleanName}).select().single(); if(error)return res.status(500).json({success:false,error:`${label} موجودة بالفعل أو حدث خطأ أثناء الإضافة`}); await logAdminActivity(table==="trades"?"trade_add":"area_add",{entity_type:table,entity_id:data.id,entity_name:data.name||cleanName,details:{label}}); res.json({success:true,id:data.id,name:data.name}); }
async function delFromTable(req,res,table){ const rowId=Number(req.params.id); const {data:row}=await supabase.from(table).select("id,name").eq("id",rowId).single(); const {error}=await supabase.from(table).delete().eq("id",rowId); if(error)return res.status(500).json({success:false,error:error.message}); await logAdminActivity(table==="trades"?"trade_delete":"area_delete",{entity_type:table,entity_id:rowId,entity_name:row?.name||"",details:{}}); res.json({success:true}); }
app.get("/api/trades",(req,res)=>ready(res)&&listTable(res,"trades")); app.get("/api/crafts",(req,res)=>ready(res)&&listTable(res,"trades")); app.get("/trades",(req,res)=>ready(res)&&listTable(res,"trades")); app.get("/crafts",(req,res)=>ready(res)&&listTable(res,"trades"));
app.post("/api/trades", requirePermission("settings:manage"), (req,res)=>ready(res)&&addToTable(req,res,"trades","الحرفة")); app.post("/api/crafts", requirePermission("settings:manage"), (req,res)=>ready(res)&&addToTable(req,res,"trades","الحرفة")); app.post("/trades", requirePermission("settings:manage"), (req,res)=>ready(res)&&addToTable(req,res,"trades","الحرفة")); app.post("/crafts", requirePermission("settings:manage"), (req,res)=>ready(res)&&addToTable(req,res,"trades","الحرفة"));
app.delete("/api/trades/:id", requirePermission("settings:manage"), (req,res)=>ready(res)&&delFromTable(req,res,"trades")); app.delete("/api/crafts/:id", requirePermission("settings:manage"), (req,res)=>ready(res)&&delFromTable(req,res,"trades")); app.delete("/trades/:id", requirePermission("settings:manage"), (req,res)=>ready(res)&&delFromTable(req,res,"trades")); app.delete("/crafts/:id", requirePermission("settings:manage"), (req,res)=>ready(res)&&delFromTable(req,res,"trades"));

app.get("/api/areas",(req,res)=>ready(res)&&listTable(res,"areas")); app.get("/api/locations",(req,res)=>ready(res)&&listTable(res,"areas")); app.get("/areas",(req,res)=>ready(res)&&listTable(res,"areas")); app.get("/locations",(req,res)=>ready(res)&&listTable(res,"areas"));
app.post("/api/areas", requirePermission("settings:manage"), (req,res)=>ready(res)&&addToTable(req,res,"areas","المنطقة")); app.post("/api/locations", requirePermission("settings:manage"), (req,res)=>ready(res)&&addToTable(req,res,"areas","المنطقة")); app.post("/areas", requirePermission("settings:manage"), (req,res)=>ready(res)&&addToTable(req,res,"areas","المنطقة")); app.post("/locations", requirePermission("settings:manage"), (req,res)=>ready(res)&&addToTable(req,res,"areas","المنطقة"));
app.delete("/api/areas/:id", requirePermission("settings:manage"), (req,res)=>ready(res)&&delFromTable(req,res,"areas")); app.delete("/api/locations/:id", requirePermission("settings:manage"), (req,res)=>ready(res)&&delFromTable(req,res,"areas")); app.delete("/areas/:id", requirePermission("settings:manage"), (req,res)=>ready(res)&&delFromTable(req,res,"areas")); app.delete("/locations/:id", requirePermission("settings:manage"), (req,res)=>ready(res)&&delFromTable(req,res,"areas"));



function topCounts(rows, field, limit=6){
  const map = {};
  (rows||[]).forEach(row=>{
    const name = String(row[field] || "غير محدد").trim() || "غير محدد";
    map[name] = (map[name] || 0) + 1;
  });
  return Object.entries(map)
    .map(([name,count])=>({name,count}))
    .sort((a,b)=>b.count-a.count)
    .slice(0,limit);
}
function sumAmounts(rows){
  return (rows||[]).reduce((sum,row)=>sum + (Number(row.amount)||0), 0);
}
function startOfCurrentMonthISO(){
  const now = new Date();
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1)).toISOString();
}

app.get("/api/admin/dashboard-stats", requirePermission("analytics:read"), async (req,res)=>{
  if(!ready(res))return;
  const t=today();
  const soonDate=new Date();
  soonDate.setDate(soonDate.getDate()+7);
  const st=soonDate.toISOString().split("T")[0];

  try{
    const [workersRes,reviewsRes]=await Promise.all([
      supabase.from("workers").select("id,name,trade,area,approved,active,featured,subscription_end,created_at,identity_status,identity_verified"),
      supabase.from("reviews").select("id,approved,rating,worker_id")
    ]);

    if(workersRes.error) throw workersRes.error;
    if(reviewsRes.error) throw reviewsRes.error;

    const workers=workersRes.data||[];
    const reviews=reviewsRes.data||[];

    const approvedWorkers=workers.filter(w=>bool(w.approved));
    const pendingWorkers=workers.filter(w=>!bool(w.approved));
    const featuredWorkers=workers.filter(w=>bool(w.featured));
    const activeSubs=workers.filter(w=>!w.subscription_end || w.subscription_end>=t);
    const soonSubs=workers.filter(w=>w.subscription_end && w.subscription_end>=t && w.subscription_end<=st);
    const expiredSubs=workers.filter(w=>w.subscription_end && w.subscription_end<t);
    const pendingReviews=reviews.filter(r=>!bool(r.approved));
    const identityStatusCounts=workers.reduce((acc,w)=>{ const s=normalizeIdentityStatus(w.identity_status || (bool(w.identity_verified)?"verified":"pending")); acc[s]=(acc[s]||0)+1; return acc; },{pending:0,verified:0,rejected:0,needs_data:0,needs_id_reupload:0});

    let payments={count:0,totalAmount:0,monthAmount:0,averageAmount:0,recent:[]};
    let paymentsWarning="";

    const paymentsRes=await supabase
      .from("subscription_payments")
      .select("*, workers(name)")
      .order("id",{ascending:false})
      .limit(250);

    if(paymentsRes.error){
      paymentsWarning="جدول subscription_payments غير موجود أو غير قابل للقراءة. شغّل ملف SQL الخاص بالاشتراكات أولًا.";
    }else{
      const paymentRows=paymentsRes.data||[];
      const paidRows=paymentRows.filter(p=>String(p.payment_status||"paid")!=="pending");
      const currentMonthStart=startOfCurrentMonthISO();
      const monthRows=paidRows.filter(p=>p.created_at && String(p.created_at)>=currentMonthStart);
      payments.count=paymentRows.length;
      payments.totalAmount=sumAmounts(paidRows);
      payments.monthAmount=sumAmounts(monthRows);
      payments.averageAmount=paidRows.length?Math.round((payments.totalAmount/paidRows.length)*10)/10:0;
      payments.recent=paymentRows.slice(0,10).map(p=>({
        id:p.id,
        worker_id:p.worker_id,
        worker_name:p.workers&&p.workers.name?p.workers.name:"",
        amount:p.amount,
        plan:p.plan,
        months:p.months,
        payment_method:p.payment_method,
        payment_status:p.payment_status,
        created_at:p.created_at
      }));
    }

    res.json({
      success:true,
      workers:{
        total:workers.length,
        approved:approvedWorkers.length,
        pending:pendingWorkers.length,
        featured:featuredWorkers.length
      },
      subscriptions:{
        active:activeSubs.length,
        soon:soonSubs.length,
        expired:expiredSubs.length
      },
      reviews:{
        total:reviews.length,
        pending:pendingReviews.length,
        approved:reviews.length-pendingReviews.length
      },
      identity:identityStatusCounts,
      payments,
      paymentsWarning,
      topTrades:topCounts(workers,"trade"),
      topAreas:topCounts(workers,"area")
    });
  }catch(e){
    res.status(500).json({success:false,error:e.message||"تعذر تحميل الإحصائيات"});
  }
});



app.get("/api/admin/activity-log", requirePermission("activity_log:read"), async (req,res)=>{
  if(!ready(res))return;
  const limit=Math.max(10, Math.min(500, Number(req.query.limit)||150));
  const action=String(req.query.action||"").trim();
  let query=supabase.from("admin_activity_log").select("*").order("id",{ascending:false}).limit(limit);
  if(action) query=query.eq("action",action);
  const {data,error}=await query;
  if(error){
    return res.json({success:true,items:[],warning:"جدول admin_activity_log غير موجود أو غير قابل للقراءة. شغّل ملف SQL الخاص بسجل النشاط أولًا."});
  }
  res.json({success:true,items:data||[]});
});

// Notifications
app.get("/api/admin/notifications", requirePermission("workers:read"), async (req,res)=>{ if(!ready(res))return; const t=today(); const s=new Date(); s.setDate(s.getDate()+7); const st=s.toISOString().split("T")[0]; const [a,b,c,d]=await Promise.all([supabase.from("workers").select("id",{count:"exact",head:true}).eq("approved",false),supabase.from("reviews").select("id",{count:"exact",head:true}).eq("approved",false),supabase.from("workers").select("id",{count:"exact",head:true}).gte("subscription_end",t).lte("subscription_end",st),supabase.from("workers").select("id",{count:"exact",head:true}).lt("subscription_end",t)]); res.json({pendingWorkers:a.count||0,pendingReviews:b.count||0,subscriptionsSoon:c.count||0,subscriptionsExpired:d.count||0}); });

app.get("/api/admin/smart-score", requirePermission("analytics:read"), async (req,res)=>{
  if(!ready(res))return;
  try{
    const {data,error}=await supabase
      .from("workers")
      .select(PUBLIC_WORKER_COLUMNS)
      .eq("approved",true)
      .eq("active",true)
      .or(`subscription_end.is.null,subscription_end.gte.${today()}`)
      .limit(3000);
    if(error) return res.status(500).json({success:false,error:error.message});
    const scored=await attachSmartScoresToWorkers(data||[]);
    res.json({
      success:true,
      description:"ترتيب ذكي يعتمد على التمييز، التوثيق، الاشتراك، التقييمات، التواصل، الزيارات، والأحدث.",
      analytics_days:Number(process.env.SMART_SCORE_ANALYTICS_DAYS || 30),
      total:scored.length,
      workers:scored.slice(0,200)
    });
  }catch(e){
    res.status(500).json({success:false,error:e.message});
  }
});


// Export CSV
function csv(v){
  if(v===null||v===undefined)return "";
  let t=String(v).replace(/"/g,'""');
  if(/^[=+\-@]/.test(t)) t="'"+t;
  return /[,"\n]/.test(t)?`"${t}"`:t;
}
app.get("/api/export-workers", requirePermission("backup:export"), async (req,res)=>{ if(!ready(res))return; const {data:workers,error}=await supabase.from("workers").select("*").order("id",{ascending:false}); if(error)return res.status(500).json({success:false,error:error.message}); const {data:reviews}=await supabase.from("reviews").select("worker_id,rating").eq("approved",true); const by={}; (reviews||[]).forEach(r=>{ const k=String(r.worker_id); if(!by[k])by[k]=[]; by[k].push(Number(r.rating||0)); }); const headers=["رقم الطلب","ID","الاسم","رقم الهاتف","رقم الواتساب","الحرفة","المنطقة","الوصف","حالة الموافقة","حالة التفعيل","حالة التحقق","سبب التحقق","مميز","بداية الاشتراك","نهاية الاشتراك","تاريخ التسجيل","عدد التقييمات المعتمدة","متوسط التقييم"]; const lines=[headers.map(csv).join(",")]; (workers||[]).forEach(w=>{ const rs=by[String(w.id)]||[], count=rs.length, avg=count?Math.round((rs.reduce((a,b)=>a+b,0)/count)*10)/10:0; lines.push([w.registration_code||makeRegistrationCode(w.id,w.created_at),w.id,w.name,w.phone,w.whatsapp,w.trade,w.area,w.description,w.approved?"موافق عليه":"بانتظار الموافقة",w.active?"نشط":"متوقف",identityStatusLabel(normalizeIdentityStatus(w.identity_status || (w.identity_verified?"verified":"pending"))),w.identity_rejection_reason||"",w.featured?"مميز":"عادي",w.subscription_start,w.subscription_end,w.created_at,count,avg].map(csv).join(",")); }); const content="\uFEFF"+lines.join("\n"); res.setHeader("Content-Type","text/csv; charset=utf-8"); res.setHeader("Content-Disposition",`attachment; filename="sanay3i-workers-report.csv"`); res.send(content); });
// ===============================
// Backup & Export Patch
// ===============================
const BACKUP_BUCKET = process.env.SUPABASE_BACKUP_BUCKET || "backups";
const BACKUP_TABLES = [
  { name: "workers", label: "الصنايعية", required: true },
  { name: "worker_photos", label: "صور الأعمال" },
  { name: "reviews", label: "التقييمات" },
  { name: "trades", label: "الحرف" },
  { name: "areas", label: "المناطق" },
  { name: "subscription_payments", label: "مدفوعات الاشتراكات" },
  { name: "analytics_events", label: "أحداث التحليلات" },
  { name: "worker_reports", label: "بلاغات الصنايعية" },
  { name: "admin_activity_log", label: "سجل عمليات الإدارة" },
  { name: "admin_users", label: "مستخدمي الإدارة", sanitize: true }
];

function backupFileStamp(){
  return new Date().toISOString().replace(/[:.]/g,"-");
}

function backupFileName(prefix="sanay3i-backup"){
  return `${prefix}-${backupFileStamp()}.json`;
}

function sanitizeBackupRow(tableName, row){
  const out = { ...(row || {}) };
  if(tableName === "admin_users"){
    delete out.password_hash;
    delete out.password_salt;
  }
  return out;
}

async function readSupabaseTableForBackup(tableName, options={}){
  const pageSize = 1000;
  let from = 0;
  const rows = [];
  while(true){
    let q = supabase.from(tableName).select("*").range(from, from + pageSize - 1);
    const { data, error } = await q;
    if(error) return { success:false, table:tableName, count:0, rows:[], error:error.message };
    const chunk = data || [];
    rows.push(...chunk.map(r => options.sanitize ? sanitizeBackupRow(tableName, r) : r));
    if(chunk.length < pageSize) break;
    from += pageSize;
    if(from > 100000) break;
  }
  return { success:true, table:tableName, count:rows.length, rows };
}

async function buildFullBackup(admin=null){
  const generatedAt = new Date().toISOString();
  const result = {
    meta: {
      project: "sanay3i_matrouh",
      app: "صنايعي مطروح",
      type: "full_supabase_export",
      generated_at: generatedAt,
      generated_by: admin ? { username: admin.username, display_name: admin.display_name, role: admin.role } : null,
      note: "admin_users password hashes are intentionally excluded from this backup export."
    },
    tables: {},
    errors: []
  };

  for(const t of BACKUP_TABLES){
    const tableResult = await readSupabaseTableForBackup(t.name, { sanitize: !!t.sanitize });
    if(tableResult.success){
      result.tables[t.name] = {
        label: t.label,
        count: tableResult.count,
        rows: tableResult.rows
      };
    }else{
      result.tables[t.name] = { label: t.label, count: 0, rows: [], skipped: true };
      result.errors.push({ table: t.name, error: tableResult.error, required: !!t.required });
    }
  }
  result.meta.table_count = Object.keys(result.tables).length;
  result.meta.total_rows = Object.values(result.tables).reduce((sum, t) => sum + Number(t.count || 0), 0);
  return result;
}

function sendJsonDownload(res, data, filename){
  const body = JSON.stringify(data, null, 2);
  res.setHeader("Content-Type", "application/json; charset=utf-8");
  res.setHeader("Content-Disposition", `attachment; filename="${filename}"`);
  return res.send(body);
}

function sendCsvDownload(res, filename, headers, rows){
  const lines = [headers.map(csv).join(",")];
  (rows || []).forEach(row => lines.push(row.map(csv).join(",")));
  const content = "\uFEFF" + lines.join("\n");
  res.setHeader("Content-Type", "text/csv; charset=utf-8");
  res.setHeader("Content-Disposition", `attachment; filename="${filename}"`);
  return res.send(content);
}

async function ensureBackupBucket(){
  const { data: buckets, error: listError } = await supabase.storage.listBuckets();
  if(listError) throw new Error("تعذر قراءة Buckets من Supabase Storage: " + listError.message);
  const found = (buckets || []).some(b => b.name === BACKUP_BUCKET);
  if(!found){
    const { error: createError } = await supabase.storage.createBucket(BACKUP_BUCKET, { public: false });
    if(createError) throw new Error("تعذر إنشاء Bucket النسخ الاحتياطي: " + createError.message);
  }
}

async function uploadBackupToStorage(backup, folder="manual"){
  await ensureBackupBucket();
  const filePath = `${folder}/${backupFileName()}`;
  const payload = Buffer.from(JSON.stringify(backup, null, 2), "utf8");
  const { error } = await supabase.storage
    .from(BACKUP_BUCKET)
    .upload(filePath, payload, { contentType: "application/json; charset=utf-8", upsert: true });
  if(error) throw new Error("تعذر رفع النسخة الاحتياطية إلى Supabase Storage: " + error.message);
  return filePath;
}

app.get("/api/admin/backups/summary", requirePermission("backup:export"), async (req,res)=>{
  if(!ready(res)) return;
  const items = [];
  for(const t of BACKUP_TABLES){
    const { count, error } = await supabase.from(t.name).select("*", { count:"exact", head:true });
    items.push({ table:t.name, label:t.label, count: error ? null : (count || 0), error: error ? error.message : null });
  }
  res.json({ success:true, bucket:BACKUP_BUCKET, items, generated_at:new Date().toISOString() });
});

app.get("/api/admin/backups/full-json", requirePermission("backup:export"), async (req,res)=>{
  if(!ready(res)) return;
  try{
    const backup = await buildFullBackup(req.admin || null);
    await logAdminActivity("backup_export_json", { entity_type:"backup", entity_name:"Full JSON backup", details:{ tables:Object.keys(backup.tables), total_rows:backup.meta.total_rows } });
    return sendJsonDownload(res, backup, backupFileName());
  }catch(e){
    return res.status(500).json({ success:false, error:e.message || "تعذر إنشاء النسخة الاحتياطية" });
  }
});

app.post("/api/admin/backups/create", requirePermission("backup:export"), async (req,res)=>{
  if(!ready(res)) return;
  try{
    const backup = await buildFullBackup(req.admin || null);
    const filePath = await uploadBackupToStorage(backup, "manual");
    await logAdminActivity("backup_create_storage", { entity_type:"backup", entity_name:filePath, details:{ bucket:BACKUP_BUCKET, total_rows:backup.meta.total_rows } });
    return res.json({ success:true, bucket:BACKUP_BUCKET, path:filePath, total_rows:backup.meta.total_rows, generated_at:backup.meta.generated_at });
  }catch(e){
    return res.status(500).json({ success:false, error:e.message || "تعذر إنشاء النسخة الاحتياطية" });
  }
});

app.get("/api/admin/backups/subscriptions-csv", requirePermission("backup:export"), async (req,res)=>{
  if(!ready(res)) return;
  const { data: workers, error } = await supabase
    .from("workers")
    .select("id,registration_code,name,phone,whatsapp,trade,area,featured,active,approved,subscription_start,subscription_end,created_at")
    .order("subscription_end", { ascending:false, nullsFirst:false });
  if(error) return res.status(500).json({ success:false, error:error.message });

  const rows = (workers || []).map(w => {
    const end = w.subscription_end ? new Date(w.subscription_end) : null;
    const now = new Date();
    const daysLeft = end ? Math.ceil((end - now) / (24*60*60*1000)) : "";
    const status = !end ? "غير محدد" : daysLeft < 0 ? "منتهي" : daysLeft <= 7 ? "قارب الانتهاء" : "نشط";
    return [
      w.registration_code || makeRegistrationCode(w.id, w.created_at), w.id, w.name, w.phone, w.whatsapp,
      w.trade, w.area, w.featured ? "مميز" : "عادي", w.active ? "نشط" : "متوقف",
      w.approved ? "موافق عليه" : "بانتظار الموافقة", w.subscription_start, w.subscription_end, daysLeft, status
    ];
  });
  await logAdminActivity("backup_export_subscriptions_csv", { entity_type:"backup", entity_name:"subscriptions CSV", details:{ rows:rows.length } });
  return sendCsvDownload(res, "sanay3i-subscriptions-report.csv", ["رقم الطلب","ID","الاسم","الهاتف","واتساب","الحرفة","المنطقة","مميز","التفعيل","الموافقة","بداية الاشتراك","نهاية الاشتراك","الأيام المتبقية","حالة الاشتراك"], rows);
});

app.get("/api/admin/backups/payments-csv", requirePermission("backup:export"), async (req,res)=>{
  if(!ready(res)) return;
  const { data, error } = await supabase
    .from("subscription_payments")
    .select("*")
    .order("id", { ascending:false });
  if(error) return res.status(500).json({ success:false, error:"جدول subscription_payments غير موجود أو غير جاهز" });
  const all = data || [];
  const headers = Array.from(new Set(all.flatMap(row => Object.keys(row || {}))));
  const rows = all.map(row => headers.map(h => row[h]));
  await logAdminActivity("backup_export_payments_csv", { entity_type:"backup", entity_name:"payments CSV", details:{ rows:rows.length } });
  return sendCsvDownload(res, "sanay3i-payments-report.csv", headers, rows);
});

app.get("/api/admin/backups/activity-log-csv", requirePermission("backup:export"), async (req,res)=>{
  if(!ready(res)) return;
  const { data, error } = await supabase.from("admin_activity_log").select("*").order("id", { ascending:false }).limit(10000);
  if(error) return res.status(500).json({ success:false, error:"جدول admin_activity_log غير موجود أو غير جاهز" });
  const all = data || [];
  const headers = Array.from(new Set(all.flatMap(row => Object.keys(row || {}))));
  const rows = all.map(row => headers.map(h => typeof row[h] === "object" ? JSON.stringify(row[h]) : row[h]));
  return sendCsvDownload(res, "sanay3i-admin-activity-log.csv", headers, rows);
});

app.get("/api/admin/backups/analytics-csv", requirePermission("backup:export"), async (req,res)=>{
  if(!ready(res)) return;
  const daysRaw = Number(req.query.days || 90);
  const days = Math.max(1, Math.min(365, Number.isFinite(daysRaw) ? daysRaw : 90));
  const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString();
  const { data, error } = await supabase.from("analytics_events").select("*").gte("created_at", since).order("id", { ascending:false }).limit(50000);
  if(error) return res.status(500).json({ success:false, error:"جدول analytics_events غير موجود أو غير جاهز" });
  const all = data || [];
  const headers = Array.from(new Set(all.flatMap(row => Object.keys(row || {}))));
  const rows = all.map(row => headers.map(h => row[h]));
  return sendCsvDownload(res, `sanay3i-analytics-${days}-days.csv`, headers, rows);
});

// Backward-compatible old button route.
app.get("/api/backup-db", requirePermission("backup:export"), async (req,res)=>{
  if(!ready(res)) return;
  try{
    const backup = await buildFullBackup(req.admin || null);
    await logAdminActivity("backup_export_json", { entity_type:"backup", entity_name:"Full JSON backup", details:{ route:"/api/backup-db", total_rows:backup.meta.total_rows } });
    return sendJsonDownload(res, backup, backupFileName());
  }catch(e){
    return res.status(500).json({ success:false, error:e.message || "تعذر إنشاء النسخة الاحتياطية" });
  }
});

app.get("/api/cron/daily-backup", async (req,res)=>{
  if(!ready(res)) return;
  const secret = String(process.env.BACKUP_CRON_SECRET || "");
  const provided = String(req.query.secret || req.headers["x-backup-cron-secret"] || "");
  if(!secret || !provided || !safePasswordEqual(provided, secret)){
    return res.status(401).json({ success:false, error:"BACKUP_CRON_SECRET مطلوب لتشغيل النسخ الاحتياطي التلقائي" });
  }
  try{
    const backup = await buildFullBackup({ username:"cron", display_name:"Daily Backup Cron", role:"system" });
    const filePath = await uploadBackupToStorage(backup, "daily");
    await logAdminActivity("backup_auto_daily", { admin_name:"Daily Backup Cron", entity_type:"backup", entity_name:filePath, details:{ bucket:BACKUP_BUCKET, total_rows:backup.meta.total_rows } });
    return res.json({ success:true, bucket:BACKUP_BUCKET, path:filePath, total_rows:backup.meta.total_rows, generated_at:backup.meta.generated_at });
  }catch(e){
    return res.status(500).json({ success:false, error:e.message || "تعذر تشغيل النسخ الاحتياطي التلقائي" });
  }
});



// ===============================
// WhatsApp Cloud API Admin Endpoints
// ===============================
app.get("/api/admin/whatsapp/config", requirePermission("whatsapp:send"), async (req, res) => {
  const status = whatsappConfigStatus();
  res.json({ success: true, ...status, access_token_present: !!WHATSAPP_ACCESS_TOKEN });
});

app.get("/api/admin/whatsapp/logs", requirePermission("whatsapp:send"), async (req, res) => {
  if (!ready(res)) return;
  const limit = Math.min(500, Math.max(1, Number(req.query.limit || 100)));
  const status = String(req.query.status || "").trim();
  const workerId = String(req.query.worker_id || req.query.workerId || "").trim();
  try {
    let q = supabase.from("whatsapp_message_logs").select("*").order("created_at", { ascending: false }).limit(limit);
    if (status && status !== "all") q = q.eq("status", status);
    if (workerId) q = q.eq("worker_id", workerId);
    const { data, error } = await q;
    if (error) throw error;
    const items = data || [];
    const totals = items.reduce((acc, row) => {
      const key = row.status || "unknown";
      acc[key] = (acc[key] || 0) + 1;
      acc.total += 1;
      return acc;
    }, { total: 0, sent: 0, failed: 0, pending: 0 });
    res.json({ success: true, items, totals });
  } catch (e) {
    res.json({ success: true, items: [], totals: { total:0, sent:0, failed:0, pending:0 }, warning: "جدول whatsapp_message_logs غير موجود أو غير جاهز. شغّل ملف SQL الخاص بواتساب أولًا." });
  }
});

app.post("/api/admin/whatsapp/send-worker", requirePermission("whatsapp:send"), async (req, res) => {
  if (!ready(res)) return;
  const workerId = String(req.body.worker_id || req.body.workerId || "").trim();
  const rawPhone = String(req.body.phone || "").trim();
  const message = String(req.body.message || req.body.text || "").trim();
  const mode = String(req.body.mode || "text").toLowerCase() === "template" ? "template" : "text";
  const templateName = String(req.body.template_name || req.body.templateName || WHATSAPP_DEFAULT_TEMPLATE || "hello_world").trim();
  const languageCode = String(req.body.language_code || req.body.languageCode || WHATSAPP_DEFAULT_LANGUAGE || "en_US").trim();
  let worker = null;

  try {
    if (workerId) {
      const { data, error } = await supabase.from("workers").select("*").eq("id", workerId).single();
      if (error) throw error;
      worker = data;
    }
    const phone = rawPhone || worker?.whatsapp || worker?.whatsapp_number || worker?.phone || worker?.mobile || "";
    if (!phone) return res.status(400).json({ success: false, error: "لا يوجد رقم واتساب لهذا الصنايعي" });

    const sent = await sendWhatsAppCloudMessage({
      to: phone,
      message,
      mode,
      template_name: templateName,
      language_code: languageCode
    });
    const providerMessageId = sent.response?.messages?.[0]?.id || null;

    await insertWhatsAppLog({
      worker_id: workerId || null,
      worker_name: worker?.name || worker?.full_name || null,
      phone: sent.recipient,
      message_type: String(req.body.message_type || req.body.messageType || "admin_message"),
      message_text: mode === "template" ? `[template:${templateName}]` : message,
      send_mode: mode,
      template_name: mode === "template" ? templateName : null,
      status: "sent",
      provider_message_id: providerMessageId,
      provider_response: sent.response,
      sent_by: req.admin?.display_name || req.admin?.username || "الإدارة"
    });
    await logAdminActivity("whatsapp_send", {
      entity_type: "worker",
      entity_id: workerId || null,
      entity_name: worker?.name || worker?.full_name || sent.recipient,
      details: { phone: sent.recipient, mode, template_name: mode === "template" ? templateName : null, provider_message_id: providerMessageId }
    });

    res.json({ success: true, message: "تم إرسال رسالة واتساب تلقائيًا", provider_message_id: providerMessageId, to: sent.recipient, mode });
  } catch (e) {
    const normalizedPhone = normalizeWhatsAppRecipient(rawPhone || worker?.whatsapp || worker?.whatsapp_number || worker?.phone || worker?.mobile || "");
    await insertWhatsAppLog({
      worker_id: workerId || null,
      worker_name: worker?.name || worker?.full_name || null,
      phone: normalizedPhone || rawPhone || null,
      message_type: String(req.body.message_type || req.body.messageType || "admin_message"),
      message_text: mode === "template" ? `[template:${templateName}]` : message,
      send_mode: mode,
      template_name: mode === "template" ? templateName : null,
      status: "failed",
      provider_response: e.provider_response || {},
      error_message: e.message,
      sent_by: req.admin?.display_name || req.admin?.username || "الإدارة"
    });
    res.status(e.status_code || 500).json({ success: false, error: e.message || "فشل إرسال رسالة واتساب", provider_response: e.provider_response || null });
  }
});

app.post("/api/admin/whatsapp/send-bulk", requirePermission("whatsapp:send"), async (req, res) => {
  if (!ready(res)) return;
  const rawItems = Array.isArray(req.body.items) ? req.body.items : [];
  const mode = String(req.body.mode || "text").toLowerCase() === "template" ? "template" : "text";
  const templateName = String(req.body.template_name || req.body.templateName || WHATSAPP_DEFAULT_TEMPLATE || "hello_world").trim();
  const languageCode = String(req.body.language_code || req.body.languageCode || WHATSAPP_DEFAULT_LANGUAGE || "en_US").trim();
  const messageType = String(req.body.message_type || req.body.messageType || "bulk_admin_message").trim().slice(0, 80);
  const bulkLabel = String(req.body.bulk_label || req.body.bulkLabel || "إرسال جماعي").trim().slice(0, 120);
  const bulkGroupId = crypto.randomUUID ? crypto.randomUUID() : crypto.randomBytes(16).toString("hex");

  if (!rawItems.length) return res.status(400).json({ success:false, error:"لا توجد أرقام صالحة للإرسال الجماعي" });
  if (rawItems.length > 100) return res.status(400).json({ success:false, error:"الحد الأقصى للإرسال الجماعي في العملية الواحدة هو 100 صنايعي" });

  const results = [];
  let sentCount = 0;
  let failedCount = 0;

  for (const item of rawItems) {
    const workerId = String(item.worker_id || item.workerId || "").trim();
    const rawPhone = String(item.phone || "").trim();
    const message = String(item.message || item.text || req.body.message || "").trim();
    let worker = null;
    try {
      if (workerId) {
        const { data } = await supabase.from("workers").select("id,name,full_name,phone,whatsapp,whatsapp_number").eq("id", workerId).single();
        worker = data || null;
      }
      const phone = rawPhone || worker?.whatsapp || worker?.whatsapp_number || worker?.phone || "";
      if (!phone) throw new Error("لا يوجد رقم واتساب صالح");
      const sent = await sendWhatsAppCloudMessage({
        to: phone,
        message,
        mode,
        template_name: templateName,
        language_code: languageCode
      });
      const providerMessageId = sent.response?.messages?.[0]?.id || null;
      sentCount += 1;
      await insertWhatsAppLog({
        worker_id: workerId || null,
        worker_name: item.worker_name || item.workerName || worker?.name || worker?.full_name || null,
        phone: sent.recipient,
        message_type: messageType,
        message_text: mode === "template" ? `[template:${templateName}]` : message,
        send_mode: mode,
        template_name: mode === "template" ? templateName : null,
        status: "sent",
        provider_message_id: providerMessageId,
        provider_response: sent.response,
        sent_by: req.admin?.display_name || req.admin?.username || "الإدارة",
        bulk_group_id: bulkGroupId,
        bulk_label: bulkLabel
      });
      results.push({ worker_id: workerId || null, phone: sent.recipient, success:true, provider_message_id: providerMessageId });
    } catch (e) {
      failedCount += 1;
      const normalizedPhone = normalizeWhatsAppRecipient(rawPhone || worker?.whatsapp || worker?.whatsapp_number || worker?.phone || "");
      await insertWhatsAppLog({
        worker_id: workerId || null,
        worker_name: item.worker_name || item.workerName || worker?.name || worker?.full_name || null,
        phone: normalizedPhone || rawPhone || "unknown",
        message_type: messageType,
        message_text: mode === "template" ? `[template:${templateName}]` : message,
        send_mode: mode,
        template_name: mode === "template" ? templateName : null,
        status: "failed",
        provider_response: e.provider_response || {},
        error_message: e.message,
        sent_by: req.admin?.display_name || req.admin?.username || "الإدارة",
        bulk_group_id: bulkGroupId,
        bulk_label: bulkLabel
      });
      results.push({ worker_id: workerId || null, phone: normalizedPhone || rawPhone || null, success:false, error:e.message || "فشل الإرسال" });
    }
    await new Promise(resolve => setTimeout(resolve, 120));
  }

  await logAdminActivity("whatsapp_bulk_send", {
    entity_type: "whatsapp",
    entity_id: bulkGroupId,
    entity_name: bulkLabel,
    details: { mode, template_name: mode === "template" ? templateName : null, total: rawItems.length, sent: sentCount, failed: failedCount }
  });

  res.json({ success:true, message:"انتهى الإرسال الجماعي", bulk_group_id: bulkGroupId, total: rawItems.length, sent: sentCount, failed: failedCount, results });
});

// ===============================
// Worker Reports & Complaints
// ===============================
const REPORT_TYPES = {
  wrong_phone: "رقم غير صحيح",
  wrong_data: "بيانات خاطئة",
  bad_service: "سوء خدمة",
  inappropriate_photos: "صور غير مناسبة",
  other: "أخرى"
};
const REPORT_STATUSES = {
  new: "جديد",
  reviewing: "قيد المراجعة",
  resolved: "تم الحل",
  rejected: "مرفوض"
};

function reportSafeText(value, max = 500) {
  return String(value || "").trim().slice(0, max);
}
function normalizeArabicDigits(value) {
  return String(value || "")
    .replace(/[٠-٩]/g, d => "٠١٢٣٤٥٦٧٨٩".indexOf(d))
    .replace(/[۰-۹]/g, d => "۰۱۲۳۴۵۶۷۸۹".indexOf(d));
}
function normalizeReporterPhone(value) {
  return normalizeArabicDigits(value).replace(/[^0-9]/g, "").slice(0, 15);
}
function isValidReporterPhone(value) {
  const digits = normalizeReporterPhone(value);
  return digits.length >= 8 && digits.length <= 15;
}
function normalizeReportType(value) {
  const key = reportSafeText(value, 60);
  return REPORT_TYPES[key] ? key : "other";
}
function normalizeReportStatus(value) {
  const key = reportSafeText(value, 60);
  return REPORT_STATUSES[key] ? key : "new";
}
function reportLabel(map, key) {
  return map[key] || key || "غير محدد";
}
async function attachWorkersToReports(reports) {
  const rows = Array.isArray(reports) ? reports : [];
  const ids = Array.from(new Set(rows.map(r => String(r.worker_id || "").trim()).filter(Boolean)));
  const byId = {};
  if (ids.length) {
    try {
      const { data } = await supabase.from("workers").select("id,name,trade,area,phone,whatsapp,active,approved").in("id", ids);
      (data || []).forEach(w => { byId[String(w.id)] = w; });
    } catch (e) {}
  }
  return rows.map(r => ({
    ...r,
    type_label: reportLabel(REPORT_TYPES, r.report_type),
    status_label: reportLabel(REPORT_STATUSES, r.status),
    worker: byId[String(r.worker_id || "")] || null
  }));
}

app.post("/api/reports", reportsRateLimit, async (req, res) => {
  if (!ready(res)) return;
  try {
    const workerId = reportSafeText(req.body?.worker_id || req.body?.workerId, 80);
    const reportType = normalizeReportType(req.body?.report_type || req.body?.type);
    const reporterName = reportSafeText(req.body?.reporter_name || req.body?.name, 120);
    const reporterPhone = normalizeReporterPhone(req.body?.reporter_phone || req.body?.phone);
    const message = reportSafeText(req.body?.message || req.body?.details, 1200);

    if (!workerId) return res.status(400).json({ success:false, error:"بيانات الصنايعي غير مكتملة" });
    if (!isValidReporterPhone(req.body?.reporter_phone || req.body?.phone)) {
      return res.status(400).json({ success:false, error:"رقم تليفون صاحب البلاغ مطلوب ويجب أن يكون صحيحًا" });
    }
    if (!message || message.length < 5) return res.status(400).json({ success:false, error:"اكتب تفاصيل البلاغ باختصار" });

    const { data: workerRow } = await supabase.from("workers").select("id,name,trade,area,phone,whatsapp").eq("id", workerId).single();
    if (!workerRow) return res.status(404).json({ success:false, error:"الصنايعي غير موجود" });

    const row = {
      worker_id: String(workerRow.id),
      report_type: reportType,
      reporter_name: reporterName,
      reporter_phone: reporterPhone,
      message,
      status: "new",
      page_path: reportSafeText(req.body?.page_path || req.headers.referer || "", 500),
      user_agent: reportSafeText(req.headers["user-agent"], 500),
      ip_hash: analyticsIpHash(req),
      worker_snapshot: {
        id: workerRow.id,
        name: workerRow.name || "",
        trade: workerRow.trade || "",
        area: workerRow.area || "",
        phone: workerRow.phone || "",
        whatsapp: workerRow.whatsapp || ""
      }
    };

    const { data, error } = await supabase.from("worker_reports").insert(row).select("id,status,created_at").single();
    if (error) return res.status(500).json({ success:false, error:"جدول البلاغات غير جاهز. شغّل ملف SQL الخاص بالبلاغات أولًا." });
    return res.json({ success:true, report:data });
  } catch (e) {
    return res.status(500).json({ success:false, error:e.message || "تعذر إرسال البلاغ" });
  }
});

app.get("/api/admin/reports", requirePermission("reports:read"), async (req, res) => {
  if (!ready(res)) return;
  try {
    const status = reportSafeText(req.query.status || "", 40);
    let query = supabase.from("worker_reports").select("*").order("created_at", { ascending:false }).limit(500);
    if (status && status !== "all" && REPORT_STATUSES[status]) query = query.eq("status", status);
    const { data, error } = await query;
    if (error) return res.status(500).json({ success:false, error:"جدول worker_reports غير موجود. شغّل SQL البلاغات أولًا." });
    const items = await attachWorkersToReports(data || []);
    const stats = { total: items.length, new:0, reviewing:0, resolved:0, rejected:0 };
    items.forEach(r => { if (stats[r.status] !== undefined) stats[r.status] += 1; });
    return res.json({ success:true, items, stats, types:REPORT_TYPES, statuses:REPORT_STATUSES });
  } catch (e) {
    return res.status(500).json({ success:false, error:e.message || "تعذر تحميل البلاغات" });
  }
});

app.put("/api/admin/reports/:id", requirePermission("reports:manage"), async (req, res) => {
  if (!ready(res)) return;
  try {
    const reportId = reportSafeText(req.params.id, 120);
    const status = normalizeReportStatus(req.body?.status || "reviewing");
    const adminNote = reportSafeText(req.body?.admin_note || req.body?.note, 1200);

    const { data: before } = await supabase.from("worker_reports").select("*").eq("id", reportId).single();
    if (!before) return res.status(404).json({ success:false, error:"البلاغ غير موجود" });

    const update = { status, admin_note: adminNote, updated_at: new Date().toISOString() };
    if (status === "resolved" || status === "rejected") update.resolved_at = new Date().toISOString();
    else update.resolved_at = null;

    const { data, error } = await supabase.from("worker_reports").update(update).eq("id", reportId).select("*").single();
    if (error) return res.status(500).json({ success:false, error:"تعذر تحديث البلاغ" });

    await logAdminActivity("worker_report_status_update", {
      entity_type:"worker_report",
      entity_name: before.worker_snapshot?.name || before.worker_name || `بلاغ ${reportId}`,
      before_data: { status: before.status, admin_note: before.admin_note || "" },
      after_data: { status: data.status, admin_note: data.admin_note || "" },
      details: { report_id: reportId, worker_id: before.worker_id, report_type: before.report_type }
    });

    const [item] = await attachWorkersToReports([data]);
    return res.json({ success:true, report:item });
  } catch (e) {
    return res.status(500).json({ success:false, error:e.message || "تعذر تحديث البلاغ" });
  }
});

app.delete("/api/admin/reports/:id", requirePermission("reports:manage"), async (req, res) => {
  if (!ready(res)) return;
  try {
    const reportId = reportSafeText(req.params.id, 120);
    const { data: before } = await supabase.from("worker_reports").select("*").eq("id", reportId).single();
    const { error } = await supabase.from("worker_reports").delete().eq("id", reportId);
    if (error) return res.status(500).json({ success:false, error:"تعذر حذف البلاغ" });
    await logAdminActivity("worker_report_delete", {
      entity_type:"worker_report",
      entity_name: before?.worker_snapshot?.name || `بلاغ ${reportId}`,
      before_data: before || {},
      details: { report_id: reportId, worker_id: before?.worker_id }
    });
    return res.json({ success:true });
  } catch (e) {
    return res.status(500).json({ success:false, error:e.message || "تعذر حذف البلاغ" });
  }
});

// ===============================
// Analytics Patch - Contact Tracking
// ===============================
function analyticsSafeString(v, max = 500) {
  return String(v || "").trim().slice(0, max);
}

function analyticsIpHash(req) {
  try {
    const rawIp = String(req.headers["x-forwarded-for"] || req.socket?.remoteAddress || "")
      .split(",")[0]
      .trim();
    const salt = process.env.ADMIN_SESSION_SECRET || process.env.SUPABASE_SERVICE_ROLE_KEY || "sanay3i";
    return crypto.createHash("sha256").update(rawIp + "|" + salt).digest("hex").slice(0, 64);
  } catch (e) {
    return "";
  }
}

app.post("/api/analytics/track", analyticsRateLimit, async (req, res) => {
  try {
    const body = req.body || {};
    const eventType = analyticsSafeString(body.event_type || body.type, 40);
    const allowed = new Set(["profile_view", "call", "whatsapp", "share", "filter_trade", "filter_area", "search"]);

    if (!allowed.has(eventType)) {
      return res.status(400).json({ success: false, error: "Invalid analytics event type" });
    }

    const row = {
      worker_id: analyticsSafeString(body.worker_id || body.workerId, 80),
      event_type: eventType,
      source: analyticsSafeString(body.source, 160),
      page_path: analyticsSafeString(body.page_path || body.page || req.headers.referer || "", 500),
      user_agent: analyticsSafeString(req.headers["user-agent"], 500),
      ip_hash: analyticsIpHash(req)
    };

    const { error } = await supabase.from("analytics_events").insert(row);

    // Do not break the public user journey if analytics table is not created yet.
    if (error) {
      console.warn("Analytics tracking skipped:", error.message);
      return res.json({ success: true, tracked: false, setup_required: true });
    }

    return res.json({ success: true, tracked: true });
  } catch (e) {
    return res.json({ success: true, tracked: false });
  }
});

function analyticsDateKey(value) {
  try {
    const d = new Date(value);
    if (Number.isNaN(d.getTime())) return "";
    return d.toISOString().slice(0, 10);
  } catch (e) {
    return "";
  }
}

function analyticsSourceValue(source, prefix) {
  const s = String(source || "").trim();
  const p = String(prefix || "") + ":";
  if (!s.startsWith(p)) return "";
  return s.slice(p.length).trim().slice(0, 80);
}

function analyticsEmptyAgg(label) {
  return {
    name: label,
    profile_view: 0,
    call: 0,
    whatsapp: 0,
    share: 0,
    filter_trade: 0,
    filter_area: 0,
    search: 0,
    total_contacts: 0,
    total_events: 0
  };
}

function analyticsIncAgg(map, key, type) {
  const cleanKey = String(key || "").trim() || "غير محدد";
  if (!map[cleanKey]) map[cleanKey] = analyticsEmptyAgg(cleanKey);
  map[cleanKey].total_events += 1;
  if (map[cleanKey][type] !== undefined) map[cleanKey][type] += 1;
  if (type === "call" || type === "whatsapp") map[cleanKey].total_contacts += 1;
}

async function analyticsFetchWorkersByIds(ids) {
  if (!ids.length) return [];
  const fields = "id,name,trade,area,phone,whatsapp,featured,approved,active,subscription_end,identity_verified,created_at";
  let { data, error } = await supabase.from("workers").select(fields).in("id", ids);
  if (error) {
    const fallbackFields = "id,name,trade,area,phone,whatsapp,featured,approved,active,subscription_end,created_at";
    const fallback = await supabase.from("workers").select(fallbackFields).in("id", ids);
    data = fallback.data || [];
    error = fallback.error;
  }
  if (error) return [];
  return data || [];
}

async function analyticsFetchAllWorkersLite() {
  let { data, error } = await supabase.from("workers").select("id,trade,area,approved,active").limit(10000);
  if (error) return [];
  return data || [];
}

async function analyticsFetchNameList(tableName, fallbackRows, fallbackKey) {
  try {
    const { data, error } = await supabase.from(tableName).select("name").limit(1000);
    if (!error && Array.isArray(data) && data.length) {
      return Array.from(new Set(data.map(x => String(x.name || "").trim()).filter(Boolean)));
    }
  } catch (e) {}
  return Array.from(new Set((fallbackRows || []).map(x => String(x[fallbackKey] || "").trim()).filter(Boolean)));
}

function analyticsWorkerIdFromPagePath(pagePath) {
  const raw = String(pagePath || "").trim();
  if (!raw) return "";

  try {
    const parsed = raw.startsWith("http://") || raw.startsWith("https://")
      ? new URL(raw)
      : new URL(raw, "https://sanay3i.local");

    const queryId = parsed.searchParams.get("id") || parsed.searchParams.get("worker_id") || parsed.searchParams.get("workerId");
    if (queryId) return String(queryId).trim();

    const path = String(parsed.pathname || "").replace(/\/+$/, "");
    const match = path.match(/\/worker\/([^\/?#]+)/i);
    return match ? decodeURIComponent(match[1]).trim() : "";
  } catch (e) {
    const clean = raw.split("?")[0].replace(/\/+$/, "");
    const match = clean.match(/\/worker\/([^\/?#]+)/i);
    return match ? decodeURIComponent(match[1]).trim() : "";
  }
}

function analyticsWorkerPageTitle(worker, pagePath) {
  if (!worker) return pagePath || "غير محدد";
  const parts = [worker.name, worker.trade, worker.area].map(x => String(x || "").trim()).filter(Boolean);
  return parts.length ? parts.join(" - ") : (pagePath || "غير محدد");
}

app.get("/api/admin/analytics", requirePermission("analytics:read"), async (req, res) => {
  if (!ready(res)) return;
  try {
    const daysRaw = Number(req.query.days || req.query.range || 30);
    const days = Math.max(1, Math.min(365, Number.isFinite(daysRaw) ? daysRaw : 30));
    const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString();

    const { data: events, error } = await supabase
      .from("analytics_events")
      .select("worker_id,event_type,source,page_path,created_at")
      .gte("created_at", since)
      .order("created_at", { ascending: false })
      .limit(50000);

    if (error) {
      return res.status(500).json({
        success: false,
        setup_required: true,
        error: "جدول التحليلات غير موجود أو يحتاج تشغيل ملف SUPABASE-ANALYTICS-PATCH.sql"
      });
    }

    const totals = {
      profile_view: 0,
      call: 0,
      whatsapp: 0,
      share: 0,
      filter_trade: 0,
      filter_area: 0,
      search: 0,
      total_contacts: 0,
      total_events: events.length,
      conversion_rate: 0
    };

    const byWorker = {};
    const bySource = {};
    const byPage = {};
    const byDay = {};
    const filterTrades = {};
    const filterAreas = {};

    const dailyWindow = Math.min(days, 31);
    for (let i = dailyWindow - 1; i >= 0; i--) {
      const d = new Date(Date.now() - i * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
      byDay[d] = { date: d, profile_view: 0, call: 0, whatsapp: 0, share: 0, total_contacts: 0, total_events: 0 };
    }

    for (const ev of events || []) {
      const type = String(ev.event_type || "");
      if (totals[type] !== undefined) totals[type] += 1;
      if (type === "call" || type === "whatsapp") totals.total_contacts += 1;

      const source = ev.source || "unknown";
      bySource[source] = (bySource[source] || 0) + 1;

      const page = String(ev.page_path || "").split("?")[0] || "unknown";
      byPage[page] = (byPage[page] || 0) + 1;

      const dk = analyticsDateKey(ev.created_at);
      if (dk && byDay[dk]) {
        byDay[dk].total_events += 1;
        if (byDay[dk][type] !== undefined) byDay[dk][type] += 1;
        if (type === "call" || type === "whatsapp") byDay[dk].total_contacts += 1;
      }

      if (type === "filter_trade") {
        const tradeName = analyticsSourceValue(source, "trade");
        if (tradeName) analyticsIncAgg(filterTrades, tradeName, type);
      }

      if (type === "filter_area") {
        const areaName = analyticsSourceValue(source, "area");
        if (areaName) analyticsIncAgg(filterAreas, areaName, type);
      }

      const wid = String(ev.worker_id || "").trim();
      if (wid) {
        if (!byWorker[wid]) {
          byWorker[wid] = { worker_id: wid, profile_view: 0, call: 0, whatsapp: 0, share: 0, total_contacts: 0, total_events: 0 };
        }
        byWorker[wid].total_events += 1;
        if (byWorker[wid][type] !== undefined) byWorker[wid][type] += 1;
        if (type === "call" || type === "whatsapp") byWorker[wid].total_contacts += 1;
      }
    }

    totals.conversion_rate = totals.profile_view ? Math.round((totals.total_contacts / totals.profile_view) * 1000) / 10 : 0;

    const pageWorkerIds = Object.keys(byPage)
      .map(pagePath => analyticsWorkerIdFromPagePath(pagePath))
      .filter(Boolean);
    const ids = Array.from(new Set([...Object.keys(byWorker), ...pageWorkerIds])).slice(0, 500);
    const workers = await analyticsFetchWorkersByIds(ids);
    const workersMap = {};
    (workers || []).forEach(w => { workersMap[String(w.id)] = w; });

    const byTrade = {};
    const byArea = {};
    for (const ev of events || []) {
      const wid = String(ev.worker_id || "").trim();
      if (!wid || !workersMap[wid]) continue;
      const type = String(ev.event_type || "");
      const worker = workersMap[wid];
      analyticsIncAgg(byTrade, worker.trade || "غير محدد", type);
      analyticsIncAgg(byArea, worker.area || "غير محدد", type);
    }

    const top_workers = Object.values(byWorker)
      .map(row => ({ ...row, worker: workersMap[String(row.worker_id)] || null }))
      .sort((a, b) => (b.total_contacts - a.total_contacts) || (b.total_events - a.total_events))
      .slice(0, 30);

    const sortAgg = rows => Object.values(rows)
      .sort((a, b) => (b.total_contacts - a.total_contacts) || (b.total_events - a.total_events) || String(a.name).localeCompare(String(b.name), "ar"));

    const source_breakdown = Object.entries(bySource)
      .map(([source, count]) => ({ source, count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 30);

    const top_pages = Object.entries(byPage)
      .map(([page_path, count]) => {
        const page_worker_id = analyticsWorkerIdFromPagePath(page_path);
        const pageWorker = page_worker_id ? workersMap[String(page_worker_id)] : null;
        return {
          page_path,
          count,
          worker_id: page_worker_id || null,
          worker: pageWorker || null,
          name: analyticsWorkerPageTitle(pageWorker, page_path)
        };
      })
      .sort((a, b) => b.count - a.count)
      .slice(0, 20);

    const daily = Object.values(byDay);

    const allWorkersLite = await analyticsFetchAllWorkersLite();
    const tradesList = await analyticsFetchNameList("trades", allWorkersLite, "trade");
    const areasList = await analyticsFetchNameList("areas", allWorkersLite, "area");

    const supply = {};
    for (const w of allWorkersLite || []) {
      const trade = String(w.trade || "").trim();
      const area = String(w.area || "").trim();
      if (!trade || !area) continue;
      const key = trade + "||" + area;
      supply[key] = (supply[key] || 0) + 1;
    }

    const demandedTrades = Array.from(new Set([
      ...Object.keys(filterTrades),
      ...sortAgg(byTrade).map(x => x.name),
      ...tradesList
    ].filter(Boolean))).slice(0, 20);

    const demandedAreas = Array.from(new Set([
      ...Object.keys(filterAreas),
      ...sortAgg(byArea).map(x => x.name),
      ...areasList
    ].filter(Boolean))).slice(0, 20);

    const missing_trade_area = [];
    for (const area of demandedAreas) {
      for (const trade of demandedTrades) {
        const count = supply[trade + "||" + area] || 0;
        if (count === 0) {
          missing_trade_area.push({ trade, area, worker_count: 0 });
          if (missing_trade_area.length >= 40) break;
        }
      }
      if (missing_trade_area.length >= 40) break;
    }

    return res.json({
      success: true,
      days,
      totals,
      top_workers,
      top_trades: sortAgg(byTrade).slice(0, 20),
      top_areas: sortAgg(byArea).slice(0, 20),
      filter_trades: sortAgg(filterTrades).slice(0, 20),
      filter_areas: sortAgg(filterAreas).slice(0, 20),
      source_breakdown,
      top_pages,
      daily,
      missing_trade_area,
      generated_at: new Date().toISOString()
    });
  } catch (e) {
    return res.status(500).json({ success: false, error: e.message || "Analytics error" });
  }
});

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
  return next(err);
});

app.use((req,res,next)=>{ if(req.path.startsWith("/api")) return res.status(404).json({success:false,error:"API route not found"}); next(); });

module.exports = app;


// ===============================
// 🚀 PERFORMANCE PATCH - FAST STATS + CACHE
// ===============================

let __statsCache = null;
let __statsTime = 0;
const CACHE_MS = 60 * 1000;

// Fast stats endpoint (optimized)
app.get("/api/stats", async (req, res) => {
  try {
    const now = Date.now();
    if (__statsCache && now - __statsTime < CACHE_MS) {
      return res.json(__statsCache);
    }

    const { data, error } = await supabase
      .from("workers")
      .select("id,status");

    if (error) throw error;

    const stats = {
      total: data.length,
      pending: data.filter(x => x.status === "pending").length,
      approved: data.filter(x => x.status === "approved").length
    };

    __statsCache = stats;
    __statsTime = now;

    res.json(stats);
  } catch (e) {
    res.json({ total: 0, pending: 0, approved: 0 });
  }
});

// Ultra fast admin dashboard (single request)
app.get("/api/admin/dashboard-fast", async (req, res) => {
  try {
    const { data } = await supabase
      .from("workers")
      .select("id,name,trade,area,status,created_at")
      .order("created_at", { ascending: false })
      .limit(20);

    const stats = {
      total: data.length,
      pending: data.filter(x => x.status === "pending").length,
      approved: data.filter(x => x.status === "approved").length
    };

    res.json({
      stats,
      workers: data
    });

  } catch (e) {
    res.json({ stats: {}, workers: [] });
  }
});



// ===============================
// 🚀 ULTRA FAST PERFORMANCE PATCH
// ===============================

// Compression (safe optional)
try {
  const compression = require("compression");
  app.use(compression());
} catch (e) {
  console.log("compression not installed");
}

// In-memory cache
const CACHE = new Map();

function setCache(key, data, ttl = 30000) {
  CACHE.set(key, {
    data,
    expire: Date.now() + ttl
  });
}

function getCache(key) {
  const item = CACHE.get(key);
  if (!item) return null;
  if (Date.now() > item.expire) {
    CACHE.delete(key);
    return null;
  }
  return item.data;
}


// FAST STATS ENDPOINT (FIXED)
app.get("/api/stats-fast", async (req, res) => {
  const cached = getCache("stats");
  if (cached) return res.json(cached);

  try {
    const { data } = await supabase.from("workers").select("id,status");

    const stats = {
      total: data?.length || 0,
      pending: data?.filter(x => x.status === "pending").length || 0,
      approved: data?.filter(x => x.status === "approved").length || 0
    };

    setCache("stats", stats, 30000);
    return res.json(stats);
  } catch (e) {
    return res.json({ total: 0, pending: 0, approved: 0 });
  }
});
// ===============================
// DASHBOARD ULTRA (CACHE + LIMIT ONLY)
// ===============================
app.get("/api/admin/dashboard-ultra", async (req,res)=>{
  const cached = getCache("dash_ultra");
  if(cached) return res.json(cached);

  try{
    const { data } = await supabase
      .from("workers")
      .select("id,name,trade,area,status,image")
      .order("created_at",{ascending:false})
      .limit(20);

    const payload = { workers: data || [] };

    setCache("dash_ultra",payload,60000);
    res.json(payload);

  }catch(e){
    res.json({workers:[]});
  }
});



// ===============================
// ⚡ REALTIME LAYER (WEBSOCKET)
// ===============================
const http = require("http");
let WebSocket = null;
try { WebSocket = require("ws"); } catch(e) { WebSocket = null; }

const server = http.createServer(app);
const wss = WebSocket ? new WebSocket.Server({ server }) : null;

// store last stats in memory
let LIVE_STATS = { total:0, pending:0, approved:0 };

function broadcast(type, data) {
  const msg = JSON.stringify({ type, data });

  if (!wss) return;
  wss.clients.forEach(client => {
    if (client.readyState === 1) {
      client.send(msg);
    }
  });
}

// realtime update trigger helper
async function refreshLiveStats() {
  try {
    const { data } = await supabase.from("workers").select("id,status");

    LIVE_STATS = {
      total: data?.length || 0,
      pending: data?.filter(x => x.status === "pending").length || 0,
      approved: data?.filter(x => x.status === "approved").length || 0
    };

    broadcast("stats", LIVE_STATS);
  } catch (e) {}
}

// websocket connection
if (wss) wss.on("connection", (ws) => {
  ws.send(JSON.stringify({ type:"init", data: LIVE_STATS }));
});

// ===============================
// OVERRIDE EXISTING RESPONSE FLOW (HOOKS)
// ===============================

// NOTE: call refreshLiveStats() after any create/update/delete worker operation



// ===============================
// Stable Fast Stats Endpoint
// ===============================
app.get("/api/stats-stable", async (req,res)=>{
  const cached = typeof getCache === "function" ? getCache("stats_stable") : null;
  if(cached) return res.json(cached);

  try{
    const [totalRes, pendingRes, approvedRes] = await Promise.all([
      supabase.from("workers").select("*",{count:"exact",head:true}),
      supabase.from("workers").select("*",{count:"exact",head:true}).eq("approved",false),
      supabase.from("workers").select("*",{count:"exact",head:true}).eq("approved",true),
    ]);

    const stats = {
      total: totalRes.count || 0,
      pending: pendingRes.count || 0,
      approved: approvedRes.count || 0
    };

    if(typeof setCache === "function") setCache("stats_stable",stats,30000);
    return res.json(stats);
  }catch(e){
    return res.status(500).json({success:false,error:e.message,total:0,pending:0,approved:0});
  }
});
