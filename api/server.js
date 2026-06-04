
const express = require("express");
const multer = require("multer");
const path = require("path");
const { createClient } = require("@supabase/supabase-js");
try { require("dotenv").config(); } catch(e) {}

const app = express();
app.use(express.json({ limit: "10mb" }));
app.use(express.urlencoded({ extended: true, limit: "10mb" }));
// ===============================
// Static / PWA files for Vercel
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

// ===============================
// Static files for Local + Vercel
// ===============================
const STATIC_DIR = path.join(__dirname, "..");

app.use(express.static(STATIC_DIR));

app.get("/style.css", (req, res) => {
  res.sendFile(path.join(STATIC_DIR, "style.css"));
});

app.get("/favicon.ico", (req, res) => {
  res.status(204).end();
});




const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const SUPABASE_BUCKET = process.env.SUPABASE_BUCKET || "uploads";
const supabase = createClient(SUPABASE_URL || "", SUPABASE_SERVICE_ROLE_KEY || "");

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 6 * 1024 * 1024 },
  fileFilter: (req, file, cb) => file.mimetype && file.mimetype.startsWith("image/") ? cb(null, true) : cb(new Error("Only images are allowed"))
});
const workerUpload = upload.fields([{ name: "image", maxCount: 1 }, { name: "workPhotos", maxCount: 5 }]);

function ready(res){ if(!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY){ res.status(500).json({success:false,error:"Supabase environment variables are missing"}); return false;} return true; }
function today(){ return new Date().toISOString().split("T")[0]; }
function addMonths(start, months){ const d=start?new Date(start):new Date(); if(isNaN(d.getTime())) d.setTime(Date.now()); d.setMonth(d.getMonth()+months); return d.toISOString().split("T")[0]; }
function bool(v){ return v===true || v==="true" || v==="1" || v===1; }
function id(req){ return Number(req.params.id); }
function ext(file){ const e=path.extname(file.originalname||""); if(e) return e.toLowerCase(); if(file.mimetype==="image/png") return ".png"; if(file.mimetype==="image/webp") return ".webp"; return ".jpg"; }
async function uploadImage(file, folder){ if(!file) return ""; const name=`${folder}/${Date.now()}-${Math.round(Math.random()*1e9)}${ext(file)}`; const {error}=await supabase.storage.from(SUPABASE_BUCKET).upload(name,file.buffer,{contentType:file.mimetype||"image/jpeg",upsert:false}); if(error) throw error; return supabase.storage.from(SUPABASE_BUCKET).getPublicUrl(name).data.publicUrl; }
function mainFile(req){ return req.files && req.files.image && req.files.image[0] ? req.files.image[0] : null; }
function workFiles(req){ return req.files && req.files.workPhotos ? req.files.workPhotos : []; }

// Local page fallback
app.get("/", (req,res)=>res.sendFile(path.join(process.cwd(),"index.html")));
app.get("/register", (req,res)=>res.sendFile(path.join(process.cwd(),"register.html")));
app.get("/admin", (req,res)=>res.sendFile(path.join(process.cwd(),"admin.html")));
app.get("/worker/:id", (req,res)=>res.sendFile(path.join(process.cwd(),"worker.html")));

// Workers
app.get("/api/workers", async (req,res)=>{ if(!ready(res))return; const {data,error}=await supabase.from("workers").select("*").eq("approved",true).eq("active",true).or(`subscription_end.is.null,subscription_end.gte.${today()}`).order("featured",{ascending:false}).order("id",{ascending:false}); if(error)return res.status(500).json({success:false,error:error.message}); res.json(data||[]); });
app.get("/api/sanaieya", (req,res)=>{ req.url="/api/workers"; app._router.handle(req,res); });
app.get("/sanaieya", (req,res)=>{ req.url="/api/workers"; app._router.handle(req,res); });

app.get("/api/admin/workers", async (req,res)=>{ if(!ready(res))return; const {data,error}=await supabase.from("workers").select("*").order("id",{ascending:false}); if(error)return res.status(500).json({success:false,error:error.message}); res.json(data||[]); });
app.get("/api/workers/all", (req,res)=>{ req.url="/api/admin/workers"; app._router.handle(req,res); });

app.get("/api/workers/:id", async (req,res)=>{ if(!ready(res))return; const {data,error}=await supabase.from("workers").select("*").eq("id",id(req)).single(); if(error||!data)return res.status(404).json({success:false,error:"الصنايعي غير موجود"}); res.json(data); });

