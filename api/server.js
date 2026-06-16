
const express = require("express");
const multer = require("multer");
const path = require("path");
const crypto = require("crypto");
const { createClient } = require("@supabase/supabase-js");
try { require("dotenv").config(); } catch(e) {}

const app = express();
app.use(express.json({ limit: "10mb" }));
app.use(express.urlencoded({ extended: true, limit: "10mb" }));

// ===============================
// Static / PWA files for Local + Vercel
// ===============================
const STATIC_DIR = path.join(__dirname, "..");

app.use(express.static(STATIC_DIR));

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
const supabase = (SUPABASE_URL && SUPABASE_SERVICE_ROLE_KEY) ? createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY) : null;


// ===============================
// Admin Auth (server-side only)
// ===============================
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || "";
const ADMIN_SESSION_SECRET = process.env.ADMIN_SESSION_SECRET || "";
const ADMIN_COOKIE_NAME = "sanay3i_admin_token";
const ADMIN_SESSION_DAYS = Number(process.env.ADMIN_SESSION_DAYS || 7);

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

function createAdminToken() {
  const maxAgeMs = ADMIN_SESSION_DAYS * 24 * 60 * 60 * 1000;
  const payload = base64url(JSON.stringify({ role: "admin", exp: Date.now() + maxAgeMs }));
  return `${payload}.${sign(payload)}`;
}

function verifyAdminToken(token) {
  if (!ADMIN_SESSION_SECRET || !token || !token.includes(".")) return false;
  const [payload, signature] = token.split(".");
  const expected = sign(payload);

  try {
    const a = Buffer.from(signature || "");
    const b = Buffer.from(expected || "");
    if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return false;
    const data = JSON.parse(Buffer.from(payload, "base64url").toString("utf8"));
    return data.role === "admin" && Number(data.exp) > Date.now();
  } catch (e) {
    return false;
  }
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

function isAdminRequest(req) {
  return verifyAdminToken(parseCookies(req)[ADMIN_COOKIE_NAME]);
}

function requireAdmin(req, res, next) {
  if (isAdminRequest(req)) return next();
  return res.status(401).json({ success: false, error: "غير مصرح بالدخول للوحة الإدارة" });
}

app.post("/api/admin/login", (req, res) => {
  if (!ADMIN_PASSWORD || !ADMIN_SESSION_SECRET) {
    return res.status(500).json({ success: false, error: "Admin environment variables are missing" });
  }

  const password = req.body ? req.body.password : "";
  if (!safePasswordEqual(password, ADMIN_PASSWORD)) {
    return res.status(401).json({ success: false, error: "كلمة السر غير صحيحة" });
  }

  setAdminCookie(res, createAdminToken());
  return res.json({ success: true });
});

app.post("/api/admin/logout", (req, res) => {
  clearAdminCookie(res);
  return res.json({ success: true });
});

app.get("/api/admin/me", (req, res) => {
  return res.json({ authenticated: isAdminRequest(req) });
});

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 6 * 1024 * 1024 },
  fileFilter: (req, file, cb) => file.mimetype && file.mimetype.startsWith("image/") ? cb(null, true) : cb(new Error("Only images are allowed"))
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
async function uploadImage(file, folder){ if(!file) return ""; const name=`${folder}/${Date.now()}-${Math.round(Math.random()*1e9)}${ext(file)}`; const {error}=await supabase.storage.from(SUPABASE_BUCKET).upload(name,file.buffer,{contentType:file.mimetype||"image/jpeg",upsert:false}); if(error) throw error; return supabase.storage.from(SUPABASE_BUCKET).getPublicUrl(name).data.publicUrl; }
async function uploadPrivateImage(file, folder){ if(!file) return ""; const name=`${folder}/${Date.now()}-${Math.round(Math.random()*1e9)}${ext(file)}`; const {error}=await supabase.storage.from(SUPABASE_ID_BUCKET).upload(name,file.buffer,{contentType:file.mimetype||"image/jpeg",upsert:false}); if(error) throw error; return name; }
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
    area_delete:"حذف منطقة"
  }[action] || action;
}
async function logAdminActivity(action, options={}){
  try{
    if(!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) return;
    const row={
      action:String(action||"admin_action"),
      action_label:activityActionLabel(action),
      entity_type:options.entity_type?String(options.entity_type):null,
      entity_id:options.entity_id!==undefined && options.entity_id!==null && options.entity_id!=="" ? Number(options.entity_id) : null,
      entity_name:options.entity_name?String(options.entity_name):null,
      details:options.details || {},
      admin_name:options.admin_name || "الإدارة"
    };
    const {error}=await supabase.from("admin_activity_log").insert(row);
    if(error) console.warn("Admin activity log skipped:", error.message);
  }catch(e){
    console.warn("Admin activity log skipped:", e.message);
  }
}

