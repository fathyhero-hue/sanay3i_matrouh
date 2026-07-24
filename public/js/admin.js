let allWorkers=[],allTrades=[],allAreas=[],photosByWorker={},allReviews=[],ratingsByWorker={},pendingReviewsByWorker={},adminNotifications={},adminUsers=[],adminReports=[],currentAdmin=null;
let __adminLoaded={reviews:false,reports:false,users:false,backups:false,whatsapp:false,analytics:false};

async function loginAdmin(e) {
  if(e) e.preventDefault();
  const username = (document.getElementById("adminUsername")?.value || "").trim().toLowerCase();
  const p = (document.getElementById("adminPassword")?.value || "").trim();
  const err = document.getElementById("loginError");
  
  err.classList.remove("show");
  err.textContent = "جاري التحقق...";
  
  try {
    const r = await fetch("/api/admin/login", {
      method: "POST",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ username, password: p })
    });
    const d = await r.json().catch(() => ({}));
    if (!r.ok || !d.success) throw new Error(d.error || "اسم المستخدم أو كلمة السر غير صحيحة");
    
    currentAdmin = d.admin || null;
    err.classList.remove("show");
    showDashboard();
  } catch(ex) {
    err.textContent = ex.message || "اسم المستخدم أو كلمة السر غير صحيحة";
    err.classList.add("show");
  }
  return false;
}

function roleLabel(role){return {super_admin:"مدير كامل",reviewer:"موظف مراجعة",subscription_manager:"موظف اشتراكات",viewer:"مشاهد"}[role]||role||"الإدارة"}
function can(permission){return !!(currentAdmin&&Array.isArray(currentAdmin.permissions)&&currentAdmin.permissions.includes(permission))}
function applyPermissionUI(){document.querySelectorAll("[data-permission]").forEach(el=>{el.style.display=can(el.dataset.permission)?"":"none"});const badge=document.getElementById("adminRoleBadge");if(badge&&currentAdmin){badge.innerHTML=`<i class="fa-solid fa-user-shield"></i> ${currentAdmin.display_name||currentAdmin.username||"الإدارة"} - ${roleLabel(currentAdmin.role)}`}}
function showDashboard(){document.getElementById("loginScreen").style.display="none";document.getElementById("dashboard").classList.add("show");applyPermissionUI();loadAllData()}
function showLogin(){document.getElementById("dashboard").classList.remove("show");document.getElementById("loginScreen").style.display="flex"}
async function logoutAdmin(){try{await fetch("/api/admin/logout",{method:"POST",credentials:"include"})}catch(e){} location.reload()}
async function checkLogin(){try{const r=await fetch("/api/admin/me",{credentials:"include"});const d=await r.json();if(d.authenticated){currentAdmin=d.admin||null;showDashboard()}else showLogin()}catch(e){showLogin()}}

function switchTab(t,b){
  if(t==="users"&&!can("admin_users:manage")){toast("error","ليس لديك صلاحية إدارة المستخدمين");return}
  if(t==="backups"&&!can("backup:export")){toast("error","ليس لديك صلاحية النسخ الاحتياطي");return}
  if(t==="reports"&&!can("reports:read")){toast("error","ليس لديك صلاحية عرض البلاغات");return}
  if(t==="whatsapp"&&!can("whatsapp:send")){toast("error","ليس لديك صلاحية رسائل واتساب");return}
  
  document.querySelectorAll(".admin-tab").forEach(x=>x.classList.remove("active"));
  b.classList.add("active");
  document.querySelectorAll(".admin-section").forEach(s=>s.classList.remove("active"));
  document.getElementById(t+"Section").classList.add("active");
  
  if(t==='reviews'){loadReviewsAdmin().then(()=>{__adminLoaded.reviews=true;renderReviews()})}
  if(t==='reports') loadReports();
  if(t==='analytics') loadAnalytics();
  if(t==='users') loadAdminUsers();
  if(t==='backups') loadBackupSummary();
  if(t==='whatsapp'){renderWaSingleWorkerOptions();previewWhatsappSingle();previewWhatsappBulk();loadWhatsappInbox();loadWhatsappLogs();}
}

function toast(type,text){const el=document.getElementById("toast");el.className="message-toast show "+type;el.innerHTML=text;setTimeout(()=>{el.className="message-toast";el.innerHTML=""},3500)}
async function fetchJson(urls){for(const u of urls){try{const r=await fetch(u,{credentials:"include"});if(r.status===401){showLogin();return []}if(r.ok)return await r.json()}catch(e){}}return []}
function arr(d){if(Array.isArray(d))return d;for(const k of["data","workers","sanaieya","trades","crafts","areas","items"])if(d&&Array.isArray(d[k]))return d[k];return[]}
function itemName(i){if(typeof i==="string")return i;return i.name||i.title||i.trade||i.craft||i.area||i.location||""}
function itemId(i){if(typeof i==="string")return i;return i.id||i._id||i.name||i.title||""}

async function loadAllData(){
  applyPermissionUI();
  const grid=document.getElementById("adminWorkersGrid");
  if(grid)grid.innerHTML='<div class="empty-admin" style="grid-column:1/-1">جاري تحميل لوحة الإدارة بسرعة...</div>';
  await Promise.all([loadTrades(),loadAreas(),loadWorkers(),loadNotifications()]);
  buildRatingMaps();
  fillTradeSelects();
  fillAreaSelects();
  renderWorkers(allWorkers);
  stats();
}

async function loadWorkers(){allWorkers=arr(await fetchJson(["/api/admin/workers?limit=1000","/api/admin/workers","/api/workers/all"]))}
async function loadTrades(){allTrades=arr(await fetchJson(["/api/trades","/api/crafts","/trades","/crafts"]));renderTrades();fillTradeSelects()}
async function loadAreas(){allAreas=arr(await fetchJson(["/api/areas","/api/locations","/areas","/locations"]));renderAreas();fillAreaSelects()}
async function loadPhotosForAll(){photosByWorker={}}
async function loadWorkerPhotos(id){if(!id)return;photosByWorker[id]=arr(await fetchJson(["/api/workers/"+id+"/photos"]));filterAdminWorkers();}

function fillTradeSelects(){const f=document.getElementById("adminTradeFilter"),e=document.getElementById("editTrade");if(!f||!e)return;f.innerHTML='<option value="">كل الحرف</option>';e.innerHTML='<option value="">اختر الحرفة</option>';allTrades.forEach(i=>{const name=itemName(i);if(name){f.innerHTML+=`<option value="${name}">${name}</option>`;e.innerHTML+=`<option value="${name}">${name}</option>`}})}
function fillAreaSelects(){const e=document.getElementById("editArea"),f=document.getElementById("adminAreaFilter");if(e)e.innerHTML='<option value="">اختر المنطقة</option>';if(f)f.innerHTML='<option value="">كل المناطق</option>';allAreas.forEach(i=>{const name=itemName(i);if(!name)return;if(e)e.innerHTML+=`<option value="${name}">${name}</option>`;if(f)f.innerHTML+=`<option value="${name}">${name}</option>`;});}

function wid(w){return w.id||w._id||w.worker_id}
function wname(w){return w.name||w.full_name||w.worker_name||"صنايعي"}
function wphone(w){return w.phone||w.mobile||w.phone_number||""}
function wwhatsapp(w){return w.whatsapp||w.whatsapp_number||w.whats||""}
function wtrade(w){return w.trade||w.craft||w.job||w.profession||w.trade_name||"غير محدد"}
function warea(w){return w.area||w.location||w.region||w.area_name||"غير محدد"}
function wdesc(w){return w.description||w.about||w.notes||""}
function wreg(w){return w.registration_code||w.registrationCode||""}
function makeLocalRegistrationCode(w){const id=wid(w);if(!id)return "غير محدد";const d=new Date(w.created_at||Date.now());const y=isNaN(d.getTime())?new Date().getFullYear():d.getFullYear();return "SN-"+y+"-"+String(id).padStart(5,"0")}
function registrationCodeText(w){return wreg(w)||makeLocalRegistrationCode(w)}
function wimg(w){const image=w.image||w.photo||w.image_url||w.photo_url||"";if(!image)return"/icons/default-worker-avatar.png";if(image.startsWith("http"))return image;if(image.startsWith("/uploads"))return image;if(image.startsWith("uploads"))return"/"+image;return"/uploads/"+image}

function adminPhoneKey(phone){let d=String(phone||"").replace(/[^0-9]/g,"");if(!d)return"";if(d.startsWith("0020"))d=d.slice(2);if(d.startsWith("20")&&d.length===12)d="0"+d.slice(2);if(d.length===10&&/^(10|11|12|15)/.test(d))d="0"+d;return d}
function workerPhoneKeys(w){return Array.from(new Set([adminPhoneKey(wphone(w)),adminPhoneKey(wwhatsapp(w))].filter(Boolean)))}
function findDuplicateWorkers(w){const id=String(wid(w));const keys=workerPhoneKeys(w);if(!keys.length)return[];return allWorkers.filter(o=>String(wid(o))!==id&&workerPhoneKeys(o).some(k=>keys.includes(k)))}
function renderDuplicateWarning(w){const dups=findDuplicateWorkers(w);if(!dups.length)return"";const names=dups.slice(0,3).map(x=>`${wname(x)} #${wid(x)}`).join("، ");const more=dups.length>3?` +${dups.length-3} آخرين`:"";return `<div class="duplicate-warning"><i class="fa-solid fa-triangle-exclamation"></i> تنبيه: يوجد صنايعي آخر بنفس الهاتف أو الواتساب: ${names}${more}</div>`}

function ok(v){return v===1||v===true||v==="1"||v==="true"||v==="approved"||v==="active"}
function isApproved(w){return ok(w.approved??w.is_approved??w.visible??0)}
function isActive(w){return ok(w.active??w.is_active??w.status??1)}
function isFeatured(w){return ok(w.featured??w.is_featured??w.special??0)}
function formatDate(x){if(!x)return"غير محدد";const d=new Date(x);return isNaN(d.getTime())?"غير محدد":d.toLocaleDateString("ar-EG",{year:"numeric",month:"long",day:"numeric"})}
function daysLeft(w){const end=w.subscription_end||w.subscriptionEnd||w.end_date;if(!end)return null;const t=new Date(),e=new Date(end);t.setHours(0,0,0,0);e.setHours(0,0,0,0);if(isNaN(e.getTime()))return null;return Math.ceil((e-t)/(86400000))}
function subInfo(w){const d=daysLeft(w);let cls="sub-active",icon="fa-circle-check",text="الاشتراك شغال";if(d===null){cls="sub-soon";icon="fa-circle-question";text="لم يتم تحديد نهاية الاشتراك"}else if(d<0){cls="sub-expired";icon="fa-circle-xmark";text="الاشتراك منتهي"}else if(d===0){cls="sub-soon";icon="fa-triangle-exclamation";text="ينتهي اليوم"}else if(d<=7){cls="sub-soon";icon="fa-triangle-exclamation";text=`قرب ينتهي - متبقي ${d} يوم`}else{text=`شغال - متبقي ${d} يوم`}return{start:w.subscription_start||"",end:w.subscription_end||"",daysLeft:d,cls,icon,text}}

function stats(){
  const total = allWorkers.length;
  const approved = allWorkers.filter(isApproved).length;
  const pending = total - approved;
  document.getElementById("totalCount").textContent=total;
  document.getElementById("approvedCount").textContent=approved;
  document.getElementById("pendingCount").textContent=pending;
  document.getElementById("featuredCount").textContent=allWorkers.filter(isFeatured).length;
  const notifyPending = document.getElementById("notifyPendingWorkers");
  if(notifyPending) notifyPending.textContent = pending;
  const pendingReviews = allReviews.filter(r=>!ok(r.approved)).length;
  const pendingEl=document.getElementById("pendingReviewsCount");
  if(pendingEl) pendingEl.textContent=pendingReviews;
}

function imgPath(image){if(!image)return"";if(image.startsWith("http"))return image;if(image.startsWith("/uploads"))return image;if(image.startsWith("uploads"))return"/"+image;return"/uploads/"+image}
function renderPhotoAdmin(id){if(photosByWorker[id]===undefined)return`<div class="no-photos"><button class="action-btn btn-blue" onclick="event.stopPropagation();loadWorkerPhotos('${id}')"><i class="fa-solid fa-images"></i> تحميل صور الأعمال عند الحاجة</button></div>`;const photos=photosByWorker[id]||[];if(!photos.length)return'<div class="no-photos">لا توجد صور أعمال مضافة</div>';return`<div class="work-admin-gallery">${photos.map(p=>`<div class="work-admin-photo"><img loading="lazy" decoding="async" src="${imgPath(p.image)}">${can("workers:update")?`<button onclick="deleteWorkPhoto(event,'${p.id}')">×</button>`:""}</div>`).join("")}</div>`}