async function insertWorker(req,res){
  if(!ready(res))return;
  try{
    const {name,phone,whatsapp,trade,area,description}=req.body;
    if(!name||!phone||!trade||!area) return res.status(400).json({success:false,error:"الاسم ورقم الاتصال والحرفة والمنطقة مطلوبين"});
    const image = mainFile(req) ? await uploadImage(mainFile(req),"profiles") : "";
    const start=today(), end=addMonths(start,1);
    const {data:worker,error}=await supabase.from("workers").insert({name:String(name).trim(),phone:String(phone).trim(),whatsapp:whatsapp?String(whatsapp).trim():"",trade:String(trade).trim(),area:String(area).trim(),description:description?String(description).trim():"",image,approved:false,active:true,featured:false,subscription_start:start,subscription_end:end}).select().single();
    if(error) throw error;
    const photos=[];
    for(const f of workFiles(req)){ photos.push({worker_id:worker.id,image:await uploadImage(f,"work-photos")}); }
    if(photos.length){ const {error:pe}=await supabase.from("worker_photos").insert(photos); if(pe) throw pe; }
    res.json({success:true,message:"تم إرسال طلب التسجيل بنجاح",id:worker.id});
  }catch(e){ res.status(500).json({success:false,error:e.message||"حدث خطأ أثناء التسجيل"}); }
}
app.post("/api/register", workerUpload, insertWorker);
app.post("/api/sanaieya", workerUpload, insertWorker);
app.post("/api/workers", workerUpload, insertWorker);

async function updateWorker(req,res){
  if(!ready(res))return;
  const u={}, b=req.body||{};
  ["name","phone","whatsapp","trade","area","description"].forEach(k=>{ if(b[k]!==undefined) u[k]=b[k]; });
  if(b.approved!==undefined) u.approved=bool(b.approved);
  if(b.active!==undefined) u.active=bool(b.active);
  if(b.featured!==undefined) u.featured=bool(b.featured);
  const {error}=await supabase.from("workers").update(u).eq("id",id(req));
  if(error)return res.status(500).json({success:false,error:error.message});
  res.json({success:true});
}
app.put("/api/workers/:id", updateWorker); app.put("/api/sanaieya/:id", updateWorker);
async function setBool(req,res,col){ if(!ready(res))return; const {error}=await supabase.from("workers").update({[col]:bool(req.body[col])}).eq("id",id(req)); if(error)return res.status(500).json({success:false,error:error.message}); res.json({success:true}); }
app.put("/api/workers/:id/approve",(req,res)=>setBool(req,res,"approved")); app.put("/api/sanaieya/:id/approve",(req,res)=>setBool(req,res,"approved"));
app.put("/api/workers/:id/active",(req,res)=>setBool(req,res,"active")); app.put("/api/sanaieya/:id/active",(req,res)=>setBool(req,res,"active"));
app.put("/api/workers/:id/featured",(req,res)=>setBool(req,res,"featured")); app.put("/api/sanaieya/:id/featured",(req,res)=>setBool(req,res,"featured"));

async function renew(req,res){
  if(!ready(res))return;
  const months=Number(req.body.months)||1;
  const {data:w,error}=await supabase.from("workers").select("*").eq("id",id(req)).single();
  if(error||!w)return res.status(404).json({success:false,error:"الصنايعي غير موجود"});
  const t=today(); let start=t;
  if(w.subscription_end){ const d=new Date(w.subscription_end), td=new Date(t); if(!isNaN(d.getTime())&&d>td) start=w.subscription_end; }
  const newEnd=addMonths(start,months);
  const {error:ue}=await supabase.from("workers").update({subscription_start:t,subscription_end:newEnd,active:true}).eq("id",id(req));
  if(ue)return res.status(500).json({success:false,error:ue.message});
  res.json({success:true,subscription_start:t,subscription_end:newEnd});
}
app.put("/api/workers/:id/renew",renew); app.put("/api/sanaieya/:id/renew",renew); app.put("/api/workers/:id/subscription",renew); app.put("/api/sanaieya/:id/subscription",renew);

// Photos
app.get("/api/workers/:id/photos", async (req,res)=>{ if(!ready(res))return; const {data,error}=await supabase.from("worker_photos").select("*").eq("worker_id",id(req)).order("id",{ascending:false}); if(error)return res.status(500).json({success:false,error:error.message}); res.json(data||[]); });
app.post("/api/workers/:id/photos", upload.array("workPhotos",5), async (req,res)=>{ if(!ready(res))return; try{ if(!req.files||!req.files.length)return res.status(400).json({success:false,error:"لم يتم رفع أي صور"}); const rows=[]; for(const f of req.files){ rows.push({worker_id:id(req),image:await uploadImage(f,"work-photos")}); } const {error}=await supabase.from("worker_photos").insert(rows); if(error)throw error; res.json({success:true,count:rows.length}); }catch(e){ res.status(500).json({success:false,error:e.message}); }});
app.delete("/api/workers/photos/:photoId", async (req,res)=>{ if(!ready(res))return; const {error}=await supabase.from("worker_photos").delete().eq("id",Number(req.params.photoId)); if(error)return res.status(500).json({success:false,error:error.message}); res.json({success:true}); });

