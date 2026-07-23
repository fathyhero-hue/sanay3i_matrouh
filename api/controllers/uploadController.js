const multer = require("multer");
const path = require("path");
const crypto = require("crypto");
const { supabase, SUPABASE_BUCKET, SUPABASE_ID_BUCKET } = require("../config/supabase");

const ALLOWED_IMAGE_MIME_TYPES = new Set(["image/jpeg", "image/png", "image/webp"]);
const ALLOWED_IMAGE_EXTENSIONS = new Set([".jpg", ".jpeg", ".png", ".webp"]);

// دالة أمان: تتأكد من أن الملف المرفوع هو صورة حقيقية بناءً على الامتداد والنوع
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

// إعدادات مكتبة Multer لرفع الملفات
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { 
    fileSize: 6 * 1024 * 1024, // الحد الأقصى 6 ميجا للصورة
    files: 8,                  // الحد الأقصى 8 ملفات في الطلب الواحد
    fields: 80, 
    fieldSize: 512 * 1024 
  },
  fileFilter: secureImageFileFilter
});

// إعدادات حقول الصور الخاصة بتسجيل الصنايعي
const workerUpload = upload.fields([
  { name: "image", maxCount: 1 }, 
  { name: "workPhotos", maxCount: 5 }, 
  { name: "idFront", maxCount: 1 }, 
  { name: "idBack", maxCount: 1 }
]);

// إعدادات حقول الصور الخاصة بمحادثات الدعم
const chatUpload = upload.fields([
  { name: "attachment", maxCount: 1 }
]);

// دالة لاستخراج الامتداد الصحيح للصورة
function ext(file) {
  const e = path.extname(file.originalname || "");
  if (e) return e.toLowerCase();
  if (file.mimetype === "image/png") return ".png";
  if (file.mimetype === "image/webp") return ".webp";
  return ".jpg";
}

// دالة أمان متقدمة: تفحص البيانات الداخلية للملف للتأكد من خلوه من الأكواد الخبيثة
function assertValidImageBuffer(file) {
  if (!file || !file.buffer) return;
  const b = file.buffer;
  const mime = String(file.mimetype || "").toLowerCase();
  const jpg = b.length > 3 && b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff;
  const png = b.length > 8 && b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4e && b[3] === 0x47;
  const webp = b.length > 12 && b.slice(0, 4).toString("ascii") === "RIFF" && b.slice(8, 12).toString("ascii") === "WEBP";
  
  if ((mime === "image/jpeg" && !jpg) || (mime === "image/png" && !png) || (mime === "image/webp" && !webp)) {
    throw new Error("ملف الصورة غير صالح أو امتداده لا يطابق محتواه");
  }
}

function safeStorageFolder(folder) {
  const f = String(folder || "uploads").replace(/[^a-zA-Z0-9_-]/g, "").slice(0, 40);
  return f || "uploads";
}

// رفع الصور العامة (مثل صورة البروفايل وصور الأعمال)
async function uploadImage(file, folder) {
  if (!file) return "";
  assertValidImageBuffer(file);
  const name = `${safeStorageFolder(folder)}/${Date.now()}-${crypto.randomBytes(8).toString("hex")}${ext(file)}`;
  
  const { error } = await supabase.storage
    .from(SUPABASE_BUCKET)
    .upload(name, file.buffer, { contentType: file.mimetype || "image/jpeg", upsert: false });
  
  if (error) throw error;
  
  // إرجاع الرابط العام للصورة
  return supabase.storage.from(SUPABASE_BUCKET).getPublicUrl(name).data.publicUrl;
}

// رفع الصور الخاصة (مثل البطاقة الشخصية للإدارة فقط)
async function uploadPrivateImage(file, folder) {
  if (!file) return "";
  assertValidImageBuffer(file);
  const name = `${safeStorageFolder(folder)}/${Date.now()}-${crypto.randomBytes(8).toString("hex")}${ext(file)}`;
  
  const { error } = await supabase.storage
    .from(SUPABASE_ID_BUCKET)
    .upload(name, file.buffer, { contentType: file.mimetype || "image/jpeg", upsert: false });
  
  if (error) throw error;
  
  // إرجاع اسم الملف فقط (الرابط محمي ولن يعمل إلا بصلاحيات الإدارة)
  return name;
}

// دوال مساعدة لاستخراج الملفات من الطلب
function mainFile(req) { return req.files?.image?.[0] || null; }
function workFiles(req) { return req.files?.workPhotos || []; }
function idFrontFile(req) { return req.files?.idFront?.[0] || null; }
function idBackFile(req) { return req.files?.idBack?.[0] || null; }
function chatAttachmentFile(req) { return req.files?.attachment?.[0] || null; }

module.exports = {
  workerUpload,
  chatUpload,
  uploadImage,
  uploadPrivateImage,
  mainFile,
  workFiles,
  idFrontFile,
  idBackFile,
  chatAttachmentFile
};