function hasIdentityDocs(w){return !!(w.id_front_path&&w.id_back_path)}
function identityStatusValue(w){return String(w.identity_status||w.verification_status||(ok(w.identity_verified)?"verified":"pending")).trim()||"pending"}
function identityStatusLabel(v){return {pending:"بانتظار المراجعة",verified:"تم التحقق",rejected:"مرفوض",needs_data:"يحتاج تعديل بيانات",needs_id_reupload:"إعادة رفع البطاقة"}[v]||"بانتظار المراجعة"}
function identityStatusClass(v){return {pending:"status-yellow",verified:"status-green",rejected:"status-red",needs_data:"status-blue",needs_id_reupload:"status-red"}[v]||"status-yellow"}
function identityStatusIcon(v){return {pending:"fa-clock",verified:"fa-circle-check",rejected:"fa-circle-xmark",needs_data:"fa-pen-to-square",needs_id_reupload:"fa-id-card"}[v]||"fa-clock"}
function identityReason(w){return w.identity_rejection_reason||w.identity_reason||w.rejection_reason||""}
function identityNote(w){return w.identity_review_note||w.identity_admin_note||""}
function renderIdentityDocsAdmin(w){const id=wid(w),docsOk=hasIdentityDocs(w),status=identityStatusValue(w),reason=identityReason(w),note=identityNote(w);return `<div class="subscription-box"><strong><i class="fa-solid fa-id-card"></i> مستندات التحقق</strong><div class="status-row"><span class="status-badge ${docsOk?'status-green':'status-red'}">${docsOk?'تم رفع وجه وظهر البطاقة':'البطاقة غير مكتملة'}</span><span class="status-badge ${identityStatusClass(status)}"><i class="fa-solid ${identityStatusIcon(status)}"></i>${identityStatusLabel(status)}</span></div>${reason?`<div class="verification-note"><strong>السبب:</strong> ${reason}</div>`:""}${note?`<span class="verification-small">ملاحظة إدارية: ${note}</span>`:""}<div class="card-actions">${w.id_front_path?`<button class="action-btn btn-blue" onclick="openIdentityDoc('${id}','front')"><i class="fa-solid fa-address-card"></i> عرض وجه البطاقة</button>`:''}${w.id_back_path?`<button class="action-btn btn-blue" onclick="openIdentityDoc('${id}','back')"><i class="fa-solid fa-id-card-clip"></i> عرض ظهر البطاقة</button>`:''}<button class="action-btn btn-dark" onclick="openIdentityReviewModal('${id}')"><i class="fa-solid fa-shield-halved"></i> مراجعة التحقق</button></div></div>`}

// ======================================================
// نظام إدارة الصنايعية الموحد (V8)
// ======================================================
function esc(v){ return String(v ?? "").replace(/[&<>"']/g, c => ({"&":"&amp;","<":"&lt;",">":"&gt;", '"':"&quot;", "'":"&#39;"}[c] || c)); }
window.resolveWorkerFromButton = function(btn){
  const card = btn && btn.closest ? btn.closest('.admin-worker-card') : null;
  const candidates = [btn && btn.dataset ? btn.dataset.workerId : '', card && card.dataset ? card.dataset.workerCardId : ''].filter(Boolean);
  for(const token of candidates){
    const raw = String(token || '').trim();
    const found = allWorkers.find(w => String(wid(w)) === raw);
    if(found) return found;
  }
  return null;
};

function closeForceModal(){ const old=document.getElementById('adminActionForceModalV8'); if(old) old.remove(); document.body.style.overflow=''; document.documentElement.style.overflow=''; }
window.closeAdminActionForceModalV8 = closeForceModal;

function openForceModal(title, bodyHtml){
  closeForceModal();
  const wrap=document.createElement('div');
  wrap.id='adminActionForceModalV8'; wrap.dir='rtl';
  wrap.style.cssText='position:fixed;inset:0;z-index:2147483647;background:rgba(15,23,42,.72);display:flex;align-items:center;justify-content:center;padding:16px;font-family:Cairo,sans-serif;';
  wrap.innerHTML = `<div style="width:min(820px,100%);max-height:92vh;overflow:auto;background:#fff;border-radius:28px;box-shadow:0 30px 90px rgba(15,23,42,.35);padding:24px;border:1px solid #e5e7eb;"><div style="display:flex;align-items:center;justify-content:space-between;gap:12px;margin-bottom:18px;"><h2 style="margin:0;font-size:24px;color:#0f172a;font-weight:900;">${esc(title)}</h2><button type="button" onclick="closeAdminActionForceModalV8()" style="width:46px;height:46px;border:0;border-radius:14px;background:#f1f5f9;color:#0f172a;font-size:22px;cursor:pointer;font-weight:900;">×</button></div>${bodyHtml}</div>`;
  wrap.addEventListener('mousedown', function(e){ if(e.target===wrap) closeForceModal(); });
  document.body.appendChild(wrap); document.body.style.overflow='hidden'; document.documentElement.style.overflow='hidden';
}

function workerSummary(w){ return `<div style="background:#f8fafc;border:1px solid #e5e7eb;border-radius:18px;padding:14px;margin-bottom:16px;"><strong style="display:block;font-size:20px;color:#0f172a;">${esc(wname(w))}</strong><span style="display:block;color:#64748b;font-weight:800;margin-top:5px;">${esc(wtrade(w))} - ${esc(warea(w))} | اتصال: ${esc(wphone(w)||'غير متاح')} | واتساب: ${esc(wwhatsapp(w)||wphone(w)||'غير متاح')}</span></div>`; }

const cssField = 'display:grid;gap:7px;';
const cssInput = 'width:100%;border:1px solid #e5e7eb;outline:none;background:#f8fafc;border-radius:16px;padding:13px;font-weight:800;font-family:inherit;box-sizing:border-box;';
const cssGrid = 'display:grid;grid-template-columns:1fr 1fr;gap:14px;';
const cssBtn = 'border:0;border-radius:999px;padding:13px 20px;font-weight:900;cursor:pointer;font-family:inherit;';

function selectOptions(list, current){
  const seen = new Set();
  let out = `<option value="${esc(current||'')}">${esc(current||'اختر')}</option>`;
  (Array.isArray(list)?list:[]).forEach(i=>{
    const n = itemName(i);
    if(!n || seen.has(n)) return;
    seen.add(n);
    out += `<option value="${esc(n)}" ${n===current?'selected':''}>${esc(n)}</option>`;
  });
  return out;
}

function openEdit(w){
  const id=String(wid(w));
  openForceModal('تعديل بيانات الصنايعي', `${workerSummary(w)}
    <form id="forceEditFormV8">
      <div style="${cssGrid}">
        <label style="${cssField}"><b>الاسم</b><input id="v8_name" value="${esc(wname(w))}" required style="${cssInput}"></label>
        <label style="${cssField}"><b>رقم الاتصال</b><input id="v8_phone" value="${esc(wphone(w))}" required style="${cssInput}"></label>
        <label style="${cssField}"><b>رقم الواتساب</b><input id="v8_whatsapp" value="${esc(wwhatsapp(w))}" placeholder="اتركه فارغًا لو نفس رقم الاتصال" style="${cssInput}"></label>
        <label style="${cssField}"><b>الحرفة</b><select id="v8_trade" style="${cssInput}">${selectOptions(allTrades,wtrade(w))}</select></label>
        <label style="${cssField}"><b>المنطقة</b><select id="v8_area" style="${cssInput}">${selectOptions(allAreas,warea(w))}</select></label>
        <label style="${cssField};grid-column:1/-1"><b>الوصف</b><textarea id="v8_description" style="${cssInput};min-height:120px">${esc(wdesc(w))}</textarea></label>
      </div>
      <div style="display:flex;justify-content:flex-end;gap:10px;margin-top:18px;flex-wrap:wrap">
        <button type="button" onclick="closeAdminActionForceModalV8()" style="${cssBtn}background:#fee2e2;color:#991b1b;">إلغاء</button>
        <button type="submit" style="${cssBtn}background:#0f172a;color:#fff;">حفظ التعديل</button>
      </div>
    </form>`);
  document.getElementById('forceEditFormV8').onsubmit = async function(e){
    e.preventDefault();
    const body={name:v8_name.value.trim(),phone:v8_phone.value.trim(),whatsapp:v8_whatsapp.value.trim(),trade:v8_trade.value.trim(),area:v8_area.value.trim(),description:v8_description.value.trim()};
    try{
      const btn=e.submitter; if(btn){btn.disabled=true;btn.textContent='جاري الحفظ...';}
      const r=await fetch('/api/workers/'+id,{method:'PUT',credentials:'include',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)});
      const d=await r.json().catch(()=>({}));
      if(!r.ok || d.success===false) throw new Error(d.error||'فشل تعديل البيانات');
      toast('success','تم تعديل بيانات الصنايعي'); closeForceModal(); loadAllData();
    }catch(ex){ toast('error', ex.message||'فشل تعديل البيانات'); }
  };
}

function openIdentity(w){
  const id=String(wid(w));
  const st=identityStatusValue(w);
  openForceModal('مراجعة تحقق الصنايعي', `${workerSummary(w)}
    <form id="forceIdentityFormV8">
      <div style="${cssGrid}">
        <label style="${cssField}"><b>حالة التحقق</b><select id="v8_identity_status" style="${cssInput}">
          <option value="pending" ${st==='pending'?'selected':''}>بانتظار المراجعة</option>
          <option value="verified" ${st==='verified'?'selected':''}>تم التحقق والاعتماد</option>
          <option value="rejected" ${st==='rejected'?'selected':''}>مرفوض</option>
          <option value="needs_data" ${st==='needs_data'?'selected':''}>يحتاج تعديل بيانات</option>
          <option value="needs_id_reupload" ${st==='needs_id_reupload'?'selected':''}>إعادة رفع البطاقة</option>
        </select></label>
        <label style="${cssField}"><b>سبب مختصر للصنايعي</b><input id="v8_identity_reason" value="${esc(identityReason(w))}" style="${cssInput}"></label>
        <label style="${cssField};grid-column:1/-1"><b>ملاحظة إدارية داخلية</b><textarea id="v8_identity_note" style="${cssInput};min-height:110px">${esc(identityNote(w))}</textarea></label>
      </div>
      <div style="background:#fef3c7;color:#92400e;border:1px solid #fde68a;border-radius:16px;padding:12px;margin-top:14px;font-weight:900;">يمكن اعتماد الصنايعي حتى لو لم يرفع وجه وظهر البطاقة. التسجيل الجديد ما زال يشترط رفع البطاقة.</div>
      <div style="display:flex;justify-content:flex-end;gap:10px;margin-top:18px;flex-wrap:wrap">
        <button type="button" onclick="closeAdminActionForceModalV8()" style="${cssBtn}background:#fee2e2;color:#991b1b;">إلغاء</button>
        <button type="submit" style="${cssBtn}background:#2563eb;color:#fff;">حفظ قرار التحقق</button>
      </div>
    </form>`);
  document.getElementById('forceIdentityFormV8').onsubmit = async function(e){
    e.preventDefault();
    const body={identity_status:v8_identity_status.value,reason:v8_identity_reason.value.trim(),note:v8_identity_note.value.trim()};
    try{
      const btn=e.submitter; if(btn){btn.disabled=true;btn.textContent='جاري الحفظ...';}
      const r=await fetch('/api/admin/workers/'+id+'/identity-review',{method:'PUT',credentials:'include',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)});
      const d=await r.json().catch(()=>({}));
      if(!r.ok || d.success===false) throw new Error(d.error||'فشل حفظ قرار التحقق');
      toast('success','تم حفظ قرار التحقق'); closeForceModal(); loadAllData();
    }catch(ex){ toast('error', ex.message||'فشل حفظ قرار التحقق'); }
  };
}

function openRenew(w){
  const id=String(wid(w));
  const sub=subInfo(w);
  openForceModal('الاشتراك والتجديد', `${workerSummary(w)}
    <div style="background:#f8fafc;border:1px solid #e5e7eb;border-radius:16px;padding:12px;margin-bottom:14px;font-weight:900;color:#475569;">نهاية الاشتراك الحالية: ${esc(formatDate(sub.end))}</div>
    <form id="forceRenewFormV8">
      <div style="${cssGrid}">
        <label style="${cssField}"><b>الباقة</b><select id="v8_renew_plan" style="${cssInput}"><option value="month">شهر - 100 جنيه</option><option value="half">نصف سنة - 600 جنيه</option><option value="year">سنة - 1200 جنيه</option><option value="custom">مخصص</option></select></label>
        <label style="${cssField}"><b>عدد الشهور</b><input id="v8_renew_months" type="number" min="1" max="60" value="1" required style="${cssInput}"></label>
        <label style="${cssField}"><b>المبلغ المدفوع</b><input id="v8_renew_amount" type="number" min="0" step="1" value="100" required style="${cssInput}"></label>
        <label style="${cssField}"><b>طريقة الدفع</b><select id="v8_renew_method" style="${cssInput}"><option value="cash">كاش</option><option value="vodafone_cash">فودافون كاش</option><option value="instapay">إنستاباي</option><option value="bank_transfer">تحويل بنكي</option><option value="free">مجاني / هدية</option><option value="other">أخرى</option></select></label>
        <label style="${cssField}"><b>حالة الدفع</b><select id="v8_renew_status" style="${cssInput}"><option value="paid">مدفوع</option><option value="pending">منتظر الدفع</option><option value="partial">مدفوع جزئيًا</option></select></label>
        <label style="${cssField};grid-column:1/-1"><b>ملاحظات الدفع</b><textarea id="v8_renew_note" style="${cssInput};min-height:100px"></textarea></label>
      </div>
      <div style="display:flex;justify-content:flex-end;gap:10px;margin-top:18px;flex-wrap:wrap">
        <button type="button" onclick="closeAdminActionForceModalV8()" style="${cssBtn}background:#fee2e2;color:#991b1b;">إلغاء</button>
        <button type="submit" style="${cssBtn}background:#0f172a;color:#fff;">حفظ التجديد</button>
      </div>
    </form>`);
  document.getElementById('v8_renew_plan').onchange=function(){ const p=this.value; const map={month:[1,100],half:[6,600],year:[12,1200],custom:[1,0]}; document.getElementById('v8_renew_months').value=map[p][0]; document.getElementById('v8_renew_amount').value=map[p][1]; };
  document.getElementById('forceRenewFormV8').onsubmit = async function(e){
    e.preventDefault();
    const body={plan:document.getElementById('v8_renew_plan').value,months:Number(document.getElementById('v8_renew_months').value)||1,amount:Number(document.getElementById('v8_renew_amount').value)||0,payment_method:document.getElementById('v8_renew_method').value,payment_status:document.getElementById('v8_renew_status').value,note:document.getElementById('v8_renew_note').value.trim()};
    try{
      const btn=e.submitter; if(btn){btn.disabled=true;btn.textContent='جاري الحفظ...';}
      const r=await fetch('/api/workers/'+id+'/renew',{method:'PUT',credentials:'include',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)});
      const d=await r.json().catch(()=>({}));
      if(!r.ok || d.success===false) throw new Error(d.error||'فشل تجديد الاشتراك');
      toast('success','تم تجديد الاشتراك'); closeForceModal(); loadAllData();
    }catch(ex){ toast('error', ex.message||'فشل تجديد الاشتراك'); }
  };
}