// Reviews
app.get("/api/workers/:id/reviews", async (req,res)=>{ if(!ready(res))return; const {data,error}=await supabase.from("reviews").select("*").eq("worker_id",id(req)).eq("approved",true).order("id",{ascending:false}); if(error)return res.status(500).json({success:false,error:error.message}); res.json(data||[]); });
app.get("/api/workers/:id/reviews/summary", async (req,res)=>{ if(!ready(res))return; const {data,error}=await supabase.from("reviews").select("rating").eq("worker_id",id(req)).eq("approved",true); if(error)return res.status(500).json({success:false,error:error.message}); const count=(data||[]).length, sum=(data||[]).reduce((a,r)=>a+Number(r.rating||0),0); res.json({count,average:count?Math.round((sum/count)*10)/10:0}); });
app.post("/api/workers/:id/reviews", async (req,res)=>{ if(!ready(res))return; const rating=Number(req.body.rating), comment=String(req.body.comment||req.body.review||"").trim(), customer=String(req.body.customer_name||req.body.customerName||req.body.name||"عميل").trim(); if(!rating||rating<1||rating>5)return res.status(400).json({success:false,error:"التقييم يجب أن يكون من 1 إلى 5"}); if(!comment)return res.status(400).json({success:false,error:"من فضلك اكتب الريفيو"}); const {error}=await supabase.from("reviews").insert({worker_id:id(req),customer_name:customer||"عميل",rating,comment,approved:false}); if(error)return res.status(500).json({success:false,error:error.message}); res.json({success:true,message:"تم إرسال التقييم بنجاح، وسيظهر بعد مراجعة الإدارة"}); });
app.get("/api/admin/reviews", async (req,res)=>{ if(!ready(res))return; const {data,error}=await supabase.from("reviews").select("*, workers(name, trade, area)").order("id",{ascending:false}); if(error)return res.status(500).json({success:false,error:error.message}); res.json((data||[]).map(r=>({...r,worker_name:r.workers?r.workers.name:"",worker_trade:r.workers?r.workers.trade:"",worker_area:r.workers?r.workers.area:""}))); });
app.put("/api/reviews/:id/approve", async (req,res)=>{ if(!ready(res))return; const {error}=await supabase.from("reviews").update({approved:bool(req.body.approved)}).eq("id",Number(req.params.id)); if(error)return res.status(500).json({success:false,error:error.message}); res.json({success:true}); });
app.delete("/api/reviews/:id", async (req,res)=>{ if(!ready(res))return; const {error}=await supabase.from("reviews").delete().eq("id",Number(req.params.id)); if(error)return res.status(500).json({success:false,error:error.message}); res.json({success:true}); });

// Delete worker
async function deleteWorker(req,res){ if(!ready(res))return; const {error}=await supabase.from("workers").delete().eq("id",id(req)); if(error)return res.status(500).json({success:false,error:error.message}); res.json({success:true}); }
app.delete("/api/workers/:id", deleteWorker); app.delete("/api/sanaieya/:id", deleteWorker);

// Trades / Areas
async function listTable(res,table){ const {data,error}=await supabase.from(table).select("*").order("id",{ascending:false}); if(error)return res.status(500).json({success:false,error:error.message}); res.json(data||[]); }
async function addToTable(req,res,table,label){ const name=req.body.name||req.body.trade||req.body.craft||req.body.area||req.body.location; if(!name||!String(name).trim())return res.status(400).json({success:false,error:`اسم ${label} مطلوب`}); const {data,error}=await supabase.from(table).insert({name:String(name).trim()}).select().single(); if(error)return res.status(500).json({success:false,error:`${label} موجودة بالفعل أو حدث خطأ أثناء الإضافة`}); res.json({success:true,id:data.id,name:data.name}); }
async function delFromTable(req,res,table){ const {error}=await supabase.from(table).delete().eq("id",Number(req.params.id)); if(error)return res.status(500).json({success:false,error:error.message}); res.json({success:true}); }
app.get("/api/trades",(req,res)=>ready(res)&&listTable(res,"trades")); app.get("/api/crafts",(req,res)=>ready(res)&&listTable(res,"trades")); app.get("/trades",(req,res)=>ready(res)&&listTable(res,"trades")); app.get("/crafts",(req,res)=>ready(res)&&listTable(res,"trades"));
app.post("/api/trades",(req,res)=>ready(res)&&addToTable(req,res,"trades","الحرفة")); app.post("/api/crafts",(req,res)=>ready(res)&&addToTable(req,res,"trades","الحرفة")); app.post("/trades",(req,res)=>ready(res)&&addToTable(req,res,"trades","الحرفة")); app.post("/crafts",(req,res)=>ready(res)&&addToTable(req,res,"trades","الحرفة"));
app.delete("/api/trades/:id",(req,res)=>ready(res)&&delFromTable(req,res,"trades")); app.delete("/api/crafts/:id",(req,res)=>ready(res)&&delFromTable(req,res,"trades")); app.delete("/trades/:id",(req,res)=>ready(res)&&delFromTable(req,res,"trades")); app.delete("/crafts/:id",(req,res)=>ready(res)&&delFromTable(req,res,"trades"));

