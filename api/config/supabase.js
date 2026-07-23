const { createClient } = require("@supabase/supabase-js");
try { require("dotenv").config(); } catch(e) {}

// سحب بيانات الربط من ملف البيئة (.env)
const SUPABASE_URL = process.env.SUPABASE_URL || "";
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || "";
const SUPABASE_BUCKET = process.env.SUPABASE_BUCKET || "uploads";
const SUPABASE_ID_BUCKET = process.env.SUPABASE_ID_BUCKET || "identity-docs";

// إنشاء العميل الذي يتصل بقاعدة البيانات
const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

// دالة لفحص جاهزية الاتصال بقاعدة البيانات
function isSupabaseReady(res) {
  if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
    if (res) {
      res.status(500).json({ success: false, error: "متغيرات بيئة Supabase غير مكتملة" });
    }
    return false;
  }
  return true;
}

// تصدير المتغيرات والدوال عشان نستخدمها في باقي المشروع
module.exports = {
  supabase,
  SUPABASE_URL,
  SUPABASE_SERVICE_ROLE_KEY,
  SUPABASE_BUCKET,
  SUPABASE_ID_BUCKET,
  isSupabaseReady
};