function openWhatsapp(w){
  const id=String(wid(w));
  const phone=wwhatsapp(w)||wphone(w);
  openForceModal('رسائل واتساب', `${workerSummary(w)}
    <label style="${cssField}"><b>نص الرسالة</b><textarea id="v8_wa_message" style="${cssInput};min-height:220px">${esc(buildWhatsAppTemplate('approved', w))}</textarea></label>
    <div style="background:#dcfce7;color:#166534;border:1px solid #bbf7d0;border-radius:16px;padding:12px;margin-top:14px;font-weight:900;line-height:1.8">الإرسال التلقائي يستخدم WhatsApp Cloud API. لو فشل بسبب نافذة المحادثة، استخدم زر فتح واتساب يدويًا.</div>
    <div style="display:flex;justify-content:flex-end;gap:10px;margin-top:18px;flex-wrap:wrap">
      <button type="button" id="v8_wa_auto" style="${cssBtn}background:#2563eb;color:#fff;">إرسال تلقائي</button>
      <button type="button" id="v8_wa_manual" style="${cssBtn}background:#dcfce7;color:#166534;">فتح واتساب يدويًا</button>
      <button type="button" onclick="closeAdminActionForceModalV8()" style="${cssBtn}background:#fee2e2;color:#991b1b;">إغلاق</button>
    </div>`);
  document.getElementById('v8_wa_manual').onclick=function(){ const num=adminWhatsAppNumber(phone); if(!num){toast('error','لا يوجد رقم واتساب صالح'); return;} window.open('https://wa.me/'+num+'?text='+encodeURIComponent(document.getElementById('v8_wa_message').value.trim()),'_blank'); };
  document.getElementById('v8_wa_auto').onclick=async function(){
    try{
      const msg=document.getElementById('v8_wa_message').value.trim(); if(!phone){toast('error','لا يوجد رقم واتساب');return;} if(!msg){toast('error','اكتب نص الرسالة');return;}
      this.disabled=true; this.textContent='جاري الإرسال...';
      const r=await fetch('/api/admin/whatsapp/send-worker',{method:'POST',credentials:'include',headers:{'Content-Type':'application/json'},body:JSON.stringify({worker_id:id,phone,message:msg,mode:'text',message_type:'admin_message'})});
      const d=await r.json().catch(()=>({}));
      if(!r.ok || d.success===false) throw new Error(d.error||'فشل إرسال واتساب');
      toast('success','تم إرسال واتساب تلقائيًا');
    }catch(ex){ toast('error', ex.message||'فشل إرسال واتساب'); }
    finally{ this.disabled=false; this.textContent='إرسال تلقائي'; }
  };
}

window.openIdentityReviewModal = function(id) { const w = allWorkers.find(x => String(wid(x)) === String(id)); if(w) openIdentity(w); };
window.openEditModal = function(id) { const w = allWorkers.find(x => String(wid(x)) === String(id)); if(w) openEdit(w); };
window.openRenewModal = function(id) { const w = allWorkers.find(x => String(wid(x)) === String(id)); if(w) openRenew(w); };
window.openWhatsAppModal = function(id) { const w = allWorkers.find(x => String(wid(x)) === String(id)); if(w) openWhatsapp(w); };

window.openIdentityDoc = async function(id, side){
  try{
    toast("success", "جاري تحميل الصورة...");
    const r=await fetch(`/api/admin/workers/${id}/id-card/${side}`,{credentials:"include"});
    const data=await r.json();
    if(r.status===401){ showLogin(); return;}
    if(!r.ok||!data.success) throw new Error(data.error||"تعذر فتح صورة البطاقة");
    openForceModal('صورة البطاقة (' + (side==='front'?'وجه':'ظهر') + ')', `<div style="text-align:center;"><img src="${esc(data.url)}" style="max-width:100%;max-height:60vh;object-fit:contain;border-radius:16px;border:1px solid #e5e7eb;"><br><br><a href="${esc(data.url)}" target="_blank" style="${cssBtn}background:#0f172a;color:#fff;text-decoration:none;display:inline-flex;align-items:center;gap:8px;margin-top:14px"><i class="fa-solid fa-arrow-up-right-from-square"></i> فتح في نافذة جديدة</a></div>`);
  }catch(e){ toast("error", e.message||"تعذر فتح صورة البطاقة"); }
};

window.adminWorkerCardActionDirectV7 = function(ev, btn){
  if(ev){ ev.preventDefault(); ev.stopPropagation(); }
  if(!btn) return false;
  
  const action = btn.dataset.workerAction || btn.dataset.adminWorkerAction;
  const worker = window.resolveWorkerFromButton(btn);
  
  if(!worker){ toast('error','تعذر تحديد الصنايعي. اضغط تحديث البيانات.'); return false; }
  
  const id = String(wid(worker));
  
  if(action === 'full' || action === 'edit') openEdit(worker);
  else if(action === 'identity') openIdentity(worker);
  else if(action === 'renew') openRenew(worker);
  else if(action === 'whatsapp') openWhatsapp(worker);
  else if(action === 'active') toggleActive(id, isActive(worker));
  else if(action === 'delete') deleteWorker(id);
  else if(action === 'approve') toggleApprove(id, isApproved(worker));
  
  return false;
};

document.addEventListener("click", function(ev){
  const btn = ev.target && ev.target.closest ? ev.target.closest("[data-worker-action], [data-admin-worker-action]") : null;
  if(btn) window.adminWorkerCardActionDirectV7(ev, btn);
}, true);

document.addEventListener('keydown', function(e){
  if(e.key === 'Escape') closeForceModal();
}, true);

function adminWorkerQuickButton(w){
  const id=adminActionsEscapeAttr(wid(w));
  const reg=adminActionsEscapeAttr(registrationCodeText(w));
  const phone=adminActionsEscapeAttr(wphone(w)||"");
  const wa=adminActionsEscapeAttr(wwhatsapp(w)||wphone(w)||"");
  
  const isActiveState = isActive(w);
  const activeText = isActiveState ? "إيقاف" : "تفعيل";
  const activeClass = isActiveState ? "btn-yellow" : "btn-green";
  const activeIcon = isActiveState ? "fa-power-off" : "fa-play";

  const common=`data-worker-id="${id}" data-worker-reg="${reg}" data-worker-phone="${phone}" data-worker-whatsapp="${wa}"`;
  
  return `<div class="admin-worker-actions-direct-v7">
    <div class="admin-worker-actions-direct-v7-head">
      <span><i class="fa-solid fa-screwdriver-wrench"></i> إجراءات الصنايعي</span><small>Direct V7</small>
    </div>
    <div class="admin-worker-actions-direct-v7-grid" style="grid-template-columns: repeat(auto-fit, minmax(110px, 1fr));">
      <button type="button" class="action-btn btn-dark" data-worker-action="edit" ${common}><i class="fa-solid fa-pen-to-square"></i> تعديل</button>
      <button type="button" class="action-btn btn-blue" data-worker-action="identity" ${common}><i class="fa-solid fa-shield-halved"></i> مراجعة</button>
      <button type="button" class="action-btn btn-yellow" data-worker-action="renew" ${common}><i class="fa-solid fa-credit-card"></i> تجديد</button>
      <button type="button" class="action-btn ${activeClass}" data-worker-action="active" ${common}><i class="fa-solid ${activeIcon}"></i> ${activeText}</button>
      <button type="button" class="action-btn btn-red" data-worker-action="delete" ${common}><i class="fa-solid fa-trash"></i> حذف نهائي</button>
    </div>
  </div>`;
}

function renderWorkers(workers){
  const grid=document.getElementById("adminWorkersGrid");
  grid.innerHTML="";
  if(!workers.length){grid.innerHTML='<div class="empty-admin" style="grid-column:1/-1">لا يوجد صنايعية للعرض حاليًا</div>';return}
  workers.forEach(w=>{
    const id=String(wid(w));
    const sub=subInfo(w),approved=isApproved(w),active=isActive(w),featured=isFeatured(w);
    const card=document.createElement("article");
    card.className="admin-worker-card";
    card.dataset.workerCardId=id;
    card.dataset.registrationCode=registrationCodeText(w);
    card.dataset.workerPhone=wphone(w)||"";
    card.dataset.workerWhatsapp=wwhatsapp(w)||"";
    card.innerHTML=`<img class="admin-worker-img" loading="lazy" decoding="async" src="${wimg(w)}" onerror="this.onerror=null;this.src='/icons/default-worker-avatar.png'"><div class="admin-worker-main"><h3>${wname(w)}</h3><div class="registration-code-badge"><i class="fa-solid fa-hashtag"></i>رقم الطلب: ${registrationCodeText(w)}</div>${renderAdminRating(id)}<div class="worker-tags"><span class="worker-tag"><i class="fa-solid fa-phone"></i>${wphone(w)||"لا يوجد اتصال"}</span><span class="worker-tag"><i class="fa-brands fa-whatsapp"></i>${wwhatsapp(w)||"نفس رقم الاتصال"}</span><span class="worker-tag"><i class="fa-solid fa-screwdriver-wrench"></i>${wtrade(w)}</span><span class="worker-tag"><i class="fa-solid fa-location-dot"></i>${warea(w)}</span></div>${renderDuplicateWarning(w)}<div class="status-row"><span class="status-badge ${approved?'status-green':'status-yellow'}">${approved?"موافق عليه":"بانتظار الموافقة"}</span><span class="status-badge ${identityStatusClass(identityStatusValue(w))}"><i class="fa-solid ${identityStatusIcon(identityStatusValue(w))}"></i>${identityStatusLabel(identityStatusValue(w))}</span><span class="status-badge ${active?'status-green':'status-red'}">${active?"نشط":"متوقف"}</span><span class="status-badge ${featured?'status-yellow':'status-blue'}">${featured?"مميز":"عادي"}</span></div><div class="subscription-box"><strong>بيانات الاشتراك</strong><div class="subscription-dates"><div class="subscription-date"><small>البداية</small><strong>${formatDate(sub.start)}</strong></div><div class="subscription-date"><small>النهاية</small><strong>${formatDate(sub.end)}</strong></div></div><span class="subscription-status ${sub.cls}"><i class="fa-solid ${sub.icon}"></i>${sub.text}</span></div><p>${wdesc(w)||"لا يوجد وصف."}</p>${renderIdentityDocsAdmin(w)}<div class="worker-card-photos-box"><strong><i class="fa-solid fa-images"></i> صور الأعمال</strong>${photosByWorker[id]!==undefined?renderPhotoAdmin(id):'<div class="no-photos"><button class="action-btn btn-blue" onclick="event.stopPropagation();loadWorkerPhotos(\''+id+'\')"><i class="fa-solid fa-images"></i> تحميل صور الأعمال عند الحاجة</button></div>'}</div>${adminWorkerQuickButton(w)}</div>`;
    grid.appendChild(card);
  });
}