app.get("/api/areas",(req,res)=>ready(res)&&listTable(res,"areas")); app.get("/api/locations",(req,res)=>ready(res)&&listTable(res,"areas")); app.get("/areas",(req,res)=>ready(res)&&listTable(res,"areas")); app.get("/locations",(req,res)=>ready(res)&&listTable(res,"areas"));
app.post("/api/areas",(req,res)=>ready(res)&&addToTable(req,res,"areas","المنطقة")); app.post("/api/locations",(req,res)=>ready(res)&&addToTable(req,res,"areas","المنطقة")); app.post("/areas",(req,res)=>ready(res)&&addToTable(req,res,"areas","المنطقة")); app.post("/locations",(req,res)=>ready(res)&&addToTable(req,res,"areas","المنطقة"));
app.delete("/api/areas/:id",(req,res)=>ready(res)&&delFromTable(req,res,"areas")); app.delete("/api/locations/:id",(req,res)=>ready(res)&&delFromTable(req,res,"areas")); app.delete("/areas/:id",(req,res)=>ready(res)&&delFromTable(req,res,"areas")); app.delete("/locations/:id",(req,res)=>ready(res)&&delFromTable(req,res,"areas"));

// Notifications
app.get("/api/admin/notifications", async (req,res)=>{ if(!ready(res))return; const t=today(); const s=new Date(); s.setDate(s.getDate()+7); const st=s.toISOString().split("T")[0]; const [a,b,c,d]=await Promise.all([supabase.from("workers").select("id",{count:"exact",head:true}).eq("approved",false),supabase.from("reviews").select("id",{count:"exact",head:true}).eq("approved",false),supabase.from("workers").select("id",{count:"exact",head:true}).gte("subscription_end",t).lte("subscription_end",st),supabase.from("workers").select("id",{count:"exact",head:true}).lt("subscription_end",t)]); res.json({pendingWorkers:a.count||0,pendingReviews:b.count||0,subscriptionsSoon:c.count||0,subscriptionsExpired:d.count||0}); });

// Export CSV
function csv(v){ if(v===null||v===undefined)return ""; const t=String(v).replace(/"/g,'""'); return /[,"\n]/.test(t)?`"${t}"`:t; }
app.get("/api/export-workers", async (req,res)=>{ if(!ready(res))return; const {data:workers,error}=await supabase.from("workers").select("*").order("id",{ascending:false}); if(error)return res.status(500).json({success:false,error:error.message}); const {data:reviews}=await supabase.from("reviews").select("worker_id,rating").eq("approved",true); const by={}; (reviews||[]).forEach(r=>{ const k=String(r.worker_id); if(!by[k])by[k]=[]; by[k].push(Number(r.rating||0)); }); const headers=["ID","الاسم","رقم الهاتف","رقم الواتساب","الحرفة","المنطقة","الوصف","حالة الموافقة","حالة التفعيل","مميز","بداية الاشتراك","نهاية الاشتراك","تاريخ التسجيل","عدد التقييمات المعتمدة","متوسط التقييم"]; const lines=[headers.map(csv).join(",")]; (workers||[]).forEach(w=>{ const rs=by[String(w.id)]||[], count=rs.length, avg=count?Math.round((rs.reduce((a,b)=>a+b,0)/count)*10)/10:0; lines.push([w.id,w.name,w.phone,w.whatsapp,w.trade,w.area,w.description,w.approved?"موافق عليه":"بانتظار الموافقة",w.active?"نشط":"متوقف",w.featured?"مميز":"عادي",w.subscription_start,w.subscription_end,w.created_at,count,avg].map(csv).join(",")); }); const content="\uFEFF"+lines.join("\n"); res.setHeader("Content-Type","text/csv; charset=utf-8"); res.setHeader("Content-Disposition",`attachment; filename="sanay3i-workers-report.csv"`); res.send(content); });
app.get("/api/backup-db",(req,res)=>res.status(400).json({success:false,error:"النسخ الاحتياطي لقاعدة Supabase يتم من لوحة Supabase"}));

app.use((req,res,next)=>{ if(req.path.startsWith("/api")) return res.status(404).json({success:false,error:"API route not found"}); next(); });

module.exports = app;