// Local page fallback
function sendStaticPage(res, fileName) {
  return res.sendFile(path.join(STATIC_DIR, fileName));
}

app.get("/", (req,res)=>sendStaticPage(res,"index.html"));
app.get("/index.html", (req,res)=>sendStaticPage(res,"index.html"));

app.get("/register", (req,res)=>sendStaticPage(res,"register.html"));
app.get("/register/", (req,res)=>sendStaticPage(res,"register.html"));
app.get("/register.html", (req,res)=>sendStaticPage(res,"register.html"));

app.get("/status", (req,res)=>sendStaticPage(res,"status.html"));
app.get("/status/", (req,res)=>sendStaticPage(res,"status.html"));
app.get("/status.html", (req,res)=>sendStaticPage(res,"status.html"));

app.get("/admin", (req,res)=>sendStaticPage(res,"admin.html"));
app.get("/admin/", (req,res)=>sendStaticPage(res,"admin.html"));
app.get("/admin.html", (req,res)=>sendStaticPage(res,"admin.html"));

app.get("/admin/add-worker", (req,res)=>sendStaticPage(res,"admin-add-worker.html"));
app.get("/admin/add-worker/", (req,res)=>sendStaticPage(res,"admin-add-worker.html"));
app.get("/admin-add-worker", (req,res)=>sendStaticPage(res,"admin-add-worker.html"));
app.get("/admin-add-worker/", (req,res)=>sendStaticPage(res,"admin-add-worker.html"));
app.get("/admin-add-worker.html", (req,res)=>sendStaticPage(res,"admin-add-worker.html"));

app.get("/worker.html", (req,res)=>sendStaticPage(res,"worker.html"));
app.get("/worker/:id", (req,res)=>sendStaticPage(res,"worker.html"));
app.get("/trade/:trade/area/:area", (req,res)=>sendStaticPage(res,"index.html"));
app.get("/trade/:trade", (req,res)=>sendStaticPage(res,"index.html"));
app.get("/area/:area", (req,res)=>sendStaticPage(res,"index.html"));

// Workers
app.get("/api/workers", async (req,res)=>{ if(!ready(res))return; const {data,error}=await supabase.from("workers").select(PUBLIC_WORKER_COLUMNS).eq("approved",true).eq("active",true).or(`subscription_end.is.null,subscription_end.gte.${today()}`).order("featured",{ascending:false}).order("id",{ascending:false}); if(error)return res.status(500).json({success:false,error:error.message}); res.json(data||[]); });
app.get("/api/sanaieya", (req,res)=>{ req.url="/api/workers"; app._router.handle(req,res); });
app.get("/sanaieya", (req,res)=>{ req.url="/api/workers"; app._router.handle(req,res); });

app.get("/api/admin/workers", requireAdmin, async (req,res)=>{ if(!ready(res))return; const {data,error}=await supabase.from("workers").select("*").order("id",{ascending:false}); if(error)return res.status(500).json({success:false,error:error.message}); res.json(data||[]); });
app.get("/api/workers/all", requireAdmin, (req,res)=>{ req.url="/api/admin/workers"; app._router.handle(req,res); });