function filterAdminWorkers(){
  const s=document.getElementById("adminSearch").value.trim().toLowerCase();
  const tf=document.getElementById("adminTradeFilter").value.trim().toLowerCase();
  const af=document.getElementById("adminAreaFilter").value.trim().toLowerCase();
  const sf=document.getElementById("adminStatusFilter").value;

  const filtered=allWorkers.filter(w=>{
    const search=wname(w).toLowerCase().includes(s)||wphone(w).toLowerCase().includes(s)||wwhatsapp(w).toLowerCase().includes(s)||wtrade(w).toLowerCase().includes(s)||warea(w).toLowerCase().includes(s)||wdesc(w).toLowerCase().includes(s)||registrationCodeText(w).toLowerCase().includes(s);
    const trade=!tf||wtrade(w).toLowerCase()===tf;
    const area=!af||warea(w).toLowerCase()===af;

    let status=true;
    if(sf==="approved")status=isApproved(w);
    if(sf==="pending")status=!isApproved(w);
    if(sf==="active")status=isActive(w);
    if(sf==="inactive")status=!isActive(w);
    if(sf==="featured")status=isFeatured(w);
    if(sf==="identity_pending")status=identityStatusValue(w)==="pending";
    if(sf==="identity_verified")status=identityStatusValue(w)==="verified";
    if(sf==="identity_rejected")status=identityStatusValue(w)==="rejected";
    if(sf==="identity_needs_data")status=identityStatusValue(w)==="needs_data";
    if(sf==="identity_needs_id_reupload")status=identityStatusValue(w)==="needs_id_reupload";

    const sub=subInfo(w);
    if(sf==="sub_active")status=sub.daysLeft===null||sub.daysLeft>=0;
    if(sf==="sub_soon")status=sub.daysLeft!==null&&sub.daysLeft>=0&&sub.daysLeft<=7;
    if(sf==="sub_expired")status=sub.daysLeft!==null&&sub.daysLeft<0;

    return search&&trade&&area&&status;
  });

  renderWorkers(sortAdminWorkers(filtered));
}
function clearAdminFilters(){
  document.getElementById("adminSearch").value="";
  document.getElementById("adminTradeFilter").value="";
  document.getElementById("adminAreaFilter").value="";
  document.getElementById("adminStatusFilter").value="";
  document.getElementById("adminSortFilter").value="default";
  renderWorkers(allWorkers);
}
async function reqs(list){for(const r of list){try{const opt={method:r.method||"POST",credentials:"include",headers:{"Content-Type":"application/json"}};if(r.body)opt.body=JSON.stringify(r.body);const res=await fetch(r.url,opt);if(res.status===401){showLogin();return false}if(res.status===403){const d=await res.json().catch(()=>({}));toast("error",d.error||"ليس لديك صلاحية");return false}if(res.ok)return true}catch(e){}}return false}
function after(ok,msg){if(ok){toast("success",msg);loadAllData()}else toast("error","لم يتم تنفيذ الأمر")}
async function toggleApprove(id,c){after(await reqs([{url:`/api/workers/${id}/approve`,method:"PUT",body:{approved:c?0:1}}]),"تم تحديث الموافقة")}
async function toggleActive(id,c){after(await reqs([{url:`/api/workers/${id}/active`,method:"PUT",body:{active:c?0:1}}]),"تم تحديث التفعيل")}
async function toggleFeatured(id,c){after(await reqs([{url:`/api/workers/${id}/featured`,method:"PUT",body:{featured:c?0:1}}]),"تم تحديث التمييز")}
async function deleteWorker(id){if(!confirm("هل أنت متأكد من الحذف النهائي للصنايعي؟ لا يمكن التراجع!"))return;after(await reqs([{url:`/api/workers/${id}`,method:"DELETE"}]),"تم حذف الصنايعي نهائياً")}
async function deleteWorkPhoto(e,id){e.stopPropagation();if(!confirm("حذف صورة العمل؟"))return;after(await reqs([{url:`/api/workers/photos/${id}`,method:"DELETE"}]),"تم حذف الصورة")}

async function renewAllWorkers() {
    const monthsInput = prompt("كم عدد الشهور التي تريد إضافتها لكل الصنايعية؟", "1");
    if (!monthsInput) return;
    const months = parseInt(monthsInput);
    if (isNaN(months) || months <= 0) {
        toast("error", "الرجاء إدخال عدد صحيح صالح.");
        return;
    }

    if (!confirm(`هل أنت متأكد أنك تريد تجديد اشتراك جميع الصنايعية بزيادة ${months} شهر؟`)) return;

    try {
        const response = await fetch('/api/admin/workers/renew-all', {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ months: months })
        });

        const result = await response.json();
        if (response.ok && result.success) {
            toast("success", result.message);
            loadAllData();
        } else {
            toast("error", 'فشل التجديد الجماعي: ' + (result.error || 'خطأ غير معروف'));
        }
    } catch (err) {
        console.error(err);
        toast("error", 'حدث خطأ في الاتصال بالسيرفر.');
    }
}

function renderTrades(){const list=document.getElementById("tradesList");list.innerHTML=allTrades.length?allTrades.map(i=>`<div class="list-item"><strong>${itemName(i)}</strong><button class="action-btn btn-red" onclick="deleteTrade('${itemId(i)}')">حذف</button></div>`).join(""):'<div class="empty-admin">لا توجد حرف</div>'}
async function addTrade(e){e.preventDefault();const input=document.getElementById("newTradeInput"),name=input.value.trim();if(!name)return toast("error","اكتب اسم الحرفة");const ok=await reqs([{url:"/api/trades",method:"POST",body:{name}}]);if(ok){input.value="";await loadTrades();toast("success","تمت إضافة الحرفة")}else toast("error","لم تتم الإضافة")}
async function deleteTrade(id){if(!confirm("حذف الحرفة؟"))return;const ok=await reqs([{url:`/api/trades/${id}`,method:"DELETE"}]);if(ok){await loadTrades();toast("success","تم حذف الحرفة")}else toast("error","لم يتم الحذف")}
function renderAreas(){const list=document.getElementById("areasList");list.innerHTML=allAreas.length?allAreas.map(i=>`<div class="list-item"><strong>${itemName(i)}</strong><button class="action-btn btn-red" onclick="deleteArea('${itemId(i)}')">حذف</button></div>`).join(""):'<div class="empty-admin">لا توجد مناطق</div>'}
async function addArea(e){e.preventDefault();const input=document.getElementById("newAreaInput"),name=input.value.trim();if(!name)return toast("error","اكتب اسم المنطقة");const ok=await reqs([{url:"/api/areas",method:"POST",body:{name}}]);if(ok){input.value="";await loadAreas();toast("success","تمت إضافة المنطقة")}else toast("error","لم تتم الإضافة")}
async function deleteArea(id){if(!confirm("حذف المنطقة؟"))return;const ok=await reqs([{url:`/api/areas/${id}`,method:"DELETE"}]);if(ok){await loadAreas();toast("success","تم حذف المنطقة")}else toast("error","لم يتم الحذف")}

async function loadReviewsAdmin(){allReviews = arr(await fetchJson(["/api/admin/reviews"]));buildRatingMaps();}
function renderReviewStars(value){const rating = Math.round(Number(value) || 0);return "★★★★★".slice(0, rating) + "☆☆☆☆☆".slice(0, 5 - rating);}
function buildRatingMaps(){
  ratingsByWorker={}; pendingReviewsByWorker={};
  allWorkers.forEach(w=>{const id=String(wid(w));ratingsByWorker[id]={average:0,count:0};pendingReviewsByWorker[id]=0;});
  const approvedGroups={};
  allReviews.forEach(r=>{
    const workerId=String(r.worker_id);
    if(!pendingReviewsByWorker[workerId]) pendingReviewsByWorker[workerId]=0;
    if(ok(r.approved)){
      if(!approvedGroups[workerId]) approvedGroups[workerId]=[];
      approvedGroups[workerId].push(Number(r.rating)||0);
    }else{
      pendingReviewsByWorker[workerId]=(pendingReviewsByWorker[workerId]||0)+1;
    }
  });
  Object.keys(approvedGroups).forEach(workerId=>{
    const list=approvedGroups[workerId];
    const sum=list.reduce((a,b)=>a+b,0);
    ratingsByWorker[workerId]={average: list.length ? Math.round((sum/list.length)*10)/10 : 0,count: list.length};
  });
}
function renderReviews(){
  const grid = document.getElementById("reviewsGrid"); if(!grid) return;
  const searchEl = document.getElementById("reviewSearch"); const statusEl = document.getElementById("reviewStatusFilter");
  const search = searchEl ? searchEl.value.trim().toLowerCase() : ""; const status = statusEl ? statusEl.value : "";
  const filtered = allReviews.filter(r => {
    const text = [r.customer_name,r.comment,r.worker_name,r.worker_trade,r.worker_area].join(" ").toLowerCase();
    let statusOk = true;
    if(status === "pending") statusOk = !ok(r.approved);
    if(status === "approved") statusOk = ok(r.approved);
    return text.includes(search) && statusOk;
  });
  grid.innerHTML = "";
  if(!filtered.length){grid.innerHTML = '<div class="empty-admin" style="grid-column:1/-1">لا توجد تقييمات للعرض حاليًا</div>';return;}
  filtered.forEach(r => {
    const approved = ok(r.approved);
    const card = document.createElement("div"); card.className = "review-admin-card";
    card.innerHTML = `<div class="review-admin-head"><div><h3>${r.worker_name || "صنايعي محذوف"}</h3><div class="worker-tags"><span class="worker-tag"><i class="fa-solid fa-user"></i>${r.customer_name || "عميل"}</span><span class="worker-tag"><i class="fa-solid fa-screwdriver-wrench"></i>${r.worker_trade || "غير محدد"}</span><span class="worker-tag"><i class="fa-solid fa-location-dot"></i>${r.worker_area || "غير محدد"}</span></div></div><span class="status-badge ${approved ? "status-green" : "status-yellow"}">${approved ? "معتمد" : "بانتظار الموافقة"}</span></div><div class="review-stars">${renderReviewStars(r.rating)}</div><div class="review-comment">${r.comment || ""}</div><div class="card-actions"><button class="action-btn ${approved ? "btn-yellow" : "btn-green"}" onclick="toggleReviewApprove('${r.id}', ${approved})">${approved ? "إلغاء الموافقة" : "موافقة"}</button><button class="action-btn btn-red" onclick="deleteReview('${r.id}')">حذف</button></div>`;
    grid.appendChild(card);
  });
}
async function toggleReviewApprove(id, current){const approved = current ? 0 : 1;const okReq = await reqs([{url:`/api/reviews/${id}/approve`,method:"PUT",body:{approved}}]);if(okReq){toast("success","تم تحديث حالة التقييم");await loadReviewsAdmin();renderReviews();}else{toast("error","لم يتم تحديث التقييم");}}
async function deleteReview(id){if(!confirm("هل تريد حذف هذا التقييم؟")) return;const okReq = await reqs([{url:`/api/reviews/${id}`,method:"DELETE"}]);if(okReq){toast("success","تم حذف التقييم");await loadReviewsAdmin();renderReviews();}else{toast("error","لم يتم حذف التقييم");}}

