const express = require("express");
const router = express.Router();
const { supabase, isSupabaseReady } = require("../config/supabase");
const { customerRegisterRateLimit, customerLoginRateLimit } = require("../middlewares/rateLimit");
const {
  hashCustomerPassword,
  verifyCustomerPassword,
  createCustomerToken,
  requireCustomerAuth
} = require("../middlewares/customerAuth");

const PHONE_RE = /^[\d+\s-]{8,20}$/;

function publicCustomer(customer) {
  if (!customer) return null;
  return { id: customer.id, name: customer.name, phone: customer.phone };
}

// 1. تسجيل حساب عميل جديد
async function registerCustomer(req, res) {
  try {
    if (!isSupabaseReady(res)) return;
    const body = req.body || {};
    const name = String(body.name || "").trim();
    const phone = String(body.phone || "").trim();
    const password = String(body.password || "").trim();

    if (!name || name.length > 100) {
      return res.status(400).json({ success: false, error: "الاسم مطلوب" });
    }
    if (!phone || !PHONE_RE.test(phone)) {
      return res.status(400).json({ success: false, error: "رقم الهاتف غير صحيح" });
    }
    if (!password || password.length < 6) {
      return res.status(400).json({ success: false, error: "كلمة المرور يجب ألا تقل عن 6 أحرف" });
    }

    const { data: existing } = await supabase.from("customers").select("id").eq("phone", phone).maybeSingle();
    if (existing) {
      return res.status(409).json({ success: false, error: "رقم الهاتف مسجل بالفعل، يمكنك تسجيل الدخول" });
    }

    const { data: created, error } = await supabase
      .from("customers")
      .insert([{ name, phone, password_hash: hashCustomerPassword(password) }])
      .select("id, name, phone")
      .single();

    if (error) {
      if (error.code === "23505") {
        return res.status(409).json({ success: false, error: "رقم الهاتف مسجل بالفعل، يمكنك تسجيل الدخول" });
      }
      throw error;
    }

    const token = createCustomerToken(created);
    res.json({ success: true, customer: publicCustomer(created), token });
  } catch (err) {
    console.error("Customer Register Error:", err);
    res.status(500).json({ success: false, error: err.message || "تعذر إنشاء الحساب" });
  }
}

// 2. تسجيل دخول عميل
async function loginCustomer(req, res) {
  try {
    if (!isSupabaseReady(res)) return;
    const body = req.body || {};
    const phone = String(body.phone || "").trim();
    const password = String(body.password || "").trim();

    if (!phone || !password) {
      return res.status(400).json({ success: false, error: "يرجى إدخال رقم الهاتف وكلمة المرور" });
    }

    const { data: customer, error } = await supabase.from("customers").select("*").eq("phone", phone).maybeSingle();
    if (error) throw error;

    if (!customer || !verifyCustomerPassword(customer, password)) {
      return res.status(401).json({ success: false, error: "رقم الهاتف أو كلمة المرور غير صحيحة" });
    }

    const token = createCustomerToken(customer);
    res.json({ success: true, customer: publicCustomer(customer), token });
  } catch (err) {
    console.error("Customer Login Error:", err);
    res.status(500).json({ success: false, error: err.message || "تعذر تسجيل الدخول" });
  }
}

// 3. بيانات الحساب الحالي (محمي)
async function getMe(req, res) {
  try {
    if (!isSupabaseReady(res)) return;
    const { data: customer, error } = await supabase
      .from("customers")
      .select("id, name, phone, created_at")
      .eq("id", req.customerId)
      .maybeSingle();

    if (error) throw error;
    if (!customer) return res.status(404).json({ success: false, error: "الحساب غير موجود" });

    res.json({ success: true, customer });
  } catch (err) {
    console.error("Customer Me Error:", err);
    res.status(500).json({ success: false, error: err.message || "تعذر جلب بيانات الحساب" });
  }
}

router.post("/register", customerRegisterRateLimit, registerCustomer);
router.post("/login", customerLoginRateLimit, loginCustomer);
router.get("/me", requireCustomerAuth, getMe);

module.exports = router;
module.exports.publicCustomer = publicCustomer;
module.exports.registerCustomer = registerCustomer;
module.exports.loginCustomer = loginCustomer;
module.exports.getMe = getMe;