app.get("/api/admin/workers/:id/id-card/:side", requireAdmin, async (req,res)=>{
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

app.put("/api/admin/workers/:id/identity-review", requireAdmin, async (req,res)=>{
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

app.get("/api/workers/:id", async (req,res)=>{ if(!ready(res))return; const {data,error}=await supabase.from("workers").select(PUBLIC_WORKER_COLUMNS).eq("id",id(req)).single(); if(error||!data)return res.status(404).json({success:false,error:"الصنايعي غير موجود"}); res.json(data); });

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


// Admin-only worker creation. This does not change public registration rules.
// Public /api/register still requires both ID card images.
async function createWorkerFromAdmin(req, res) {
  if (!ready(res)) return;

  try {
    const { name, phone, whatsapp, trade, area, description } = req.body || {};

    if (!name || !phone || !trade || !area) {
      return res.status(400).json({ success: false, error: "الاسم ورقم الاتصال والحرفة والمنطقة مطلوبين" });
    }

    const duplicate = await findDuplicateWorkerByPhone(phone, whatsapp);
    if (duplicate) {
      return res.status(409).json({
        success: false,
        duplicate: true,
        duplicate_worker_id: duplicate.id,
        error: `هذا الرقم مسجل بالفعل باسم ${duplicate.name}. لا يمكن تسجيل نفس رقم الهاتف أو الواتساب أكثر من مرة.`
      });
    }

    const frontFile = idFrontFile(req);
    const backFile = idBackFile(req);
    const hasFront = !!frontFile;
    const hasBack = !!backFile;

    if ((hasFront && !hasBack) || (!hasFront && hasBack)) {
      return res.status(400).json({ success: false, error: "لو هترفع البطاقة لازم ترفع الوجه والظهر معًا، أو اترك الاثنين فارغين." });
    }

    const image = mainFile(req) ? await uploadImage(mainFile(req), "profiles") : "";
    const id_front_path = hasFront ? await uploadPrivateImage(frontFile, "id-cards") : "";
    const id_back_path = hasBack ? await uploadPrivateImage(backFile, "id-cards") : "";

    const start = today();
    const months = Math.max(1, Math.min(60, Number(req.body.subscription_months) || 1));
    const end = addMonths(start, months);

    const approved = req.body.approved === undefined ? true : bool(req.body.approved);
    const active = req.body.active === undefined ? true : bool(req.body.active);
    const featured = bool(req.body.featured);
    const identityVerified = hasFront && hasBack && bool(req.body.identity_verified);

    const row = {
      name: String(name).trim(),
      phone: String(phone).trim(),
      whatsapp: whatsapp ? String(whatsapp).trim() : "",
      trade: String(trade).trim(),
      area: String(area).trim(),
      description: description ? String(description).trim() : "",
      image,
      id_front_path,
      id_back_path,
      id_submitted_at: hasFront && hasBack ? new Date().toISOString() : null,
      identity_status: identityVerified ? "verified" : "pending",
      identity_verified: identityVerified,
      identity_rejection_reason: "",
      identity_review_note: identityVerified ? "تمت الإضافة والتوثيق من لوحة الإدارة." : "تمت الإضافة من لوحة الإدارة بدون توثيق بطاقة.",
      identity_reviewed_at: identityVerified ? new Date().toISOString() : null,
      approved,
      active,
      featured,
      subscription_start: start,
      subscription_end: end
    };

    const { data: worker, error } = await supabase.from("workers").insert(row).select().single();
    if (error) throw error;

    const registrationCode = makeRegistrationCode(worker.id, worker.created_at || Date.now());
    const { error: codeError } = await supabase.from("workers").update({ registration_code: registrationCode }).eq("id", worker.id);
    if (codeError) console.warn("Registration code was generated but not saved. Run Patch 19 SQL:", codeError.message);

    const photos = [];
    for (const f of workFiles(req)) {
      photos.push({ worker_id: worker.id, image: await uploadImage(f, "work-photos") });
    }

    if (photos.length) {
      const { error: pe } = await supabase.from("worker_photos").insert(photos);
      if (pe) throw pe;
    }

    await logAdminActivity("worker_register", {
      entity_type: "worker",
      entity_id: worker.id,
      entity_name: worker.name || String(name).trim(),
      details: {
        source: "admin_create",
        registration_code: registrationCode,
        trade: String(trade).trim(),
        area: String(area).trim(),
        approved,
        active,
        featured,
        identity_verified: identityVerified
      }
    });

    return res.json({
      success: true,
      message: "تمت إضافة الصنايعي من لوحة الإدارة بنجاح",
      id: worker.id,
      registration_code: registrationCode,
      registrationCode,
      approved,
      active,
      featured,
      identity_verified: identityVerified
    });
  } catch (e) {
    return res.status(500).json({ success: false, error: e.message || "حدث خطأ أثناء إضافة الصنايعي" });
  }
}
app.post("/api/admin/workers/create", requireAdmin, workerUpload, createWorkerFromAdmin);

async function updateWorker(req,res){
  if(!ready(res))return;
  const u={}, b=req.body||{};
  ["name","phone","whatsapp","trade","area","description"].forEach(k=>{ if(b[k]!==undefined) u[k]=b[k]; });
  if(b.approved!==undefined) u.approved=bool(b.approved);
  if(b.active!==undefined) u.active=bool(b.active);
  if(b.featured!==undefined) u.featured=bool(b.featured);
  const {data:before}=await supabase.from("workers").select("id,name").eq("id",id(req)).single();
  const {error}=await supabase.from("workers").update(u).eq("id",id(req));
  if(error)return res.status(500).json({success:false,error:error.message});
  await logAdminActivity("worker_update",{entity_type:"worker",entity_id:id(req),entity_name:(u.name||before?.name||"صنايعي"),details:{fields:Object.keys(u)}});
  res.json({success:true});
}
app.put("/api/workers/:id", requireAdmin, updateWorker); app.put("/api/sanaieya/:id", requireAdmin, updateWorker);
async function setBool(req,res,col){
  if(!ready(res))return;
  const value=bool(req.body[col]);
  const updates={[col]:value};
  const {data:worker}=await supabase.from("workers").select("id,name").eq("id",id(req)).single();

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
  await logAdminActivity(action,{entity_type:"worker",entity_id:id(req),entity_name:worker?.name||"صنايعي",details:{field:col,value}});
  res.json({success:true});
}
app.put("/api/workers/:id/approve", requireAdmin, (req,res)=>setBool(req,res,"approved")); app.put("/api/sanaieya/:id/approve", requireAdmin, (req,res)=>setBool(req,res,"approved"));
app.put("/api/workers/:id/active", requireAdmin, (req,res)=>setBool(req,res,"active")); app.put("/api/sanaieya/:id/active", requireAdmin, (req,res)=>setBool(req,res,"active"));
app.put("/api/workers/:id/featured", requireAdmin, (req,res)=>setBool(req,res,"featured")); app.put("/api/sanaieya/:id/featured", requireAdmin, (req,res)=>setBool(req,res,"featured"));

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
app.put("/api/workers/:id/renew", requireAdmin, renew); app.put("/api/sanaieya/:id/renew", requireAdmin, renew); app.put("/api/workers/:id/subscription", requireAdmin, renew); app.put("/api/sanaieya/:id/subscription", requireAdmin, renew);

app.get("/api/workers/:id/subscription-payments", requireAdmin, async (req,res)=>{
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
app.post("/api/workers/:id/photos", requireAdmin, upload.array("workPhotos",5), async (req,res)=>{ if(!ready(res))return; try{ if(!req.files||!req.files.length)return res.status(400).json({success:false,error:"لم يتم رفع أي صور"}); const rows=[]; for(const f of req.files){ rows.push({worker_id:id(req),image:await uploadImage(f,"work-photos")}); } const {error}=await supabase.from("worker_photos").insert(rows); if(error)throw error; const {data:worker}=await supabase.from("workers").select("id,name").eq("id",id(req)).single(); await logAdminActivity("work_photos_add",{entity_type:"worker",entity_id:id(req),entity_name:worker?.name||"صنايعي",details:{count:rows.length}}); res.json({success:true,count:rows.length}); }catch(e){ res.status(500).json({success:false,error:e.message}); }});
app.delete("/api/workers/photos/:photoId", requireAdmin, async (req,res)=>{ if(!ready(res))return; const photoId=Number(req.params.photoId); const {data:photo}=await supabase.from("worker_photos").select("id,worker_id").eq("id",photoId).single(); const {error}=await supabase.from("worker_photos").delete().eq("id",photoId); if(error)return res.status(500).json({success:false,error:error.message}); await logAdminActivity("work_photo_delete",{entity_type:"worker_photo",entity_id:photoId,entity_name:"صورة عمل",details:{worker_id:photo?.worker_id||null}}); res.json({success:true}); });

// Reviews
app.get("/api/workers/:id/reviews", async (req,res)=>{ if(!ready(res))return; const {data,error}=await supabase.from("reviews").select("*").eq("worker_id",id(req)).eq("approved",true).order("id",{ascending:false}); if(error)return res.status(500).json({success:false,error:error.message}); res.json(data||[]); });
app.get("/api/workers/:id/reviews/summary", async (req,res)=>{ if(!ready(res))return; const {data,error}=await supabase.from("reviews").select("rating").eq("worker_id",id(req)).eq("approved",true); if(error)return res.status(500).json({success:false,error:error.message}); const count=(data||[]).length, sum=(data||[]).reduce((a,r)=>a+Number(r.rating||0),0); res.json({count,average:count?Math.round((sum/count)*10)/10:0}); });
app.post("/api/workers/:id/reviews", async (req,res)=>{ if(!ready(res))return; const rating=Number(req.body.rating), comment=String(req.body.comment||req.body.review||"").trim(), customer=String(req.body.customer_name||req.body.customerName||req.body.name||"عميل").trim(); if(!rating||rating<1||rating>5)return res.status(400).json({success:false,error:"التقييم يجب أن يكون من 1 إلى 5"}); if(!comment)return res.status(400).json({success:false,error:"من فضلك اكتب الريفيو"}); const {error}=await supabase.from("reviews").insert({worker_id:id(req),customer_name:customer||"عميل",rating,comment,approved:false}); if(error)return res.status(500).json({success:false,error:error.message}); res.json({success:true,message:"تم إرسال التقييم بنجاح، وسيظهر بعد مراجعة الإدارة"}); });
app.get("/api/admin/reviews", requireAdmin, async (req,res)=>{ if(!ready(res))return; const {data,error}=await supabase.from("reviews").select("*, workers(name, trade, area)").order("id",{ascending:false}); if(error)return res.status(500).json({success:false,error:error.message}); res.json((data||[]).map(r=>({...r,worker_name:r.workers?r.workers.name:"",worker_trade:r.workers?r.workers.trade:"",worker_area:r.workers?r.workers.area:""}))); });
app.put("/api/reviews/:id/approve", requireAdmin, async (req,res)=>{ if(!ready(res))return; const reviewId=Number(req.params.id); const approved=bool(req.body.approved); const {data:review}=await supabase.from("reviews").select("id,worker_id,customer_name,rating").eq("id",reviewId).single(); const {error}=await supabase.from("reviews").update({approved}).eq("id",reviewId); if(error)return res.status(500).json({success:false,error:error.message}); await logAdminActivity(approved?"review_approve":"review_unapprove",{entity_type:"review",entity_id:reviewId,entity_name:review?.customer_name||"تقييم",details:{worker_id:review?.worker_id||null,rating:review?.rating||null,approved}}); res.json({success:true}); });
app.delete("/api/reviews/:id", requireAdmin, async (req,res)=>{ if(!ready(res))return; const reviewId=Number(req.params.id); const {data:review}=await supabase.from("reviews").select("id,worker_id,customer_name,rating").eq("id",reviewId).single(); const {error}=await supabase.from("reviews").delete().eq("id",reviewId); if(error)return res.status(500).json({success:false,error:error.message}); await logAdminActivity("review_delete",{entity_type:"review",entity_id:reviewId,entity_name:review?.customer_name||"تقييم",details:{worker_id:review?.worker_id||null,rating:review?.rating||null}}); res.json({success:true}); });

// Delete worker
async function deleteWorker(req,res){ if(!ready(res))return; const {data:worker}=await supabase.from("workers").select("id,name,phone,trade,area").eq("id",id(req)).single(); const {error}=await supabase.from("workers").delete().eq("id",id(req)); if(error)return res.status(500).json({success:false,error:error.message}); await logAdminActivity("worker_delete",{entity_type:"worker",entity_id:id(req),entity_name:worker?.name||"صنايعي",details:{phone:worker?.phone||"",trade:worker?.trade||"",area:worker?.area||""}}); res.json({success:true}); }
app.delete("/api/workers/:id", requireAdmin, deleteWorker); app.delete("/api/sanaieya/:id", requireAdmin, deleteWorker);

// Trades / Areas
async function listTable(res,table){ const {data,error}=await supabase.from(table).select("*").order("id",{ascending:false}); if(error)return res.status(500).json({success:false,error:error.message}); res.json(data||[]); }
async function addToTable(req,res,table,label){ const name=req.body.name||req.body.trade||req.body.craft||req.body.area||req.body.location; if(!name||!String(name).trim())return res.status(400).json({success:false,error:`اسم ${label} مطلوب`}); const cleanName=String(name).trim(); const {data,error}=await supabase.from(table).insert({name:cleanName}).select().single(); if(error)return res.status(500).json({success:false,error:`${label} موجودة بالفعل أو حدث خطأ أثناء الإضافة`}); await logAdminActivity(table==="trades"?"trade_add":"area_add",{entity_type:table,entity_id:data.id,entity_name:data.name||cleanName,details:{label}}); res.json({success:true,id:data.id,name:data.name}); }
async function delFromTable(req,res,table){ const rowId=Number(req.params.id); const {data:row}=await supabase.from(table).select("id,name").eq("id",rowId).single(); const {error}=await supabase.from(table).delete().eq("id",rowId); if(error)return res.status(500).json({success:false,error:error.message}); await logAdminActivity(table==="trades"?"trade_delete":"area_delete",{entity_type:table,entity_id:rowId,entity_name:row?.name||"",details:{}}); res.json({success:true}); }
app.get("/api/trades",(req,res)=>ready(res)&&listTable(res,"trades")); app.get("/api/crafts",(req,res)=>ready(res)&&listTable(res,"trades")); app.get("/trades",(req,res)=>ready(res)&&listTable(res,"trades")); app.get("/crafts",(req,res)=>ready(res)&&listTable(res,"trades"));
app.post("/api/trades", requireAdmin, (req,res)=>ready(res)&&addToTable(req,res,"trades","الحرفة")); app.post("/api/crafts", requireAdmin, (req,res)=>ready(res)&&addToTable(req,res,"trades","الحرفة")); app.post("/trades", requireAdmin, (req,res)=>ready(res)&&addToTable(req,res,"trades","الحرفة")); app.post("/crafts", requireAdmin, (req,res)=>ready(res)&&addToTable(req,res,"trades","الحرفة"));
app.delete("/api/trades/:id", requireAdmin, (req,res)=>ready(res)&&delFromTable(req,res,"trades")); app.delete("/api/crafts/:id", requireAdmin, (req,res)=>ready(res)&&delFromTable(req,res,"trades")); app.delete("/trades/:id", requireAdmin, (req,res)=>ready(res)&&delFromTable(req,res,"trades")); app.delete("/crafts/:id", requireAdmin, (req,res)=>ready(res)&&delFromTable(req,res,"trades"));

app.get("/api/areas",(req,res)=>ready(res)&&listTable(res,"areas")); app.get("/api/locations",(req,res)=>ready(res)&&listTable(res,"areas")); app.get("/areas",(req,res)=>ready(res)&&listTable(res,"areas")); app.get("/locations",(req,res)=>ready(res)&&listTable(res,"areas"));
app.post("/api/areas", requireAdmin, (req,res)=>ready(res)&&addToTable(req,res,"areas","المنطقة")); app.post("/api/locations", requireAdmin, (req,res)=>ready(res)&&addToTable(req,res,"areas","المنطقة")); app.post("/areas", requireAdmin, (req,res)=>ready(res)&&addToTable(req,res,"areas","المنطقة")); app.post("/locations", requireAdmin, (req,res)=>ready(res)&&addToTable(req,res,"areas","المنطقة"));
app.delete("/api/areas/:id", requireAdmin, (req,res)=>ready(res)&&delFromTable(req,res,"areas")); app.delete("/api/locations/:id", requireAdmin, (req,res)=>ready(res)&&delFromTable(req,res,"areas")); app.delete("/areas/:id", requireAdmin, (req,res)=>ready(res)&&delFromTable(req,res,"areas")); app.delete("/locations/:id", requireAdmin, (req,res)=>ready(res)&&delFromTable(req,res,"areas"));



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

app.get("/api/admin/dashboard-stats", requireAdmin, async (req,res)=>{
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



app.get("/api/admin/activity-log", requireAdmin, async (req,res)=>{
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
app.get("/api/admin/notifications", requireAdmin, async (req,res)=>{ if(!ready(res))return; const t=today(); const s=new Date(); s.setDate(s.getDate()+7); const st=s.toISOString().split("T")[0]; const [a,b,c,d]=await Promise.all([supabase.from("workers").select("id",{count:"exact",head:true}).eq("approved",false),supabase.from("reviews").select("id",{count:"exact",head:true}).eq("approved",false),supabase.from("workers").select("id",{count:"exact",head:true}).gte("subscription_end",t).lte("subscription_end",st),supabase.from("workers").select("id",{count:"exact",head:true}).lt("subscription_end",t)]); res.json({pendingWorkers:a.count||0,pendingReviews:b.count||0,subscriptionsSoon:c.count||0,subscriptionsExpired:d.count||0}); });

// Export CSV
function csv(v){ if(v===null||v===undefined)return ""; const t=String(v).replace(/"/g,'""'); return /[,"\n]/.test(t)?`"${t}"`:t; }
app.get("/api/export-workers", requireAdmin, async (req,res)=>{ if(!ready(res))return; const {data:workers,error}=await supabase.from("workers").select("*").order("id",{ascending:false}); if(error)return res.status(500).json({success:false,error:error.message}); const {data:reviews}=await supabase.from("reviews").select("worker_id,rating").eq("approved",true); const by={}; (reviews||[]).forEach(r=>{ const k=String(r.worker_id); if(!by[k])by[k]=[]; by[k].push(Number(r.rating||0)); }); const headers=["رقم الطلب","ID","الاسم","رقم الهاتف","رقم الواتساب","الحرفة","المنطقة","الوصف","حالة الموافقة","حالة التفعيل","حالة التحقق","سبب التحقق","مميز","بداية الاشتراك","نهاية الاشتراك","تاريخ التسجيل","عدد التقييمات المعتمدة","متوسط التقييم"]; const lines=[headers.map(csv).join(",")]; (workers||[]).forEach(w=>{ const rs=by[String(w.id)]||[], count=rs.length, avg=count?Math.round((rs.reduce((a,b)=>a+b,0)/count)*10)/10:0; lines.push([w.registration_code||makeRegistrationCode(w.id,w.created_at),w.id,w.name,w.phone,w.whatsapp,w.trade,w.area,w.description,w.approved?"موافق عليه":"بانتظار الموافقة",w.active?"نشط":"متوقف",identityStatusLabel(normalizeIdentityStatus(w.identity_status || (w.identity_verified?"verified":"pending"))),w.identity_rejection_reason||"",w.featured?"مميز":"عادي",w.subscription_start,w.subscription_end,w.created_at,count,avg].map(csv).join(",")); }); const content="\uFEFF"+lines.join("\n"); res.setHeader("Content-Type","text/csv; charset=utf-8"); res.setHeader("Content-Disposition",`attachment; filename="sanay3i-workers-report.csv"`); res.send(content); });
app.get("/api/backup-db", requireAdmin, (req,res)=>res.status(400).json({success:false,error:"النسخ الاحتياطي لقاعدة Supabase يتم من لوحة Supabase"}));

app.use((req,res,next)=>{ if(req.path.startsWith("/api")) return res.status(404).json({success:false,error:"API route not found"}); next(); });

module.exports = app;