function downloadBackup(){return downloadFullBackup()}
function adminHtmlEscape(v){return String(v??"").replace(/[&<>"]/g,function(c){return {"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;"}[c]})}
function reportTypeLabel(t){return {wrong_phone:"رقم غير صحيح",wrong_data:"بيانات خاطئة",bad_service:"سوء خدمة",inappropriate_photos:"صور غير مناسبة",other:"أخرى"}[t]||t||"غير محدد"}
function reportStatusLabel(s){return {new:"جديد",reviewing:"قيد المراجعة",resolved:"تم الحل",rejected:"مرفوض"}[s]||s||"غير محدد"}
function reportStatusClass(s){return {new:"report-new",reviewing:"report-reviewing",resolved:"report-resolved",rejected:"report-rejected"}[s]||"report-new"}
function reportDate(v){try{return v?new Date(v).toLocaleString("ar-EG"):"—"}catch(e){return v||"—"}}
async function loadReports(){
  if(!can("reports:read"))return;
  const box=document.getElementById("reportsList"); if(box)box.innerHTML='<div class="empty-state">جاري تحميل البلاغات...</div>';
  try{
    const r=await fetch("/api/admin/reports",{credentials:"include"});
    const d=await r.json().catch(()=>({}));
    if(!r.ok||!d.success)throw new Error(d.error||"تعذر تحميل البلاغات");
    adminReports=d.items||[]; renderReports(d.stats||{});
  }catch(e){if(box)box.innerHTML=`<div class="empty-state">${adminHtmlEscape(e.message||"تعذر تحميل البلاغات")}</div>`;}
}
function renderReportStats(stats){
  const s=stats||{}; const total=s.total ?? adminReports.length; const n=s.new ?? adminReports.filter(r=>r.status==='new').length; const rev=s.reviewing ?? adminReports.filter(r=>r.status==='reviewing').length; const res=s.resolved ?? adminReports.filter(r=>r.status==='resolved').length;
  const box=document.getElementById("reportsStats"); if(!box)return;
  box.innerHTML=`<div class="stat-card"><strong>${total}</strong><span>إجمالي البلاغات</span></div><div class="stat-card"><strong>${n}</strong><span>جديد</span></div><div class="stat-card"><strong>${rev}</strong><span>قيد المراجعة</span></div><div class="stat-card"><strong>${res}</strong><span>تم الحل</span></div>`;
}
function renderReports(stats){
  renderReportStats(stats); const box=document.getElementById("reportsList"); if(!box)return;
  const filter=document.getElementById("reportsStatusFilter")?.value||"all";
  const rows=(adminReports||[]).filter(r=>filter==='all'||r.status===filter);
  if(!rows.length){box.innerHTML='<div class="empty-state">لا توجد بلاغات بهذه الحالة.</div>';return}
  box.innerHTML=rows.map(r=>{
    const w=r.worker||{}; const workerName=adminHtmlEscape(w.name||r.worker_snapshot?.name||`صنايعي رقم ${r.worker_id||""}`);
    const tradeArea=[w.trade||r.worker_snapshot?.trade,w.area||r.worker_snapshot?.area].filter(Boolean).map(adminHtmlEscape).join(" - ");
    const reporter=[r.reporter_name,r.reporter_phone].filter(Boolean).map(adminHtmlEscape).join(" - ")||"غير مذكور";
    const canManage=can("reports:manage");
    return `<div class="report-card"><div class="report-card-header"><div><div class="report-title">${workerName}</div><div style="color:var(--muted);font-weight:800;margin-top:4px">${tradeArea||"بيانات الصنايعي غير متاحة"}</div></div><span class="report-status ${reportStatusClass(r.status)}"><i class="fa-solid fa-circle"></i> ${reportStatusLabel(r.status)}</span></div><div class="report-meta"><span class="small-badge"><i class="fa-solid fa-triangle-exclamation"></i> ${reportTypeLabel(r.report_type)}</span><span class="small-badge"><i class="fa-solid fa-clock"></i> ${reportDate(r.created_at)}</span><span class="small-badge"><i class="fa-solid fa-user"></i> ${reporter}</span></div><div class="report-message">${adminHtmlEscape(r.message||"")}</div>${r.admin_note?`<div class="report-message"><strong>ملاحظة الإدارة:</strong><br>${adminHtmlEscape(r.admin_note)}</div>`:""}<div class="report-actions">${r.worker_id?`<a class="action-btn btn-dark" href="/worker/${encodeURIComponent(r.worker_id)}" target="_blank"><i class="fa-solid fa-arrow-up-right-from-square"></i> فتح صفحة الصنايعي</a>`:""}${canManage?`<button class="action-btn btn-blue" onclick="updateReportStatus('${r.id}','reviewing')">قيد المراجعة</button><button class="action-btn btn-green" onclick="updateReportStatus('${r.id}','resolved')">تم الحل</button><button class="action-btn btn-yellow" onclick="updateReportStatus('${r.id}','rejected')">رفض البلاغ</button>`:""}</div>`;
  }).join("");
}
async function updateReportStatus(reportId,status){
  if(!can("reports:manage")){toast("error","ليس لديك صلاحية تعديل البلاغات");return}
  const note=prompt("اكتب ملاحظة الإدارة للبلاغ، ويمكن تركها فارغة:")||"";
  try{
    const r=await fetch(`/api/admin/reports/${encodeURIComponent(reportId)}`,{method:"PUT",credentials:"include",headers:{"Content-Type":"application/json"},body:JSON.stringify({status,admin_note:note})});
    const d=await r.json().catch(()=>({}));
    if(!r.ok||!d.success)throw new Error(d.error||"تعذر تحديث البلاغ");
    toast("success","تم تحديث البلاغ"); await loadReports();
  }catch(e){toast("error",e.message||"تعذر تحديث البلاغ")}
}

function backupMsg(text,show=true){const el=document.getElementById("backupMessage");if(!el)return;if(!show){el.style.display="none";el.textContent="";return}el.textContent=text;el.style.display="block"}
function requireBackupPermission(){if(!can("backup:export")){toast("error","ليس لديك صلاحية النسخ الاحتياطي");return false}return true}
function downloadFullBackup(){if(!requireBackupPermission())return;window.location.href="/api/admin/backups/full-json"}
function exportWorkersReport(){if(!requireBackupPermission())return;window.location.href="/api/export-workers"}
function exportSubscriptionsReport(){if(!requireBackupPermission())return;window.location.href="/api/admin/backups/subscriptions-csv"}
function exportPaymentsReport(){if(!requireBackupPermission())return;window.location.href="/api/admin/backups/payments-csv"}
function exportAnalyticsReport(){if(!requireBackupPermission())return;window.location.href="/api/admin/backups/analytics-csv?days=90"}
function exportActivityLogReport(){if(!requireBackupPermission())return;window.location.href="/api/admin/backups/activity-log-csv"}
async function loadBackupSummary(){
  if(!requireBackupPermission())return;
  const box=document.getElementById("backupSummary"); if(box)box.innerHTML='<div class="empty-state">جاري تحميل ملخص النسخ الاحتياطي...</div>';
  backupMsg("",false);
  try{
    const r=await fetch("/api/admin/backups/summary",{credentials:"include"});
    const d=await r.json().catch(()=>({}));
    if(!r.ok||!d.success)throw new Error(d.error||"تعذر تحميل ملخص النسخ الاحتياطي");
    if(box){ box.innerHTML=(d.items||[]).map(item=>`<div class="backup-summary-item"><strong>${item.count===null?"—":item.count}</strong><span>${item.label||item.table}</span>${item.error?`<small style="display:block;color:#991b1b;margin-top:5px">غير جاهز</small>`:""}</div>`).join("") || '<div class="empty-state">لا توجد بيانات</div>'; }
  }catch(e){ if(box)box.innerHTML='<div class="empty-state">تعذر تحميل الملخص</div>'; backupMsg(e.message||"تعذر تحميل الملخص"); }
}
async function createStorageBackup(){
  if(!requireBackupPermission())return;
  backupMsg("جاري إنشاء النسخة الاحتياطية ورفعها إلى Supabase Storage...");
  try{
    const r=await fetch("/api/admin/backups/create",{method:"POST",credentials:"include",headers:{"Content-Type":"application/json"}});
    const d=await r.json().catch(()=>({}));
    if(!r.ok||!d.success)throw new Error(d.error||"تعذر إنشاء النسخة الاحتياطية");
    backupMsg(`تم إنشاء النسخة بنجاح داخل bucket: ${d.bucket} — الملف: ${d.path} — عدد السجلات: ${d.total_rows}`);
    toast("success","تم إنشاء النسخة الاحتياطية");
  }catch(e){ backupMsg(e.message||"تعذر إنشاء النسخة الاحتياطية"); toast("error",e.message||"تعذر إنشاء النسخة الاحتياطية"); }
}

async function loadNotifications(){
  try{ const data = await fetchJson(["/api/admin/notifications"]); adminNotifications = data || {}; }catch(e){ adminNotifications = {}; }
  renderNotifications();
}
function renderNotifications(){
  const pendingWorkers = adminNotifications.pendingWorkers || allWorkers.filter(w=>!isApproved(w)).length;
  const pendingReviews = adminNotifications.pendingReviews || 0;
  const soon = adminNotifications.subscriptionsSoon || 0;
  const expired = adminNotifications.subscriptionsExpired || 0;
  const a=document.getElementById("notifyPendingWorkers"), b=document.getElementById("notifyPendingReviews"), c=document.getElementById("notifySubscriptionsSoon"), d=document.getElementById("notifySubscriptionsExpired");
  if(a)a.textContent=pendingWorkers; if(b)b.textContent=pendingReviews; if(c)c.textContent=soon; if(d)d.textContent=expired;
}
function activateWorkersTab(){const workersBtn = document.querySelector(".admin-tab");if(workersBtn) switchTab("workers", workersBtn);}
function showPendingWorkers(){activateWorkersTab();document.getElementById("adminStatusFilter").value = "pending";filterAdminWorkers();document.getElementById("workersSection").scrollIntoView({behavior:"smooth"});}
function showSubscriptionsSoon(){activateWorkersTab();document.getElementById("adminStatusFilter").value = "sub_soon";filterAdminWorkers();document.getElementById("workersSection").scrollIntoView({behavior:"smooth"});}
function showSubscriptionsExpired(){activateWorkersTab();document.getElementById("adminStatusFilter").value = "sub_expired";filterAdminWorkers();document.getElementById("workersSection").scrollIntoView({behavior:"smooth"});}
function showPendingReviews(){const tabs = Array.from(document.querySelectorAll(".admin-tab"));const reviewsBtn = tabs.find(btn => btn.textContent.includes("التقييمات"));if(reviewsBtn) switchTab("reviews", reviewsBtn);const status = document.getElementById("reviewStatusFilter");if(status) status.value = "pending";if(typeof renderReviews === "function") renderReviews();const section = document.getElementById("reviewsSection");if(section) section.scrollIntoView({behavior:"smooth"});}

async function loadAdminUsers(){
  if(!can("admin_users:manage")) return;
  const box=document.getElementById("adminUsersList"); if(!box) return;
  box.innerHTML='<div class="empty-admin">جاري تحميل المستخدمين...</div>';
  try{
    const r=await fetch("/api/admin/users",{credentials:"include"});
    const d=await r.json().catch(()=>({}));
    if(r.status===401){showLogin();return}
    if(!r.ok||!d.success) throw new Error(d.error||"تعذر تحميل مستخدمي الإدارة");
    adminUsers=d.items||[]; renderAdminUsers();
  }catch(e){box.innerHTML=`<div class="empty-admin">${e.message||"تعذر تحميل المستخدمين"}</div>`}
}
function renderAdminUsers(){
  const box=document.getElementById("adminUsersList"); if(!box)return;
  if(!adminUsers.length){box.innerHTML='<div class="empty-admin">لا يوجد مستخدمون بعد. يمكنك الاعتماد مؤقتًا على كلمة سر المدير الرئيسية.</div>';return}
  box.innerHTML=adminUsers.map(u=>`<div class="admin-user-card"><h4>${u.display_name||u.username}</h4><p>اسم المستخدم: ${u.username}</p><span class="role-pill ${u.active?'':'off'}">${roleLabel(u.role)} - ${u.active?'نشط':'متوقف'}</span><div class="card-actions" style="margin-top:12px"><select onchange="updateAdminUser('${u.id}',{role:this.value})"><option value="super_admin" ${u.role==='super_admin'?'selected':''}>مدير كامل</option><option value="reviewer" ${u.role==='reviewer'?'selected':''}>موظف مراجعة</option><option value="subscription_manager" ${u.role==='subscription_manager'?'selected':''}>موظف اشتراكات</option><option value="viewer" ${u.role==='viewer'?'selected':''}>مشاهد</option></select><button class="action-btn ${u.active?'btn-yellow':'btn-green'}" onclick="updateAdminUser('${u.id}',{active:${u.active?0:1}})">${u.active?'إيقاف':'تفعيل'}</button><button class="action-btn btn-blue" onclick="changeAdminPassword('${u.id}')">تغيير كلمة السر</button><button class="action-btn btn-red" onclick="deleteAdminUser('${u.id}')">حذف</button></div></div>`).join("");
}
async function createAdminUser(e){
  e.preventDefault();
  const body={username:document.getElementById("newAdminUsername").value.trim(),display_name:document.getElementById("newAdminDisplayName").value.trim(),password:document.getElementById("newAdminPassword").value,role:document.getElementById("newAdminRole").value};
  const ok=await reqs([{url:"/api/admin/users",method:"POST",body}]);
  if(ok){toast("success","تم إنشاء مستخدم الإدارة");e.target.reset();await loadAdminUsers()}
}
async function updateAdminUser(id,body){const ok=await reqs([{url:`/api/admin/users/${id}`,method:"PUT",body}]);if(ok){toast("success","تم تحديث المستخدم");await loadAdminUsers()}}
async function changeAdminPassword(id){const password=prompt("اكتب كلمة السر الجديدة - 8 أحرف على الأقل");if(!password)return;const ok=await reqs([{url:`/api/admin/users/${id}/password`,method:"PUT",body:{password}}]);if(ok)toast("success","تم تغيير كلمة السر")}
async function deleteAdminUser(id){if(!confirm("حذف مستخدم الإدارة؟"))return;const ok=await reqs([{url:`/api/admin/users/${id}`,method:"DELETE"}]);if(ok){toast("success","تم حذف المستخدم");await loadAdminUsers()}}

function analyticsNumber(v){return Number(v||0).toLocaleString("ar-EG")}
function analyticsPercent(v){return (Number(v||0)||0).toLocaleString("ar-EG")+"%"}
function renderAnalyticsList(id, rows, opts){
  const box=document.getElementById(id); if(!box)return;
  const options=opts||{}; const items=(rows||[]).slice(0, options.limit||10);
  if(!items.length){box.innerHTML='<div class="empty-admin">لا توجد بيانات كافية.</div>';return}
  box.innerHTML=items.map((x,idx)=>{
    const title=x.name||x.source||x.page_path||"غير محدد";
    const main=options.main==="filters" ? (x.filter_trade||x.filter_area||x.total_events||x.count||0) : (x.total_contacts!==undefined?x.total_contacts:x.count||x.total_events||0);
    const sub=[];
    if(x.call!==undefined)sub.push(`<span class="small-badge"><i class="fa-solid fa-phone"></i> ${analyticsNumber(x.call)}</span>`);
    if(x.whatsapp!==undefined)sub.push(`<span class="small-badge"><i class="fa-brands fa-whatsapp"></i> ${analyticsNumber(x.whatsapp)}</span>`);
    if(x.profile_view!==undefined)sub.push(`<span class="small-badge"><i class="fa-solid fa-eye"></i> ${analyticsNumber(x.profile_view)}</span>`);
    if(x.count!==undefined)sub.push(`<span class="small-badge"><i class="fa-solid fa-chart-simple"></i> ${analyticsNumber(x.count)}</span>`);
    return `<div class="admin-worker-card" style="padding:14px"><div class="worker-row-head"><div><h4>#${idx+1} ${title}</h4><p>${options.label||"إجمالي"}: ${analyticsNumber(main)}</p></div></div><div class="worker-row-actions" style="justify-content:flex-start;gap:8px;flex-wrap:wrap">${sub.join("")}</div></div>`;
  }).join("");
}
function renderAnalyticsDaily(rows){
  const box=document.getElementById("analyticsDaily"); if(!box)return;
  const items=(rows||[]).slice(-10).reverse();
  if(!items.length){box.innerHTML='<div class="empty-admin">لا توجد بيانات يومية.</div>';return}
  box.innerHTML=items.map(x=>`<div class="admin-worker-card" style="padding:14px"><div class="worker-row-head"><div><h4>${x.date}</h4><p>تواصل: ${analyticsNumber(x.total_contacts)} | أحداث: ${analyticsNumber(x.total_events)}</p></div></div><div class="worker-row-actions" style="justify-content:flex-start;gap:8px;flex-wrap:wrap"><span class="small-badge"><i class="fa-solid fa-phone"></i> ${analyticsNumber(x.call)}</span><span class="small-badge"><i class="fa-brands fa-whatsapp"></i> ${analyticsNumber(x.whatsapp)}</span><span class="small-badge"><i class="fa-solid fa-eye"></i> ${analyticsNumber(x.profile_view)}</span></div></div>`).join("");
}
function renderAnalyticsGaps(rows){
  const box=document.getElementById("analyticsGaps"); if(!box)return;
  const items=(rows||[]).slice(0,20);
  if(!items.length){box.innerHTML='<div class="empty-admin">لا توجد فجوات واضحة حاليًا.</div>';return}
  box.innerHTML=items.map(x=>`<span class="small-badge" style="display:inline-flex;margin:5px"><i class="fa-solid fa-triangle-exclamation"></i> ${x.trade} في ${x.area}</span>`).join("");
}

async function loadAnalytics(){
  const box=document.getElementById("analyticsTopWorkers"), msg=document.getElementById("analyticsMessage"), rangeEl=document.getElementById("analyticsRange");
  if(!box)return;
  const days=rangeEl?rangeEl.value:30;
  box.innerHTML='<div class="admin-card">جاري تحميل التحليلات...</div>';
  if(msg)msg.style.display="none";
  try{
    const r=await fetch("/api/admin/analytics?days="+encodeURIComponent(days),{credentials:"include"});
    const d=await r.json().catch(()=>({}));
    if(!r.ok||!d.success) throw new Error(d.error||"تعذر تحميل التحليلات");
    const totals=d.totals||{};
    const setText=(id,val)=>{const el=document.getElementById(id);if(el)el.textContent=analyticsNumber(val);};
    setText("analyticsCalls",totals.call); setText("analyticsWhatsapp",totals.whatsapp); setText("analyticsViews",totals.profile_view); setText("analyticsContacts",totals.total_contacts); setText("analyticsEvents",totals.total_events);
    const conv=document.getElementById("analyticsConversion"); if(conv)conv.textContent=analyticsPercent(totals.conversion_rate);
    const rows=d.top_workers||[];
    if(!rows.length){
      box.innerHTML=""; if(msg){msg.textContent="لا توجد بيانات تواصل في الفترة المحددة حتى الآن.";msg.style.display="block";}
    }else{
      box.innerHTML=rows.map((row,idx)=>{
        const w=row.worker||{}; const name=w.name||("صنايعي رقم "+row.worker_id); const trade=w.trade||""; const area=w.area||"";
        return `<div class="admin-worker-card"><div class="worker-row-head"><div><h4>#${idx+1} ${name}</h4><p>${trade}${area?" - "+area:""}</p></div><span class="status-badge active">تواصل ${analyticsNumber(row.total_contacts||0)}</span></div><div class="worker-row-actions" style="justify-content:flex-start;gap:8px;flex-wrap:wrap"><span class="small-badge"><i class="fa-solid fa-phone"></i> اتصال: ${analyticsNumber(row.call||0)}</span><span class="small-badge"><i class="fa-brands fa-whatsapp"></i> واتساب: ${analyticsNumber(row.whatsapp||0)}</span><span class="small-badge"><i class="fa-solid fa-eye"></i> مشاهدات: ${analyticsNumber(row.profile_view||0)}</span></div></div>`;
      }).join("");
    }
    renderAnalyticsList("analyticsTopTrades",d.top_trades,{label:"تواصل"});
    renderAnalyticsList("analyticsTopAreas",d.top_areas,{label:"تواصل"});
    renderAnalyticsList("analyticsFilterTrades",d.filter_trades,{label:"اختيارات",main:"filters"});
    renderAnalyticsList("analyticsFilterAreas",d.filter_areas,{label:"اختيارات",main:"filters"});
    renderAnalyticsList("analyticsTopPages",d.top_pages,{label:"زيارات",limit:8});
    renderAnalyticsDaily(d.daily);
    renderAnalyticsGaps(d.missing_trade_area);
  }catch(e){
    box.innerHTML=""; if(msg){msg.textContent=e.message||"تعذر تحميل التحليلات";msg.style.display="block";}
  }
}

function waSingleWorkerMatches(w, q){
  const text=[wname(w),registrationCodeText(w),wphone(w),wwhatsapp(w),wtrade(w),warea(w)].join(" ").toLowerCase();
  return !q || text.includes(String(q||"").toLowerCase());
}
function renderWaSingleWorkerOptions(){
  const select=document.getElementById("waSingleWorkerSelect"); if(!select)return;
  const q=(document.getElementById("waSingleSearch")?.value||"").trim();
  const workers=allWorkers.filter(w=>waSingleWorkerMatches(w,q)).slice(0,80);
  const current=select.value;
  select.innerHTML='<option value="">اختر الصنايعي</option>'+workers.map(w=>`<option value="${wid(w)}">${esc(registrationCodeText(w))} - ${esc(wname(w))} - ${esc(wphone(w)||wwhatsapp(w)||"بدون رقم")}</option>`).join("");
  if(current && workers.some(w=>String(wid(w))===String(current)))select.value=current;
}
function getWaSingleWorker(){const id=document.getElementById("waSingleWorkerSelect")?.value||""; return allWorkers.find(w=>String(wid(w))===String(id))||null;}
function previewWhatsappSingle(){
  const summary=document.getElementById("waSingleSummary"), textEl=document.getElementById("waSingleMessageText");
  if(!summary||!textEl)return;
  const w=getWaSingleWorker();
  if(!w){summary.textContent="اختر صنايعي لعرض المعاينة.";return;}
  const type=document.getElementById("waSingleTemplateType")?.value||"registration_id_reupload";
  if(type!=="custom" || !textEl.value.trim()) textEl.value=buildWhatsAppTemplate(type,w);
  const phone=wwhatsapp(w)||wphone(w); const valid=adminWhatsAppNumber(phone);
  summary.textContent=`الصنايعي: ${wname(w)}
رقم الطلب: ${registrationCodeText(w)}
الهاتف/واتساب: ${phone||"غير متاح"}
رابط الحالة: ${registrationStatusLink(w)}
حالة الرقم: ${valid?"صالح للإرسال":"لا يوجد رقم صالح"}`;
}
async function syncWaSingleRequiredAction(w,type){
  if(!document.getElementById("waSingleSyncStatus")?.checked)return true;
  const map={
    registration_id_reupload:{identity_status:"needs_id_reupload",reason:"مطلوب إعادة رفع صورة البطاقة وجه وظهر بوضوح"},
    registration_update_data:{identity_status:"needs_data",reason:"مطلوب تعديل أو استكمال البيانات المطلوبة مثل رقم الهاتف أو الحرفة أو المنطقة"},
    registration_work_photos:{identity_status:"needs_data",reason:"مطلوب رفع صور أعمال واضحة من شغلك"},
    identity_needs_id_reupload:{identity_status:"needs_id_reupload",reason:"مطلوب إعادة رفع صورة البطاقة وجه وظهر بوضوح"},
    identity_needs_data:{identity_status:"needs_data",reason:"مطلوب تعديل أو استكمال البيانات المطلوبة"},
    need_data:{identity_status:"needs_data",reason:"مطلوب استكمال أو تعديل بعض البيانات قبل الاعتماد"}
  };
  const payload=map[type]; if(!payload)return true;
  try{
    const r=await fetch(`/api/admin/workers/${wid(w)}/identity-review`,{method:"PUT",credentials:"include",headers:{"Content-Type":"application/json"},body:JSON.stringify({...payload,note:"تم تحديد الإجراء من تبويب رسائل واتساب الفردية."})});
    const d=await r.json().catch(()=>({}));
    if(!r.ok||!d.success)throw new Error(d.error||"لم يتم تحديث حالة الطلب");
    await loadAllData(); return true;
  }catch(e){ toast("error",e.message||"لم يتم تحديث حالة الطلب، سيتم محاولة إرسال واتساب فقط"); return false; }
}

async function sendWhatsappSingle(){
  if(!can("whatsapp:send")){toast("error","ليس لديك صلاحية إرسال واتساب");return}
  const w=getWaSingleWorker(); if(!w){toast("error","اختر الصنايعي أولًا");return}
  const phone=wwhatsapp(w)||wphone(w); const msg=(document.getElementById("waSingleMessageText")?.value||"").trim();
  const mode=document.getElementById("waSingleMode")?.value||"text"; const templateName=(document.getElementById("waSingleTemplateName")?.value||"hello_world").trim();
  const type=document.getElementById("waSingleTemplateType")?.value||"admin_message";
  if(!adminWhatsAppNumber(phone)){toast("error","لا يوجد رقم واتساب صالح لهذا الصنايعي");return}
  if(mode!=="template"&&!msg){toast("error","اكتب نص الرسالة أولًا");return}
  if(mode==="template"&&!templateName){toast("error","اكتب اسم Template");return}
  await syncWaSingleRequiredAction(w,type);
  const btn=document.getElementById("waSingleSendBtn"),old=btn?btn.innerHTML:"";
  if(btn){btn.disabled=true;btn.innerHTML='<i class="fa-solid fa-spinner fa-spin"></i> جاري الإرسال...'}
  try{
    const r=await fetch("/api/admin/whatsapp/send-worker",{method:"POST",credentials:"include",headers:{"Content-Type":"application/json"},body:JSON.stringify({worker_id:String(wid(w)),phone,message:msg,mode,template_name:templateName,message_type:type})});
    const d=await r.json().catch(()=>({}));
    if(!r.ok||!d.success)throw new Error(d.error||"فشل إرسال واتساب");
    toast("success","تم إرسال الرسالة الفردية"); loadWhatsappLogs();
  }catch(e){toast("error",e.message||"فشل إرسال واتساب")}
  finally{if(btn){btn.disabled=false;btn.innerHTML=old}}
}

async function openWhatsappSingleManual(){
  const w=getWaSingleWorker(); if(!w){toast("error","اختر الصنايعي أولًا");return}
  const num=adminWhatsAppNumber(wwhatsapp(w)||wphone(w)); const msg=(document.getElementById("waSingleMessageText")?.value||"").trim();
  const type=document.getElementById("waSingleTemplateType")?.value||"admin_message";
  if(!num){toast("error","لا يوجد رقم واتساب صالح");return}
  await syncWaSingleRequiredAction(w,type);
  window.open("https://wa.me/"+num+"?text="+encodeURIComponent(msg),"_blank");
}

function waEscape(v){return String(v??"").replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]||c))}
function waDate(v){try{const d=new Date(v);return isNaN(d.getTime())?"غير محدد":d.toLocaleString("ar-EG")}catch(e){return"غير محدد"}}
function waBulkEligibleWorkers(){
  const f=document.getElementById("waBulkFilter")?.value||"approved";
  return allWorkers.filter(w=>{
    const phone=wwhatsapp(w)||wphone(w); if(!adminWhatsAppNumber(phone))return false;
    const idStatus=identityStatusValue(w); const sub=subInfo(w);
    if(f==="all")return true; if(f==="approved")return isApproved(w); if(f==="pending")return !isApproved(w);
    if(f==="active")return isActive(w); if(f==="featured")return isFeatured(w);
    if(f==="sub_soon")return sub.daysLeft!==null&&sub.daysLeft>=0&&sub.daysLeft<=7;
    if(f==="sub_expired")return sub.daysLeft!==null&&sub.daysLeft<0;
    if(f==="identity_pending")return idStatus==="pending"; if(f==="identity_verified")return idStatus==="verified";
    if(f==="has_whatsapp")return !!adminWhatsAppNumber(wwhatsapp(w)||wphone(w));
    return true;
  });
}

