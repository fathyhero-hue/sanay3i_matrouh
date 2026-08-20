const crypto = require("crypto");
const jwt = require("jsonwebtoken");

// سر توقيع توكن العميل - مستقل تمامًا عن ADMIN_SESSION_SECRET المستخدم لتوكنات
// الإدارة والصنايعية في middlewares/auth.js (نظام منفصل بالكامل)
const CUSTOMER_JWT_SECRET = process.env.CUSTOMER_JWT_SECRET || "fallback-customer-secret-change-me-please";
const CUSTOMER_TOKEN_DAYS = 30;

// نفس أسلوب تشفير كلمة المرور المستخدم بالفعل للإدارة والصنايعية في
// api/server.js (PBKDF2-SHA256 بـ 120000 تكرار) عشان نفضل على نفس مستوى
// الأمان من غير ما نضيف مكتبة تشفير جديدة. جدول customers فيه عمود
// password_hash واحد بس (من غير password_salt منفصل)، فبنخزّن الاثنين مع
// بعض جوّاه بصيغة "salt:hash".
const PASSWORD_ITERATIONS = 120000;

function hashCustomerPassword(password, salt = crypto.randomBytes(16).toString("hex")) {
  const hash = crypto.pbkdf2Sync(String(password || ""), salt, PASSWORD_ITERATIONS, 64, "sha256").toString("hex");
  return `${salt}:${hash}`;
}

function verifyCustomerPassword(customer, password) {
  if (!customer || !customer.password_hash) return false;
  const [salt, storedHash] = String(customer.password_hash).split(":");
  if (!salt || !storedHash) return false;
  const computed = hashCustomerPassword(password, salt).split(":")[1];
  const a = Buffer.from(computed);
  const b = Buffer.from(storedHash);
  if (a.length !== b.length) return false;
  return crypto.timingSafeEqual(a, b);
}

function createCustomerToken(customer) {
  return jwt.sign(
    { sub: Number(customer.id), purpose: "customer-session" },
    CUSTOMER_JWT_SECRET,
    { expiresIn: `${CUSTOMER_TOKEN_DAYS}d` }
  );
}

function verifyCustomerToken(token) {
  if (!token) return null;
  try {
    const decoded = jwt.verify(token, CUSTOMER_JWT_SECRET);
    if (decoded.purpose !== "customer-session" || !decoded.sub) return null;
    return Number(decoded.sub);
  } catch (e) {
    return null;
  }
}

function extractCustomerToken(req) {
  const auth = String(req.headers?.authorization || "");
  if (auth.toLowerCase().startsWith("bearer ")) return auth.slice(7).trim();
  return String(req.body?.customer_token || req.query?.customer_token || "").trim();
}

// 🛡️ الحارس الأساسي لأي مسار خاص بعميل مسجّل دخول 🛡️
function requireCustomerAuth(req, res, next) {
  const customerId = verifyCustomerToken(extractCustomerToken(req));
  if (!customerId) {
    return res.status(401).json({ success: false, error: "يجب تسجيل الدخول كعميل أولاً" });
  }
  req.customerId = customerId;
  return next();
}

module.exports = {
  hashCustomerPassword,
  verifyCustomerPassword,
  createCustomerToken,
  verifyCustomerToken,
  extractCustomerToken,
  requireCustomerAuth
};