function waBulkMessageForWorker(w){
  const type=document.getElementById("waBulkTemplateType")?.value||"approved";
  if(type==="custom"){
    const link=workerDisplayLink(wid(w)); const raw=document.getElementById("waBulkCustomText")?.value||"";
    return raw.replaceAll("{name}",wname(w)).replaceAll("{trade}",wtrade(w)).replaceAll("{area}",warea(w)).replaceAll("{link}",link);
  }
  return buildWhatsAppTemplate(type,w);
}

function previewWhatsappBulk(){
  const box=document.getElementById("waBulkSummary"); if(!box)return;
  const workers=waBulkEligibleWorkers(); const mode=document.getElementById("waBulkMode")?.value||"text"; const type=document.getElementById("waBulkTemplateType")?.value||"approved";
  const sample=workers[0]; const count=workers.length; const invalid=allWorkers.length-count;
  let text=`المستلمون الصالحون: ${count}
غير داخل الشريحة أو بدون رقم صالح: ${invalid}
طريقة الإرسال: ${mode==="template"?"Template رسمي":"نص عربي مباشر"}
نوع الرسالة: ${type}
`;
  if(count>100)text+=`
تنبيه: سيتم إرسال أول 100 فقط في العملية الواحدة.
`;
  if(sample){text+=`
مثال لأول مستلم: ${wname(sample)} - ${adminWhatsAppNumber(wwhatsapp(sample)||wphone(sample))}

${waBulkMessageForWorker(sample).slice(0,700)}`}
  else text+=`
لا يوجد مستلمون مطابقون.`;
  box.textContent=text;
}

async function sendWhatsappBulk(){
  if(!can("whatsapp:send")){toast("error","ليس لديك صلاحية إرسال واتساب");return}
  const workers=waBulkEligibleWorkers().slice(0,100); if(!workers.length){toast("error","لا يوجد مستلمون صالحون");return}
  const mode=document.getElementById("waBulkMode")?.value||"text"; const templateName=(document.getElementById("waBulkTemplateName")?.value||"").trim();
  const languageCode=(document.getElementById("waBulkTemplateLang")?.value||"en_US").trim(); const type=document.getElementById("waBulkTemplateType")?.value||"approved";
  if(mode==="template"&&!templateName){toast("error","اكتب اسم Template");return}
  if(!confirm(`سيتم إرسال الرسالة إلى ${workers.length} صنايعي. هل أنت متأكد؟`))return;
  const btn=document.getElementById("waBulkSendBtn"),bar=document.getElementById("waBulkProgress");
  const old=btn?btn.innerHTML:""; if(btn){btn.disabled=true;btn.innerHTML='<i class="fa-solid fa-spinner fa-spin"></i> جاري الإرسال الجماعي...'}
  if(bar)bar.style.width="15%";
  try{
    const items=workers.map(w=>({worker_id:String(wid(w)),worker_name:wname(w),phone:wwhatsapp(w)||wphone(w),message:waBulkMessageForWorker(w)}));
    const r=await fetch("/api/admin/whatsapp/send-bulk",{method:"POST",credentials:"include",headers:{"Content-Type":"application/json"},body:JSON.stringify({items,mode,template_name:templateName,language_code:languageCode,message_type:type,bulk_label:`${type} - ${workers.length} مستلم`})});
    const d=await r.json().catch(()=>({}));
    if(!r.ok||!d.success)throw new Error(d.error||"فشل الإرسال الجماعي");
    if(bar)bar.style.width="100%"; toast(d.failed?"error":"success",`انتهى الإرسال: ناجح ${d.sent} / فشل ${d.failed}`);
    previewWhatsappBulk(); await loadWhatsappLogs();
  }catch(e){toast("error",e.message||"فشل الإرسال الجماعي");if(bar)bar.style.width="0%"}
  finally{if(btn){btn.disabled=false;btn.innerHTML=old}setTimeout(()=>{if(bar)bar.style.width="0%"},1200)}
}

let waInboxTimer=null;
function loadWhatsappInboxDebounced(){clearTimeout(waInboxTimer);waInboxTimer=setTimeout(()=>loadWhatsappInbox(),350);}
function waInboxDefaultReply(row){const name=row.worker_name||row.profile_name||""; return `السلام عليكم${name?" أستاذ/ "+name:""}

تم استلام رسالتك، وسيتم مراجعة الطلب والرد عليك من إدارة صنايعي مطروح.`;}

async function loadWhatsappInbox(){
  if(!can("whatsapp:send"))return;
  const list=document.getElementById("waInboxList"),stats=document.getElementById("waInboxStats"); if(!list)return;
  list.innerHTML='<div class="empty-state">جاري تحميل صندوق الوارد...</div>';
  const status=document.getElementById("waInboxStatus")?.value||"all"; const q=(document.getElementById("waInboxSearch")?.value||"").trim();
  try{
    const r=await fetch(`/api/admin/whatsapp/inbox?limit=120&status=${encodeURIComponent(status)}&q=${encodeURIComponent(q)}`,{credentials:"include"});
    const d=await r.json().catch(()=>({}));
    if(!r.ok||!d.success)throw new Error(d.error||"تعذر تحميل وارد واتساب");
    const items=d.items||[]; const totals=d.totals||{};
    if(d.warning){list.innerHTML=`<div class="empty-state">${waEscape(d.warning)}</div>`; if(stats)stats.innerHTML=''; return;}
    if(stats){stats.innerHTML=`<div class="stat-card"><strong>${totals.total||items.length||0}</strong><span>إجمالي</span></div><div class="stat-card"><strong>${totals.unread||0}</strong><span>غير مقروء</span></div><div class="stat-card"><strong>${totals.archived||0}</strong><span>مؤرشف</span></div>`}
    if(!items.length){list.innerHTML='<div class="empty-state">لا توجد ردود واردة حتى الآن.</div>';return}
    list.innerHTML=items.map(row=>{
      const unread=(!row.read_at && (row.status||"new")!=="archived");
      const title=row.worker_name||row.profile_name||row.from_number||"رد وارد";
      const sub=[row.from_number||row.wa_id||"",row.message_type||"رسالة",waDate(row.received_at||row.created_at)].filter(Boolean).join(" - ");
      const worker=row.worker_snapshot||{};
      const workerInfo=worker&&worker.id?`<span class="wa-pill"><i class="fa-solid fa-user"></i>${waEscape(worker.registration_code||worker.name||row.worker_name||"")}</span><span class="wa-pill">${waEscape((worker.trade||"")+(worker.area?" - "+worker.area:""))}</span>`:'<span class="wa-pill pending">غير مربوط بصنايعي</span>';
      return `<div class="wa-inbox-item ${unread?"unread":""}"><div class="wa-inbox-head"><div><div class="wa-inbox-title">${waEscape(title)}</div><div class="wa-log-meta"><span class="wa-pill ${unread?"sent":""}">${unread?"غير مقروء":"مقروء/مؤرشف"}</span><span class="wa-pill"><i class="fa-brands fa-whatsapp"></i>${waEscape(sub)}</span>${workerInfo}</div></div></div><div class="wa-inbox-text">${waEscape(row.message_text||"")}</div><div class="wa-inbox-reply"><textarea id="waInboxReply_${row.id}" placeholder="اكتب رد الإدارة هنا...">${waEscape(waInboxDefaultReply(row))}</textarea></div><div class="wa-inbox-actions"><button class="big-btn btn-blue" onclick="sendWhatsappInboxReply('${waEscape(row.id)}')"><i class="fa-solid fa-paper-plane"></i> إرسال رد</button><button class="big-btn btn-dark" onclick="updateWhatsappInboxStatus('${waEscape(row.id)}','read')"><i class="fa-solid fa-check"></i> تعليم كمقروء</button><button class="big-btn btn-red" onclick="updateWhatsappInboxStatus('${waEscape(row.id)}','archived')"><i class="fa-solid fa-box-archive"></i> أرشفة</button></div></div>`;
    }).join("");
  }catch(e){list.innerHTML=`<div class="empty-state">${waEscape(e.message||"تعذر تحميل الوارد")}</div>`}
}

async function updateWhatsappInboxStatus(id,status){
  try{
    const r=await fetch(`/api/admin/whatsapp/inbox/${encodeURIComponent(id)}/status`,{method:"PUT",credentials:"include",headers:{"Content-Type":"application/json"},body:JSON.stringify({status})});
    const d=await r.json().catch(()=>({}));
    if(!r.ok||!d.success)throw new Error(d.error||"تعذر تحديث حالة الرسالة");
    toast("success",status==="archived"?"تمت الأرشفة":"تم التحديث"); loadWhatsappInbox();
  }catch(e){toast("error",e.message||"تعذر تحديث حالة الرسالة")}
}

async function sendWhatsappInboxReply(id){
  if(!can("whatsapp:send")){toast("error","ليس لديك صلاحية إرسال واتساب");return}
  const el=document.getElementById(`waInboxReply_${id}`); const msg=(el?.value||"").trim();
  if(!msg){toast("error","اكتب نص الرد أولًا");return}
  try{
    const r=await fetch(`/api/admin/whatsapp/inbox/${encodeURIComponent(id)}/reply`,{method:"POST",credentials:"include",headers:{"Content-Type":"application/json"},body:JSON.stringify({message:msg,mode:"text"})});
    const d=await r.json().catch(()=>({}));
    if(!r.ok||!d.success)throw new Error(d.error||"فشل إرسال الرد");
    toast("success","تم إرسال الرد إلى واتساب"); loadWhatsappInbox(); loadWhatsappLogs();
  }catch(e){toast("error",e.message||"فشل إرسال الرد")}
}

async function loadWhatsappLogs(){
  if(!can("whatsapp:send"))return;
  const list=document.getElementById("waLogsList"),stats=document.getElementById("waLogsStats"); if(!list)return;
  list.innerHTML='<div class="empty-state">جاري تحميل سجل واتساب...</div>';
  const status=document.getElementById("waLogStatus")?.value||"all";
  try{
    const r=await fetch(`/api/admin/whatsapp/logs?limit=120&status=${encodeURIComponent(status)}`,{credentials:"include"});
    const d=await r.json().catch(()=>({}));
    if(!r.ok||!d.success)throw new Error(d.error||"تعذر تحميل سجل واتساب");
    const items=d.items||[]; const totals=d.totals||{};
    if(stats){stats.innerHTML=`<div class="stat-card"><strong>${totals.total||items.length||0}</strong><span>إجمالي</span></div><div class="stat-card"><strong>${totals.sent||0}</strong><span>ناجحة</span></div><div class="stat-card"><strong>${totals.failed||0}</strong><span>فاشلة</span></div>`}
    if(!items.length){list.innerHTML='<div class="empty-state">لا توجد رسائل في السجل حتى الآن.</div>';return}
    list.innerHTML=items.map(row=>{
      const st=row.status||"pending"; const cls=st==="sent"?"sent":(st==="failed"?"failed":"pending");
      const title=row.worker_name||row.phone||"مستلم واتساب"; const msg=row.message_text||"";
      const err=row.error_message?`<div class="permission-note" style="margin-top:8px;color:#991b1b;background:#fee2e2;border-color:#fecaca">${waEscape(row.error_message)}</div>`:"";
      return `<div class="wa-log-item"><h4>${waEscape(title)}</h4><p>${waEscape(msg).slice(0,260)}</p><div class="wa-log-meta"><span class="wa-pill ${cls}">${st==="sent"?"ناجحة":st==="failed"?"فاشلة":"قيد الانتظار"}</span><span class="wa-pill"><i class="fa-brands fa-whatsapp"></i>${waEscape(row.phone||"")}</span><span class="wa-pill">${waEscape(row.message_type||"رسالة")}</span><span class="wa-pill">${waEscape(row.sent_by||"الإدارة")}</span><span class="wa-pill">${waDate(row.created_at)}</span></div>${err}</div>`;
    }).join("");
  }catch(e){list.innerHTML=`<div class="empty-state">${waEscape(e.message||"تعذر تحميل السجل")}</div>`}
}

let adminChatThreadsData=[];
let adminChatCurrentWorkerId=null;
let adminChatTimer=null;
function chatAdminEsc(v){return String(v??'').replace(/[&<>"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]||c));}
function chatAdminTime(v){try{return new Date(v).toLocaleString('ar-EG',{dateStyle:'short',timeStyle:'short'});}catch(e){return ''}}
async function updateAdminChatBadge(){
  try{
    const r=await fetch('/api/admin/worker-chat/unread-count',{credentials:'include'});
    const d=await r.json().catch(()=>({}));
    const el=document.getElementById('adminChatTabBadge');
    if(el && d.success && Number(d.unread_count||0)>0){el.textContent=d.unread_count;el.style.display='inline-flex';}
    else if(el){el.style.display='none';}
  }catch(e){}
}
async function loadAdminChatThreads(){
  const box=document.getElementById('adminChatThreads'); if(box)box.innerHTML='<div class="chat-empty">جاري تحميل المحادثات...</div>';
  try{
    const r=await fetch('/api/admin/worker-chat/threads',{credentials:'include'});
    const d=await r.json().catch(()=>({}));
    if(r.status===401){showLogin();return}
    if(!r.ok||!d.success)throw new Error(d.error||'تعذر تحميل المحادثات');
    adminChatThreadsData=d.threads||[];
    renderAdminChatThreads(); updateAdminChatBadge();
  }catch(e){ if(box)box.innerHTML='<div class="chat-empty">'+chatAdminEsc(e.message||'تعذر تحميل المحادثات')+'</div>'; }
}
function renderAdminChatThreads(){
  const box = document.getElementById('adminChatThreads'); if(!box) return;
  const q = String(document.getElementById('adminChatSearch')?.value || '').trim().toLowerCase();
  let list = adminChatThreadsData;
  if(q){
    list = list.filter(t => {
      const w = t.worker || {};
      return [w.name, w.registration_code, w.phone, w.whatsapp, w.trade, w.area, t.latest && t.latest.message_text].join(' ').toLowerCase().includes(q);
    });
  }
  if(!list.length){ box.innerHTML = '<div class="chat-empty">لا توجد محادثات مطابقة</div>'; return; }
  box.innerHTML = list.map(t => {
    const w = t.worker || {}, latest = t.latest || {}, unread = Number(t.unread_count || 0);
    return `<div class="chat-thread ${unread ? 'unread' : ''} ${String(w.id) === String(adminChatCurrentWorkerId) ? 'active' : ''}" onclick="loadAdminChatMessages('${chatAdminEsc(w.id)}')"><h4>${chatAdminEsc(w.name || 'صنايعي')}</h4><p>${chatAdminEsc(w.registration_code || '')} - ${chatAdminEsc(w.trade || '')} - ${chatAdminEsc(w.area || '')}</p><p>${chatAdminEsc((latest.message_text || latest.attachment_url || '').slice(0, 90))}</p><span class="chat-badge"><i class="fa-solid ${unread ? 'fa-bell' : 'fa-clock'}"></i> ${unread ? unread + ' غير مقروء' : chatAdminTime(latest.created_at)}</span></div>`;
  }).join('');
}

async function loadAdminChatMessages(workerId){
  if(!workerId)return;
  adminChatCurrentWorkerId=workerId;
  const box=document.getElementById('adminChatMessages'); if(box)box.innerHTML='<div class="chat-empty">جاري تحميل الرسائل...</div>';
  try{
    const r=await fetch(`/api/admin/worker-chat/threads/${encodeURIComponent(workerId)}/messages`,{credentials:'include'});
    const d=await r.json().catch(()=>({}));
    if(r.status===401){showLogin();return}
    if(!r.ok||!d.success)throw new Error(d.error||'تعذر تحميل المحادثة');
    const w=d.worker||{};
    document.getElementById('adminChatTitle').textContent=w.name||'محادثة صنايعي';
    document.getElementById('adminChatSub').textContent=[w.registration_code,w.trade,w.area,w.phone||w.whatsapp].filter(Boolean).join(' - ');
    document.getElementById('adminChatForm').style.display='grid';
    renderAdminChatMessages(d.messages||[]);
    await loadAdminChatThreads();
    if(adminChatTimer)clearInterval(adminChatTimer);
    adminChatTimer=setInterval(()=>{ if(document.getElementById('chatSection')?.classList.contains('active') && adminChatCurrentWorkerId) loadAdminChatMessages(adminChatCurrentWorkerId); },20000);
  }catch(e){ if(box)box.innerHTML='<div class="chat-empty">'+chatAdminEsc(e.message||'تعذر تحميل المحادثة')+'</div>'; }
}

async function sendAdminChatMessage(e){
  e.preventDefault();
  if(!adminChatCurrentWorkerId){toast('error','اختر محادثة أولًا');return;}
  const input=document.getElementById('adminChatInput'); const file=document.getElementById('adminChatAttachment');
  const msg=String(input?.value||'').trim();
  if(!msg && !(file&&file.files&&file.files[0])){toast('error','اكتب رسالة أو ارفع صورة');return;}
  const btn=e.currentTarget.querySelector('button[type="submit"]'); const old=btn?btn.innerHTML:'';
  if(btn){btn.disabled=true;btn.innerHTML='<i class="fa-solid fa-spinner fa-spin"></i> جاري الإرسال...';}
  try{
    const fd=new FormData(); fd.set('message',msg); if(file&&file.files&&file.files[0])fd.set('attachment',file.files[0]);
    const r=await fetch(`/api/admin/worker-chat/threads/${encodeURIComponent(adminChatCurrentWorkerId)}/messages`,{method:'POST',credentials:'include',body:fd});
    const d=await r.json().catch(()=>({}));
    if(r.status===401){showLogin();return}
    if(!r.ok||!d.success)throw new Error(d.error||'تعذر إرسال الرد');
    if(input)input.value=''; if(file)file.value=''; toast('success',d.message||'تم إرسال الرد'); loadAdminChatMessages(adminChatCurrentWorkerId);
  }catch(err){ toast('error',err.message||'تعذر إرسال الرد'); }
  finally{ if(btn){btn.disabled=false;btn.innerHTML=old;} }
}

function renderAdminChatMessages(messages){
  const box = document.getElementById('adminChatMessages'); if(!box) return;
  if(!messages || !messages.length){ box.innerHTML = '<div class="chat-empty">لا توجد رسائل في هذه المحادثة</div>'; return; }
  box.innerHTML = messages.map(m => {
    const cls = m.sender_type === 'admin' ? 'admin' : 'worker';
    const who = m.sender_type === 'admin' ? 'الإدارة' : 'الصنايعي';
    const img = m.attachment_url ? `<img src="${chatAdminEsc(m.attachment_url)}" alt="مرفق">` : '';
    return `<div class="admin-chat-msg ${cls}"><b>${who}</b><br>${chatAdminEsc(m.message_text || '')}${img}<small>${chatAdminEsc(chatAdminTime(m.created_at))}</small></div>`;
  }).join('');
  box.scrollTop = box.scrollHeight;
}

window.onload = checkLogin;
// دالة تقييم الصنايعي داخل لوحة الإدارة
function renderAdminRating(id){
  const summary = (typeof getRatingSummary === "function") ? getRatingSummary(id) : { average: 0, count: 0 };
  if (!summary.count) {
    return '<div class="admin-card-rating no-rating"><i class="fa-regular fa-star"></i> لا توجد تقييمات</div>';
  }
  return `<div class="admin-card-rating"><i class="fa-solid fa-star"></i> ${summary.average} من 5 (${summary.count})</div>`;
}

// دالة محادثات خدمة العملاء للإدارة
let adminSupportThreadsData = [];
let adminSupportCurrentId = null;

async function loadAdminSupportThreads() {
  const box = document.getElementById('adminSupportThreads');
  if (box) box.innerHTML = '<div class="chat-empty">جاري تحميل محادثات خدمة العملاء...</div>';
  try {
    const r = await fetch('/api/admin/support-chat/threads', { credentials: 'include' });
    const d = await r.json().catch(() => ({}));
    if (!r.ok || !d.success) throw new Error(d.error || 'تعذر تحميل محادثات خدمة العملاء');
    adminSupportThreadsData = d.threads || [];
    renderAdminSupportThreads();
  } catch (e) {
    if (box) box.innerHTML = '<div class="chat-empty">' + chatAdminEsc(e.message || 'تعذر التحميل') + '</div>';
  }
}

function renderAdminSupportThreads() {
  const box = document.getElementById('adminSupportThreads');
  if (!box) return;
  if (!adminSupportThreadsData.length) {
    box.innerHTML = '<div class="chat-empty">لا توجد محادثات خدمة عملاء</div>';
    return;
  }
  box.innerHTML = adminSupportThreadsData.map(t => {
    return `<div class="chat-thread" onclick="loadAdminSupportMessages('${t.id}')"><h4>${chatAdminEsc(t.customer_name || t.phone || 'عميل')}</h4><p>${chatAdminEsc(t.phone || '')}</p></div>`;
  }).join('');
}

async function loadAdminSupportMessages(threadId) {
  adminSupportCurrentId = threadId;
  const box = document.getElementById('adminSupportMessages');
  if (box) box.innerHTML = '<div class="chat-empty">جاري تحميل الرسائل...</div>';
  try {
    const r = await fetch(`/api/admin/support-chat/threads/${encodeURIComponent(threadId)}/messages`, { credentials: 'include' });
    const d = await r.json().catch(() => ({}));
    if (!r.ok || !d.success) throw new Error(d.error || 'تعذر التحميل');
    document.getElementById('adminSupportTitle').textContent = 'محادثة عميل';
    document.getElementById('adminSupportSub').textContent = d.thread?.phone || '';
    document.getElementById('adminSupportForm').style.display = 'grid';
    if (box) {
      const msgs = d.messages || [];
      box.innerHTML = msgs.map(m => `<div class="admin-chat-msg ${m.sender_type === 'admin' ? 'admin' : 'worker'}"><b>${m.sender_type === 'admin' ? 'الإدارة' : 'العميل'}</b><br>${chatAdminEsc(m.message_text || '')}</div>`).join('');
      box.scrollTop = box.scrollHeight;
    }
  } catch (e) {
    if (box) box.innerHTML = '<div class="chat-empty">' + chatAdminEsc(e.message) + '</div>';
  }
}

async function sendAdminSupportMessage(e) {
  e.preventDefault();
  if (!adminSupportCurrentId) return;
  const input = document.getElementById('adminSupportInput');
  const message = String(input?.value || '').trim();
  if (!message) return;
  try {
    const r = await fetch(`/api/admin/support-chat/threads/${encodeURIComponent(adminSupportCurrentId)}/messages`, {
      method: 'POST',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ message })
    });
    const d = await r.json().catch(() => ({}));
    if (!r.ok || !d.success) throw new Error(d.error || 'فشل الإرسال');
    if (input) input.value = '';
    loadAdminSupportMessages(adminSupportCurrentId);
  } catch (err) {
    toast('error', err.message || 'فشل إرسال الرد');
  }
}
// دالة الهروب من الرموز الخاصة في الأزرار
function adminActionsEscapeAttr(v){
  return String(v ?? "").replace(/&/g,"&amp;").replace(/"/g,"&quot;").replace(/</g,"&lt;").replace(/>/g,"&gt;");
}

// دالة ترتيب الصنايعية في لوحة الإدارة
function sortAdminWorkers(workers){
  const sortEl = document.getElementById("adminSortFilter");
  const sortValue = sortEl ? sortEl.value : "default";
  const sorted = [...workers];

  if(sortValue === "rating"){
    sorted.sort((a, b) => {
      const ar = getRatingSummary(wid(a));
      const br = getRatingSummary(wid(b));
      if(br.average !== ar.average) return br.average - ar.average;
      return br.count - ar.count;
    });
  } else if(sortValue === "newest"){
    sorted.sort((a, b) => (Number(wid(b)) || 0) - (Number(wid(a)) || 0));
  } else if(sortValue === "featured"){
    sorted.sort((a, b) => {
      const af = isFeatured(a) ? 1 : 0;
      const bf = isFeatured(b) ? 1 : 0;
      if(bf !== af) return bf - af;
      return (Number(wid(b)) || 0) - (Number(wid(a)) || 0);
    });
  } else if(sortValue === "pending_reviews"){
    sorted.sort((a, b) => getPendingReviewsCount(wid(b)) - getPendingReviewsCount(wid(a)));
  }

  return sorted;
}