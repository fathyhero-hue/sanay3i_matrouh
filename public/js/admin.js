let allWorkers=[],allTrades=[],allAreas=[],photosByWorker={},allReviews=[],ratingsByWorker={},pendingReviewsByWorker={},adminNotifications=[],adminUsers=[],adminReports=[],adminServiceRequests=[],srAdminSearchDebounceTimer=null,currentAdmin=null,activeQuickFilter="";
let __adminLoaded={reviews:false,reports:false,users:false,backups:false,whatsapp:false,analytics:false};

async function loginAdmin(e) {
  if(e) e.preventDefault();
  const username = (document.getElementById("adminUsername")?.value || "").trim().toLowerCase();
  const p = (document.getElementById("adminPassword")?.value || "").trim();
  const err = document.getElementById("loginError");
  err.classList.remove("show"); err.textContent = "جاري التحقق...";
  try {
    const r = await fetch("/api/admin/login", { method: "POST", credentials: "include", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ username, password: p }) });
    const d = await r.json().catch(() => ({}));
    if (!r.ok || !d.success) throw new Error(d.error || "اسم المستخدم أو كلمة السر غير صحيحة");
    currentAdmin = d.admin || null; err.classList.remove("show"); showDashboard();
  } catch(ex) { err.textContent = ex.message || "اسم المستخدم أو كلمة السر غير صحيحة"; err.classList.add("show"); }
  return false;
}

function roleLabel(role){return {super_admin:"مدير كامل",reviewer:"موظف مراجعة",subscription_manager:"موظف اشتراكات",viewer:"مشاهد"}[role]||role||"الإدارة"}
function can(permission){return !!(currentAdmin&&Array.isArray(currentAdmin.permissions)&&currentAdmin.permissions.includes(permission))}
function applyPermissionUI(){document.querySelectorAll("[data-permission]").forEach(el=>{el.style.display=can(el.dataset.permission)?"":"none"});const badge=document.getElementById("adminRoleBadge");if(badge&&currentAdmin){badge.innerHTML=`<i class="fa-solid fa-user-shield"></i> ${currentAdmin.display_name||currentAdmin.username||"الإدارة"} - ${roleLabel(currentAdmin.role)}`}const sideName=document.getElementById("adminSidebarName");if(sideName&&currentAdmin){sideName.textContent=currentAdmin.display_name||currentAdmin.username||"الإدارة"}}

// Sidebar/Drawer التنقل (بند 22.2) - فتح/إغلاق بصري بس، بدون أي تعديل على
// switchTab أو صلاحيات data-permission. بيتقفل تلقائيًا لما تختار قسم على
// الموبايل، وبالـEsc، وبالضغط على الـOverlay
function openAdminDrawer(){document.getElementById("adminSidebar")?.classList.add("open");document.getElementById("adminDrawerOverlay")?.classList.add("show");document.getElementById("adminMenuToggle")?.setAttribute("aria-expanded","true")}
function closeAdminDrawer(){document.getElementById("adminSidebar")?.classList.remove("open");document.getElementById("adminDrawerOverlay")?.classList.remove("show");document.getElementById("adminMenuToggle")?.setAttribute("aria-expanded","false")}
function toggleAdminDrawer(){const sb=document.getElementById("adminSidebar");if(!sb)return;sb.classList.contains("open")?closeAdminDrawer():openAdminDrawer()}

// قائمة "⋮" لإجراءات الهيدر على الموبايل (تحديث/نسخ احتياطي/تصدير/تجديد/الرئيسية/خروج)
// - مجرد فتح/إغلاق بصري، بدون أي تعديل على الأزرار أو صلاحياتها data-permission
function openAdminMoreMenu(){document.getElementById("adminMoreMenu")?.classList.add("open");document.getElementById("adminMoreToggle")?.setAttribute("aria-expanded","true")}
function closeAdminMoreMenu(){document.getElementById("adminMoreMenu")?.classList.remove("open");document.getElementById("adminMoreToggle")?.setAttribute("aria-expanded","false")}
function toggleAdminMoreMenu(){const m=document.getElementById("adminMoreMenu");if(!m)return;m.classList.contains("open")?closeAdminMoreMenu():openAdminMoreMenu()}
document.addEventListener("DOMContentLoaded",()=>{
  document.getElementById("adminTabsNav")?.addEventListener("click",(e)=>{if(e.target.closest(".admin-tab"))closeAdminDrawer()});
  document.addEventListener("keydown",(e)=>{if(e.key==="Escape"){closeAdminDrawer();closeAdminMoreMenu()}});
  document.addEventListener("click",(e)=>{if(!e.target.closest(".admin-actions-mobile"))closeAdminMoreMenu()});
});
function showDashboard(){document.getElementById("loginScreen").style.display="none";document.getElementById("dashboard").classList.add("show");applyPermissionUI();loadAllData()}
function showLogin(){document.getElementById("dashboard").classList.remove("show");document.getElementById("loginScreen").style.display="flex"}
async function logoutAdmin(){try{await fetch("/api/admin/logout",{method:"POST",credentials:"include"})}catch(e){} location.reload()}
async function checkLogin(){try{const r=await fetch("/api/admin/me",{credentials:"include"});const d=await r.json();if(d.authenticated){currentAdmin=d.admin||null;showDashboard()}else showLogin()}catch(e){showLogin()}}

function switchTab(t,b){
  if(t==="users"&&!can("admin_users:manage")){toast("error","ليس لديك صلاحية إدارة المستخدمين");return}
  if(t==="backups"&&!can("backup:export")){toast("error","ليس لديك صلاحية النسخ الاحتياطي");return}
  if(t==="reports"&&!can("reports:read")){toast("error","ليس لديك صلاحية عرض البلاغات");return}
  if(t==="serviceRequests"&&!can("reports:read")){toast("error","ليس لديك صلاحية عرض طلبات الخدمة");return}
  if(t==="customers"&&!can("analytics:read")){toast("error","ليس لديك صلاحية عرض العملاء");return}
  if(t==="whatsapp"&&!can("whatsapp:send")){toast("error","ليس لديك صلاحية رسائل واتساب");return}
  if(t==="activityLog"&&!can("activity_log:read")){toast("error","ليس لديك صلاحية عرض سجل النشاط");return}
  if(t==="support"&&!can("support:read")){toast("error","ليس لديك صلاحية خدمة العملاء");return}
  if(t==="homepageContent"&&!can("settings:manage")){toast("error","ليس لديك صلاحية إدارة محتوى الرئيسية");return}
  if(t!=="support"){stopAdminSupportListPolling();stopAdminSupportConvPolling();}

  document.querySelectorAll(".admin-tab").forEach(x=>x.classList.remove("active")); b.classList.add("active");
  document.querySelectorAll(".admin-section").forEach(s=>s.classList.remove("active")); document.getElementById(t+"Section").classList.add("active");

  if(t==='identityRequests') renderIdentityRequestsAdmin();
  if(t==='reviews'){loadReviewsAdmin().then(()=>{__adminLoaded.reviews=true;renderReviews()})}
  if(t==='reports') loadReports();
  if(t==='serviceRequests') loadServiceRequestsAdmin();
  if(t==='customers') loadCustomersAdmin();
  if(t==='analytics') loadAnalytics();
  if(t==='users') loadAdminUsers();
  if(t==='backups') loadBackupSummary();
  if(t==='subscriptions') loadSubscriptionsAdmin();
  if(t==='activityLog') loadActivityLog();
  if(t==='whatsapp'){renderWaSingleWorkerOptions();previewWhatsappSingle();previewWhatsappBulk();loadWhatsappInbox();loadWhatsappLogs();}
  if(t==='homepageContent'){loadHeroSlidesAdmin();loadStatsSliderAdmin();}
}

function toast(type,text){const el=document.getElementById("toast");el.className="message-toast show "+type;el.innerHTML=text;setTimeout(()=>{el.className="message-toast";el.innerHTML=""},3500)}
async function fetchJson(urls){for(const u of urls){try{const r=await fetch(u,{credentials:"include"});if(r.status===401){showLogin();return []}if(r.ok)return await r.json()}catch(e){}}return []}
function arr(d){if(Array.isArray(d))return d;for(const k of["data","workers","sanaieya","trades","crafts","areas","items"])if(d&&Array.isArray(d[k]))return d[k];return[]}
function itemName(i){if(typeof i==="string")return i;return i.name||i.title||i.trade||i.craft||i.area||i.location||""}
function itemId(i){if(typeof i==="string")return i;return i.id||i._id||i.name||i.title||""}

async function loadAllData(){
  applyPermissionUI();
  const grid=document.getElementById("adminWorkersGrid"); if(grid)grid.innerHTML='<div class="empty-admin" style="grid-column:1/-1">جاري تحميل لوحة الإدارة بسرعة...</div>';
  await Promise.all([loadTrades(),loadAreas(),loadWorkers(),loadNotifications()]);
  buildRatingMaps(); fillTradeSelects(); fillAreaSelects(); filterAdminWorkers(); stats();
}

// تحديث خفيف بعد إجراء بيغيّر بيانات الصنايعية بس (من غير إعادة تحميل الحرف/المناطق اللي مش بتتغيّر)
async function refreshWorkersOnly(){
  await Promise.all([loadWorkers(),loadNotifications()]);
  filterAdminWorkers(); stats();
}

// تحديث محلي فوري لصنايعي واحد من غير أي طلب سيرفر - لإجراءات زي الموافقة/التفعيل/التمييز اللي بنعرف قيمتها الجديدة أصلًا
function patchWorkerLocal(id,patch){
  const w=allWorkers.find(x=>String(wid(x))===String(id));
  if(!w) return;
  Object.assign(w,patch);
  filterAdminWorkers(); stats();
}
function removeWorkerLocal(id){
  allWorkers=allWorkers.filter(x=>String(wid(x))!==String(id));
  filterAdminWorkers(); stats();
}

async function loadWorkers(){allWorkers=arr(await fetchJson(["/api/admin/workers"]))}
async function loadTrades(){allTrades=arr(await fetchJson(["/api/trades"]));renderTrades();fillTradeSelects()}
async function loadAreas(){allAreas=arr(await fetchJson(["/api/areas"]));renderAreas();fillAreaSelects()}
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
  const total = allWorkers.length; const approved = allWorkers.filter(isApproved).length; const pending = total - approved;
  document.getElementById("totalCount").textContent=total; document.getElementById("approvedCount").textContent=approved;
  document.getElementById("pendingCount").textContent=pending; document.getElementById("featuredCount").textContent=allWorkers.filter(isFeatured).length;
  const notifyPending = document.getElementById("notifyPendingWorkers"); if(notifyPending) notifyPending.textContent = pending;
  const pendingReviews = allReviews.filter(r=>!ok(r.approved)).length;
  const pendingEl=document.getElementById("pendingReviewsCount"); if(pendingEl) pendingEl.textContent=pendingReviews;
  updateQuickFilterCounts();
}

function updateQuickFilterCounts(){
  const counts={identity_pending:0,identity_verified:0,identity_rejected:0,identity_needs_data:0,identity_needs_id_reupload:0,has_pending_changes:0};
  allWorkers.forEach(w=>{
    const key="identity_"+identityStatusValue(w);
    if(counts[key]!==undefined) counts[key]++;
    if(hasPendingChanges(w)) counts.has_pending_changes++;
  });
  const setText=(id,val)=>{const el=document.getElementById(id); if(el) el.textContent=val;};
  setText("qfAllCount",allWorkers.length);
  setText("qfPendingCount",counts.identity_pending);
  setText("qfVerifiedCount",counts.identity_verified);
  setText("qfNeedsDataCount",counts.identity_needs_data);
  setText("qfNeedsReuploadCount",counts.identity_needs_id_reupload);
  setText("qfRejectedCount",counts.identity_rejected);
  setText("qfChangesCount",counts.has_pending_changes);
}

function setQuickFilter(f){
  activeQuickFilter=f;
  document.querySelectorAll(".quick-filter-pill").forEach(btn=>{
    btn.classList.toggle("active", btn.dataset.filter===f);
  });
  filterAdminWorkers();
}

function getValidImageUrl(path) { if (!path) return ''; if (path.startsWith('http')) return path; if (path.startsWith('/')) return path; return '/uploads/' + path; }
function hasIdentityDocs(w){return !!((w.id_front_url||w.id_front_path)&&(w.id_back_url||w.id_back_path))}
// identity_verification_status (الجديد، مصدره الرسمي لـBadge "هوية موثقة")
// له الأولوية بس لما يكون "not_submitted" - حالة الصنايعي اللي معندوش بطاقة
// خالص ومفيش للـidentity_status القديم مكافئ ليها، فلازم تتغلّب على أي قيمة
// قديمة تانية (زي "verified" القديمة اللي ممكن تكون فاضلة من قبل الـMigration
// على حسابات معندهاش بطاقة فعلية). أي حالة تانية (pending/verified/rejected/
// needs_data/needs_id_reupload) بتفضل معتمدة على identity_status القديم عشان
// ميضيعش تفاصيل زي needs_data المش موجودة أصلًا في النظام الجديد
function identityStatusValue(w){
  if(w.identity_verification_status==='not_submitted') return 'not_submitted';
  return String(w.identity_status||w.verification_status||(ok(w.identity_verified)?"verified":"pending")).trim()||"pending"
}
function identityStatusLabel(v){return {not_submitted:"لم يقدّم طلب توثيق",pending:"بانتظار المراجعة",verified:"تم التحقق",rejected:"مرفوض",needs_data:"يحتاج تعديل بيانات",needs_id_reupload:"إعادة رفع البطاقة"}[v]||"بانتظار المراجعة"}
function identityStatusClass(v){return {not_submitted:"status-gray",pending:"status-yellow",verified:"status-green",rejected:"status-red",needs_data:"status-blue",needs_id_reupload:"status-purple"}[v]||"status-yellow"}
function identityStatusIcon(v){return {pending:"fa-clock",verified:"fa-circle-check",rejected:"fa-circle-xmark",needs_data:"fa-pen-to-square",needs_id_reupload:"fa-id-card"}[v]||"fa-clock"}
function identityReason(w){return w.identity_rejection_reason||w.identity_reason||w.rejection_reason||""}
function identityNote(w){return w.identity_review_note||w.identity_admin_note||""}
function hasPendingChanges(w){return ok(w.has_pending_changes)||!!w.pending_image}

// طلبات التوثيق (بند 22.4) - تبويب مستقل من نفس allWorkers، بيبدأ بالمعلّق
// أولًا، وبيستخدم نفس openIdentityDoc (وصول آمن Signed URL موجود بالفعل)
// ونفس openIdentity/openIdentityReviewModal (اعتماد/رفض بنفس الـAPI الحالي)
// من غير أي تغيير لمنطق identity_verified
const IDENTITY_SORT_ORDER={pending:0,needs_data:1,needs_id_reupload:1,rejected:2,verified:3,not_submitted:4};
function identityReqActions(w){
  const id=adminActionsEscapeAttr(wid(w));
  const hasFront=!!(w.id_front_url||w.id_front_path), hasBack=!!(w.id_back_url||w.id_back_path);
  const docBtns=(hasFront?`<button type="button" class="icon-action-btn btn-blue" onclick="openIdentityDoc('${id}','front')" title="وجه البطاقة"><i class="fa-solid fa-id-card"></i></button>`:"")+
                (hasBack?`<button type="button" class="icon-action-btn btn-blue" onclick="openIdentityDoc('${id}','back')" title="ظهر البطاقة"><i class="fa-solid fa-id-card-clip"></i></button>`:"");
  return `<div class="admin-row-actions">${docBtns}<button type="button" class="icon-action-btn btn-dark" onclick="openIdentityReviewModal('${id}')" title="مراجعة / اعتماد / رفض"><i class="fa-solid fa-shield-halved"></i></button></div>`;
}

function renderIdentityRequestsAdmin(){
  const box=document.getElementById("identityReqList"); if(!box)return;
  const statsBox=document.getElementById("identityReqStats");
  const counts={pending:0,verified:0,needs_data:0,needs_id_reupload:0,rejected:0};
  allWorkers.forEach(w=>{ const s=identityStatusValue(w); if(counts[s]!==undefined) counts[s]++; });
  if(statsBox) statsBox.innerHTML=[
    ["fa-users",allWorkers.length,"الكل"],
    ["fa-clock",counts.pending,"بانتظار المراجعة"],
    ["fa-circle-check",counts.verified,"موثّق"],
    ["fa-pen-to-square",counts.needs_data+counts.needs_id_reupload,"يحتاج إجراء"],
    ["fa-circle-xmark",counts.rejected,"مرفوض"]
  ].map(([icon,val,label])=>`<div class="admin-stat"><div class="admin-stat-icon"><i class="fa-solid ${icon}"></i></div><div><h3>${val}</h3><p>${label}</p></div></div>`).join("");

  const q=(document.getElementById("identityReqSearch")?.value||"").trim().toLowerCase();
  const sf=document.getElementById("identityReqStatusFilter")?.value||"";
  let rows=allWorkers.filter(w=>{
    const matchSearch=!q||wname(w).toLowerCase().includes(q)||wphone(w).toLowerCase().includes(q);
    const matchStatus=!sf||identityStatusValue(w)===sf;
    return matchSearch&&matchStatus;
  });
  rows=rows.slice().sort((a,b)=>(IDENTITY_SORT_ORDER[identityStatusValue(a)]??9)-(IDENTITY_SORT_ORDER[identityStatusValue(b)]??9));

  if(!rows.length){box.innerHTML='<div class="empty-admin">لا يوجد طلبات توثيق مطابقة.</div>';return}

  const rowsHtml=rows.map(w=>{
    const id=String(wid(w)); const status=identityStatusValue(w); const reason=identityReason(w);
    return `<tr>
      <td class="admin-td-worker"><img class="admin-table-avatar" loading="lazy" decoding="async" src="${wimg(w)}" onerror="this.onerror=null;this.src='/icons/default-worker-avatar.png'"><div><strong>${esc(wname(w))}</strong><span class="admin-td-sub">${esc(wtrade(w))}</span></div></td>
      <td>${esc(wphone(w)||"—")}</td>
      <td>${formatDate(w.created_at)}</td>
      <td><span class="status-badge ${identityStatusClass(status)}"><i class="fa-solid ${identityStatusIcon(status)}"></i>${identityStatusLabel(status)}</span>${reason?`<div class="admin-td-sub" style="margin-top:4px;color:#991b1b;">${esc(reason)}</div>`:""}</td>
      <td>${identityReqActions(w)}</td>
    </tr>`;
  }).join("");

  const cardsHtml=rows.map(w=>{
    const id=String(wid(w)); const status=identityStatusValue(w); const reason=identityReason(w);
    return `<article class="admin-worker-compact-card">
      <div class="admin-worker-compact-head">
        <img class="admin-table-avatar" loading="lazy" decoding="async" src="${wimg(w)}" onerror="this.onerror=null;this.src='/icons/default-worker-avatar.png'">
        <div class="admin-worker-compact-info">
          <h4>${esc(wname(w))}</h4>
          <span class="admin-td-sub"><i class="fa-solid fa-screwdriver-wrench"></i> ${esc(wtrade(w))} · <i class="fa-solid fa-phone"></i> ${esc(wphone(w)||"—")}</span>
          <span class="admin-td-sub">تاريخ التسجيل: ${formatDate(w.created_at)}</span>
        </div>
      </div>
      <div class="status-row">
        <span class="status-badge ${identityStatusClass(status)}"><i class="fa-solid ${identityStatusIcon(status)}"></i>${identityStatusLabel(status)}</span>
      </div>
      ${reason?`<div class="admin-td-sub" style="color:#991b1b;margin-bottom:8px;"><i class="fa-solid fa-circle-exclamation"></i> ${esc(reason)}</div>`:""}
      ${identityReqActions(w)}
    </article>`;
  }).join("");

  box.innerHTML=`
    <div class="admin-table-wrap">
      <table class="admin-table">
        <thead><tr><th>الصنايعي</th><th>الهاتف</th><th>تاريخ التسجيل</th><th>الحالة</th><th>إجراءات</th></tr></thead>
        <tbody>${rowsHtml}</tbody>
      </table>
    </div>
    <div class="admin-worker-compact-list">${cardsHtml}</div>
  `;
}

function renderIdentityDocsAdmin(w){
  const id=wid(w), docsOk=hasIdentityDocs(w), status=identityStatusValue(w), reason=identityReason(w), note=identityNote(w);
  const hasFront = !!(w.id_front_url || w.id_front_path); const hasBack = !!(w.id_back_url || w.id_back_path);
  return `<div class="subscription-box"><strong><i class="fa-solid fa-id-card"></i> مستندات التحقق</strong><div class="status-row"><span class="status-badge ${docsOk?'status-green':'status-red'}">${docsOk?'تم رفع وجه وظهر البطاقة':'البطاقة غير مكتملة'}</span><span class="status-badge ${identityStatusClass(status)}"><i class="fa-solid ${identityStatusIcon(status)}"></i>${identityStatusLabel(status)}</span></div>${reason?`<div class="verification-note"><strong>السبب:</strong> ${reason}</div>`:""}${note?`<span class="verification-small">ملاحظة إدارية: ${note}</span>`:""}<div class="card-actions" style="margin-top: 10px;">${hasFront || hasBack ? `<button type="button" class="action-btn btn-blue" onclick="loadAndShowIdImages('${id}')"><i class="fa-solid fa-image"></i> عرض صور البطاقة</button>` : ''}<button type="button" class="action-btn btn-dark" onclick="openIdentityReviewModal('${id}')"><i class="fa-solid fa-shield-halved"></i> مراجعة التحقق</button></div></div>`;
}

function esc(v){ return String(v ?? "").replace(/[&<>"']/g, c => ({"&":"&amp;","<":"&lt;",">":"&gt;", '"':"&quot;", "'":"&#39;"}[c] || c)); }
window.resolveWorkerFromButton = function(btn){
  const card = btn && btn.closest ? btn.closest('.admin-worker-card') : null;
  const candidates = [btn && btn.dataset ? btn.dataset.workerId : '', card && card.dataset ? card.dataset.workerCardId : ''].filter(Boolean);
  for(const token of candidates){ const raw = String(token || '').trim(); const found = allWorkers.find(w => String(wid(w)) === raw); if(found) return found; }
  return null;
};

function closeForceModal(){ const old=document.getElementById('adminActionForceModalV8'); if(old) old.remove(); document.body.style.overflow=''; document.documentElement.style.overflow=''; }
window.closeAdminActionForceModalV8 = closeForceModal;

function openForceModal(title, bodyHtml){
  closeForceModal(); const wrap=document.createElement('div'); wrap.id='adminActionForceModalV8'; wrap.dir='rtl'; wrap.className='modal-backdrop show';
  wrap.innerHTML = `<div class="modal-card"><div class="modal-head"><h2 style="margin:0;font-size:22px;color:var(--primary);font-weight:900;">${esc(title)}</h2><button type="button" class="close-modal" onclick="closeAdminActionForceModalV8()">×</button></div>${bodyHtml}</div>`;
  wrap.addEventListener('mousedown', function(e){ if(e.target===wrap) closeForceModal(); });
  document.body.appendChild(wrap); document.body.style.overflow='hidden'; document.documentElement.style.overflow='hidden';
}

function workerSummary(w){ return `<div class="identity-summary" style="background:var(--bg);border:1px solid var(--border);border-radius:18px;padding:14px;margin-bottom:16px;"><strong>${esc(wname(w))}</strong><span style="display:block;margin-top:5px;">${esc(wtrade(w))} - ${esc(warea(w))} | اتصال: ${esc(wphone(w)||'غير متاح')} | واتساب: ${esc(wwhatsapp(w)||wphone(w)||'غير متاح')}</span></div>`; }

function selectOptions(list, current){
  const seen = new Set(); let out = `<option value="${esc(current||'')}">${esc(current||'اختر')}</option>`;
  (Array.isArray(list)?list:[]).forEach(i=>{ const n = itemName(i); if(!n || seen.has(n)) return; seen.add(n); out += `<option value="${esc(n)}" ${n===current?'selected':''}>${esc(n)}</option>`; });
  return out;
}

// إرسال موحّد لنماذج المودالات: يتكفل بحالة الزرار (تعطيل/نص) ويرجّعها لطبيعتها دايمًا حتى لو فشل الطلب
async function submitForceForm(form,{url,method,buildBody,busyText,successMsg,defaultErrorMsg,onSuccess}){
  form.onsubmit = async function(e){
    e.preventDefault();
    const btn=e.submitter;
    const originalText=btn?btn.textContent:'';
    try{
      if(btn){btn.disabled=true;btn.textContent=busyText||'جاري الحفظ...';}
      const reqBody=buildBody();
      const r=await fetch(url,{method,credentials:'include',headers:{'Content-Type':'application/json'},body:JSON.stringify(reqBody)});
      const d=await r.json().catch(()=>({}));
      if(!r.ok || d.success===false) throw new Error(d.error||defaultErrorMsg);
      toast('success',successMsg); closeForceModal();
      if(onSuccess) await onSuccess(d,reqBody);
    }catch(ex){
      toast('error', ex.message||defaultErrorMsg);
    }finally{
      if(btn){btn.disabled=false;btn.textContent=originalText;}
    }
  };
}

function openEdit(w){
  const id=String(wid(w));
  openForceModal('تعديل بيانات الصنايعي', `${workerSummary(w)}
    <form id="forceEditFormV8">
      <div class="edit-grid">
        <label class="edit-field"><b>الاسم</b><input id="v8_name" value="${esc(wname(w))}" required></label>
        <label class="edit-field"><b>رقم الاتصال</b><input id="v8_phone" value="${esc(wphone(w))}" required></label>
        <label class="edit-field"><b>رقم الواتساب</b><input id="v8_whatsapp" value="${esc(wwhatsapp(w))}" placeholder="اتركه فارغًا لو نفس رقم الاتصال"></label>
        <label class="edit-field"><b>الحرفة</b><select id="v8_trade">${selectOptions(allTrades,wtrade(w))}</select></label>
        <label class="edit-field"><b>المنطقة</b><select id="v8_area">${selectOptions(allAreas,warea(w))}</select></label>
        <label class="edit-field full"><b>الوصف</b><textarea id="v8_description" style="min-height:120px">${esc(wdesc(w))}</textarea></label>
      </div>
      <div class="modal-actions">
        <button type="button" onclick="closeAdminActionForceModalV8()" class="modal-btn modal-btn-cancel">إلغاء</button>
        <button type="submit" class="modal-btn modal-btn-primary">حفظ التعديل</button>
      </div>
    </form>`);
  submitForceForm(document.getElementById('forceEditFormV8'),{
    url:'/api/workers/'+id, method:'PUT',
    buildBody:()=>({name:document.getElementById('v8_name').value.trim(),phone:document.getElementById('v8_phone').value.trim(),whatsapp:document.getElementById('v8_whatsapp').value.trim(),trade:document.getElementById('v8_trade').value.trim(),area:document.getElementById('v8_area').value.trim(),description:document.getElementById('v8_description').value.trim()}),
    successMsg:'تم تعديل بيانات الصنايعي', defaultErrorMsg:'فشل تعديل البيانات',
    onSuccess:(d,reqBody)=>{ patchWorkerLocal(id,reqBody); }
  });
}

function openIdentity(w){
  const id=String(wid(w)); const st=identityStatusValue(w);
  openForceModal('مراجعة تحقق الصنايعي', `${workerSummary(w)}
    <form id="forceIdentityFormV8">
      <div class="edit-grid">
        <label class="edit-field"><b>حالة التحقق</b><select id="v8_identity_status">
          <option value="pending" ${st==='pending'?'selected':''}>بانتظار المراجعة</option>
          <option value="verified" ${st==='verified'?'selected':''}>تم التحقق والاعتماد</option>
          <option value="rejected" ${st==='rejected'?'selected':''}>مرفوض</option>
          <option value="needs_data" ${st==='needs_data'?'selected':''}>يحتاج تعديل بيانات</option>
          <option value="needs_id_reupload" ${st==='needs_id_reupload'?'selected':''}>إعادة رفع البطاقة</option>
        </select></label>
        <label class="edit-field"><b>سبب مختصر للصنايعي</b><input id="v8_identity_reason" value="${esc(identityReason(w))}"></label>
        <label class="edit-field full"><b>ملاحظة إدارية داخلية</b><textarea id="v8_identity_note" style="min-height:110px">${esc(identityNote(w))}</textarea></label>
      </div>
      <div style="background:#fef3c7;color:#92400e;border:1px solid #fde68a;border-radius:16px;padding:12px;margin-top:14px;font-weight:900;">يمكن اعتماد الصنايعي حتى لو لم يرفع وجه وظهر البطاقة.</div>
      <div class="modal-actions">
        <button type="button" onclick="closeAdminActionForceModalV8()" class="modal-btn modal-btn-cancel">إلغاء</button>
        <button type="submit" class="modal-btn modal-btn-info">حفظ قرار التحقق</button>
      </div>
    </form>`);
  submitForceForm(document.getElementById('forceIdentityFormV8'),{
    url:'/api/admin/workers/'+id+'/identity-review', method:'PUT',
    buildBody:()=>({identity_status:document.getElementById('v8_identity_status').value,reason:document.getElementById('v8_identity_reason').value.trim(),note:document.getElementById('v8_identity_note').value.trim()}),
    successMsg:'تم حفظ قرار التحقق', defaultErrorMsg:'فشل حفظ قرار التحقق',
    onSuccess:async(d,reqBody)=>{
      const isVerified=reqBody.identity_status==='verified';
      patchWorkerLocal(id,{identity_status:reqBody.identity_status,identity_verified:isVerified,identity_rejection_reason:reqBody.reason,identity_review_note:reqBody.note,...(isVerified?{approved:true}:{})});
    }
  });
}

async function openRenew(w){
  const id=String(wid(w)); const sub=subInfo(w);
  if(!__subPricingCache){ try{ const r=await fetch("/api/admin/settings/subscription-pricing",{credentials:"include"}); const d=await r.json(); if(d.success) __subPricingCache=d.pricing; }catch(e){} }
  const plans=(__subPricingCache&&__subPricingCache.plans)||{month:{months:1,price:100},quarter:{months:3,price:285},half:{months:6,price:540},year:{months:12,price:1020}};
  const planLabels={month:"شهر",quarter:"ربع سنوي (3 أشهر)",half:"نصف سنوي (6 أشهر)",year:"سنوي (12 شهر)"};
  const planOptions=Object.keys(plans).map(k=>`<option value="${k}">${planLabels[k]} - ${plans[k].price} جنيه</option>`).join("")+'<option value="custom">مخصص</option>';

  openForceModal('الاشتراك والتجديد', `${workerSummary(w)}
    <div style="background:#f8fafc;border:1px solid #e5e7eb;border-radius:16px;padding:12px;margin-bottom:14px;font-weight:900;color:#475569;">نهاية الاشتراك الحالية: ${esc(formatDate(sub.end))}</div>
    <form id="forceRenewFormV8">
      <div class="edit-grid">
        <label class="edit-field"><b>الباقة</b><select id="v8_renew_plan">${planOptions}</select></label>
        <label class="edit-field"><b>عدد الشهور</b><input id="v8_renew_months" type="number" min="1" max="60" value="${plans.month.months}" required></label>
        <label class="edit-field"><b>المبلغ المدفوع</b><input id="v8_renew_amount" type="number" min="0" step="1" value="${plans.month.price}" required></label>
        <label class="edit-field"><b>طريقة الدفع</b><select id="v8_renew_method"><option value="cash">كاش</option><option value="vodafone_cash">فودافون كاش</option><option value="instapay">إنستاباي</option><option value="bank_transfer">تحويل بنكي</option><option value="free">مجاني / هدية</option><option value="other">أخرى</option></select></label>
        <label class="edit-field"><b>حالة الدفع</b><select id="v8_renew_status"><option value="paid">مدفوع</option><option value="pending">منتظر الدفع</option><option value="partial">مدفوع جزئيًا</option></select></label>
        <label class="edit-field full"><b>ملاحظات الدفع</b><textarea id="v8_renew_note" style="min-height:100px"></textarea></label>
      </div>
      <div class="modal-actions">
        <button type="button" onclick="closeAdminActionForceModalV8()" class="modal-btn modal-btn-cancel">إلغاء</button>
        <button type="submit" class="modal-btn modal-btn-primary">حفظ التجديد</button>
      </div>
    </form>`);
  document.getElementById('v8_renew_plan').onchange=function(){
    const p=plans[this.value];
    if(p){ document.getElementById('v8_renew_months').value=p.months; document.getElementById('v8_renew_amount').value=p.price; }
  };
  submitForceForm(document.getElementById('forceRenewFormV8'),{
    url:'/api/workers/'+id+'/renew', method:'PUT',
    buildBody:()=>({plan:document.getElementById('v8_renew_plan').value,months:Number(document.getElementById('v8_renew_months').value)||1,amount:Number(document.getElementById('v8_renew_amount').value)||0,payment_method:document.getElementById('v8_renew_method').value,payment_status:document.getElementById('v8_renew_status').value,note:document.getElementById('v8_renew_note').value.trim()}),
    successMsg:'تم تجديد الاشتراك', defaultErrorMsg:'فشل تجديد الاشتراك',
    onSuccess:()=>refreshWorkersOnly()
  });
}

function openWhatsapp(w){
  const id=String(wid(w)); const phone=wwhatsapp(w)||wphone(w);
  openForceModal('رسائل واتساب', `${workerSummary(w)}
    <label class="edit-field"><b>نص الرسالة</b><textarea id="v8_wa_message" style="min-height:220px">${esc(buildWhatsAppTemplate('approved', w))}</textarea></label>
    <div style="background:#dcfce7;color:#166534;border:1px solid #bbf7d0;border-radius:16px;padding:12px;margin-top:14px;font-weight:900;line-height:1.8">الإرسال التلقائي يستخدم WhatsApp Cloud API. لو فشل بسبب نافذة المحادثة، استخدم زر فتح واتساب يدويًا.</div>
    <div class="modal-actions">
      <button type="button" id="v8_wa_auto" class="modal-btn modal-btn-info">إرسال تلقائي</button>
      <button type="button" id="v8_wa_manual" class="modal-btn modal-btn-whatsapp">فتح واتساب يدويًا</button>
      <button type="button" onclick="closeAdminActionForceModalV8()" class="modal-btn modal-btn-cancel">إغلاق</button>
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
    openForceModal('صورة البطاقة (' + (side==='front'?'وجه':'ظهر') + ')', `<div style="text-align:center;"><img src="${esc(data.url)}" style="max-width:100%;max-height:60vh;object-fit:contain;border-radius:16px;border:1px solid var(--border);"><br><br><a href="${esc(data.url)}" target="_blank" class="modal-btn modal-btn-primary" style="margin-top:14px"><i class="fa-solid fa-arrow-up-right-from-square"></i> فتح في نافذة جديدة</a></div>`);
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

document.addEventListener('keydown', function(e){ if(e.key === 'Escape') closeForceModal(); }, true);

// ==========================================
// دالة حماية النصوص (ضرورية لرسم كروت الصنايعية)
// ==========================================
function adminActionsEscapeAttr(v){
  return String(v ?? "").replace(/&/g,"&amp;").replace(/"/g,"&quot;").replace(/</g,"&lt;").replace(/>/g,"&gt;");
}

function adminWorkerQuickButton(w){
  const id=adminActionsEscapeAttr(wid(w)); const reg=adminActionsEscapeAttr(registrationCodeText(w));
  const phone=adminActionsEscapeAttr(wphone(w)||""); const wa=adminActionsEscapeAttr(wwhatsapp(w)||wphone(w)||"");
  const isActiveState = isActive(w); const activeText = isActiveState ? "إيقاف" : "تفعيل"; const activeClass = isActiveState ? "btn-yellow" : "btn-green"; const activeIcon = isActiveState ? "fa-power-off" : "fa-play";
  const common=`data-worker-id="${id}" data-worker-reg="${reg}" data-worker-phone="${phone}" data-worker-whatsapp="${wa}"`;
  return `<div class="admin-worker-actions-direct-v7"><div class="admin-worker-actions-direct-v7-head"><span><i class="fa-solid fa-screwdriver-wrench"></i> إجراءات الصنايعي</span></div><div class="admin-worker-actions-direct-v7-grid" style="grid-template-columns: repeat(auto-fit, minmax(110px, 1fr));"><button type="button" class="action-btn btn-dark" data-worker-action="edit" ${common}><i class="fa-solid fa-pen-to-square"></i> تعديل</button><button type="button" class="action-btn btn-blue" data-worker-action="identity" ${common}><i class="fa-solid fa-shield-halved"></i> مراجعة</button><button type="button" class="action-btn btn-yellow" data-worker-action="renew" ${common}><i class="fa-solid fa-credit-card"></i> تجديد</button><button type="button" class="action-btn ${activeClass}" data-worker-action="active" ${common}><i class="fa-solid ${activeIcon}"></i> ${activeText}</button><button type="button" class="action-btn btn-red" data-worker-action="delete" ${common}><i class="fa-solid fa-trash"></i> حذف نهائي</button></div></div>`;
}

// إجراءات مضغوطة (نفس data-worker-action/الدوال الأصلية بالضبط، بس أيقونات
// بدل أزرار بعناوين كبيرة) - مستخدمة في الجدول والكارت المختصر الجديدين
function adminWorkerCompactActions(w){
  const id=adminActionsEscapeAttr(wid(w)); const reg=adminActionsEscapeAttr(registrationCodeText(w));
  const phone=adminActionsEscapeAttr(wphone(w)||""); const wa=adminActionsEscapeAttr(wwhatsapp(w)||wphone(w)||"");
  const common=`data-worker-id="${id}" data-worker-reg="${reg}" data-worker-phone="${phone}" data-worker-whatsapp="${wa}"`;
  const activeOn=isActive(w); const activeIcon=activeOn?"fa-power-off":"fa-play"; const activeTitle=activeOn?"إيقاف":"تفعيل"; const activeClass=activeOn?"btn-yellow":"btn-green";
  return `<div class="admin-row-actions">
    <button type="button" class="icon-action-btn btn-dark" data-worker-action="edit" ${common} title="تعديل"><i class="fa-solid fa-pen-to-square"></i></button>
    <button type="button" class="icon-action-btn btn-blue" data-worker-action="identity" ${common} title="مراجعة التوثيق"><i class="fa-solid fa-shield-halved"></i></button>
    <button type="button" class="icon-action-btn btn-yellow" data-worker-action="renew" ${common} title="تجديد الاشتراك"><i class="fa-solid fa-credit-card"></i></button>
    <button type="button" class="icon-action-btn ${activeClass}" data-worker-action="active" ${common} title="${activeTitle}"><i class="fa-solid ${activeIcon}"></i></button>
    <button type="button" class="icon-action-btn btn-red" data-worker-action="delete" ${common} title="حذف نهائي"><i class="fa-solid fa-trash"></i></button>
  </div>`;
}

// إجراءات الكارت المضغوط على الموبايل: زر أساسي واحد ("تعديل") + زر "⋮"
// يفتح قائمة صغيرة فيها باقي نفس الإجراءات الأصلية بالضبط (نفس
// data-worker-action/data attributes) بدل عرض 5 أزرار ملونة جنب بعض
function adminWorkerCardActionsMenu(w){
  const id=adminActionsEscapeAttr(wid(w)); const reg=adminActionsEscapeAttr(registrationCodeText(w));
  const phone=adminActionsEscapeAttr(wphone(w)||""); const wa=adminActionsEscapeAttr(wwhatsapp(w)||wphone(w)||"");
  const common=`data-worker-id="${id}" data-worker-reg="${reg}" data-worker-phone="${phone}" data-worker-whatsapp="${wa}"`;
  const activeOn=isActive(w); const activeIcon=activeOn?"fa-power-off":"fa-play"; const activeTitle=activeOn?"إيقاف":"تفعيل"; const activeClass=activeOn?"btn-yellow":"btn-green";
  return `<div class="admin-card-actions-row">
    <button type="button" class="card-primary-btn" data-worker-action="edit" ${common}><i class="fa-solid fa-pen-to-square"></i> تعديل</button>
    <button type="button" class="card-more-btn" onclick="event.stopPropagation();toggleWorkerCardMenu(this);return false;" aria-label="مزيد من الإجراءات"><i class="fa-solid fa-ellipsis-vertical"></i></button>
  </div>
  <div class="admin-card-actions-menu">
    <button type="button" class="action-btn btn-blue" data-worker-action="identity" ${common} title="مراجعة التوثيق"><i class="fa-solid fa-shield-halved"></i> مراجعة التوثيق</button>
    <button type="button" class="action-btn btn-yellow" data-worker-action="renew" ${common} title="تجديد الاشتراك"><i class="fa-solid fa-credit-card"></i> تجديد الاشتراك</button>
    <button type="button" class="action-btn ${activeClass}" data-worker-action="active" ${common} title="${activeTitle}"><i class="fa-solid ${activeIcon}"></i> ${activeTitle}</button>
    <button type="button" class="action-btn btn-red" data-worker-action="delete" ${common} title="حذف نهائي"><i class="fa-solid fa-trash"></i> حذف نهائي</button>
  </div>`;
}

function closeAllWorkerCardMenus(except){
  document.querySelectorAll(".admin-worker-compact-card.menu-open").forEach(c=>{ if(c!==except) c.classList.remove("menu-open"); });
}
window.toggleWorkerCardMenu = function(btn){
  const card = btn.closest(".admin-worker-compact-card");
  if(!card) return false;
  const willOpen = !card.classList.contains("menu-open");
  closeAllWorkerCardMenus();
  if(willOpen) card.classList.add("menu-open");
  return false;
};
document.addEventListener("click", function(ev){
  const insideMenu = ev.target && ev.target.closest ? ev.target.closest(".admin-card-actions-menu, .card-more-btn") : null;
  if(!insideMenu) closeAllWorkerCardMenus();
}, true);

// شارة تعديل معلّق - نفس openPendingChangesModal() الأصلية، بس كشارة صغيرة
// بدل الصندوق الكبير القديم (التفاصيل الكاملة لسه موجودة جوه المودال نفسه)
function adminWorkerPendingBadge(w){
  const id=adminActionsEscapeAttr(String(wid(w)));
  if(!ok(w.has_pending_changes)) return "";
  return `<button type="button" class="status-badge status-blue" style="border:0;cursor:pointer;" onclick="openPendingChangesModal('${id}')" title="${esc(w.pending_changes_summary||'تعديل جديد من الصنايعي')}"><i class="fa-solid fa-bell fa-shake"></i> تعديل معلّق</button>`;
}

function renderWorkers(workers){
  const grid=document.getElementById("adminWorkersGrid"); grid.innerHTML="";
  if(!workers.length){grid.innerHTML='<div class="empty-admin">لا يوجد صنايعية للعرض حاليًا</div>';return}

  const rowsHtml = workers.map(w=>{
    const id=String(wid(w)); const approved=isApproved(w), active=isActive(w);
    const identity=identityStatusValue(w);
    return `<tr data-worker-card-id="${id}">
      <td class="admin-td-worker"><img class="admin-table-avatar" loading="lazy" decoding="async" src="${wimg(w)}" onerror="this.onerror=null;this.src='/icons/default-worker-avatar.png'"><div><strong>${esc(wname(w))}</strong><span class="admin-td-sub">${esc(wphone(w)||"لا يوجد اتصال")}</span></div></td>
      <td>${esc(wtrade(w))}</td>
      <td>${esc(warea(w))}</td>
      <td><span class="status-badge ${identityStatusClass(identity)}"><i class="fa-solid ${identityStatusIcon(identity)}"></i>${identityStatusLabel(identity)}</span>${adminWorkerPendingBadge(w)}</td>
      <td><span class="status-badge ${active?'status-green':'status-red'}">${active?"نشط":"متوقف"}</span> <span class="status-badge ${approved?'status-green':'status-yellow'}">${approved?"موافق":"بانتظار"}</span></td>
      <td>${renderAdminRating(id)}</td>
      <td>${adminWorkerCompactActions(w)}</td>
    </tr>`;
  }).join("");

  const cardsHtml = workers.map(w=>{
    const id=String(wid(w)); const approved=isApproved(w), active=isActive(w);
    const identity=identityStatusValue(w);
    return `<article class="admin-worker-compact-card" data-worker-card-id="${id}">
      <div class="admin-worker-compact-head">
        <img class="admin-table-avatar" loading="lazy" decoding="async" src="${wimg(w)}" onerror="this.onerror=null;this.src='/icons/default-worker-avatar.png'">
        <div class="admin-worker-compact-info">
          <h4>${esc(wname(w))}</h4>
          <span class="admin-td-sub"><i class="fa-solid fa-screwdriver-wrench"></i> ${esc(wtrade(w))} · <i class="fa-solid fa-location-dot"></i> ${esc(warea(w))}</span>
          ${renderAdminRating(id)}
        </div>
      </div>
      <div class="status-row">
        <span class="status-badge ${identityStatusClass(identity)}"><i class="fa-solid ${identityStatusIcon(identity)}"></i>${identityStatusLabel(identity)}</span>
        <span class="status-badge ${active?'status-green':'status-red'}">${active?"نشط":"متوقف"}</span>
        <span class="status-badge ${approved?'status-green':'status-yellow'}">${approved?"موافق":"بانتظار"}</span>
        ${adminWorkerPendingBadge(w)}
      </div>
      ${adminWorkerCardActionsMenu(w)}
    </article>`;
  }).join("");

  grid.innerHTML = `
    <div class="admin-table-wrap">
      <table class="admin-table">
        <thead><tr><th>الصنايعي</th><th>الحرفة</th><th>المنطقة</th><th>التوثيق</th><th>الحالة</th><th>التقييم</th><th>إجراءات</th></tr></thead>
        <tbody>${rowsHtml}</tbody>
      </table>
    </div>
    <div class="admin-worker-compact-list">${cardsHtml}</div>
  `;
}

let adminSearchDebounceTimer=null;
function debouncedFilterAdminWorkers(){clearTimeout(adminSearchDebounceTimer);adminSearchDebounceTimer=setTimeout(filterAdminWorkers,220);}

function filterAdminWorkers(){
  const s=document.getElementById("adminSearch").value.trim().toLowerCase();
  const tf=document.getElementById("adminTradeFilter").value.trim().toLowerCase();
  const af=document.getElementById("adminAreaFilter").value.trim().toLowerCase();
  const sf=document.getElementById("adminStatusFilter").value;
  const filtered=allWorkers.filter(w=>{
    const search=wname(w).toLowerCase().includes(s)||wphone(w).toLowerCase().includes(s)||wwhatsapp(w).toLowerCase().includes(s)||wtrade(w).toLowerCase().includes(s)||warea(w).toLowerCase().includes(s)||wdesc(w).toLowerCase().includes(s)||registrationCodeText(w).toLowerCase().includes(s);
    const trade=!tf||wtrade(w).toLowerCase()===tf; const area=!af||warea(w).toLowerCase()===af;
    let status=true;
    if(sf==="approved")status=isApproved(w); if(sf==="pending")status=!isApproved(w);
    if(sf==="active")status=isActive(w); if(sf==="inactive")status=!isActive(w);
    if(sf==="featured")status=isFeatured(w);
    const sub=subInfo(w);
    if(sf==="sub_active")status=sub.daysLeft===null||sub.daysLeft>=0;
    if(sf==="sub_soon")status=sub.daysLeft!==null&&sub.daysLeft>=0&&sub.daysLeft<=7;
    if(sf==="sub_expired")status=sub.daysLeft!==null&&sub.daysLeft<0;
    let quick=true;
    if(activeQuickFilter==="identity_pending")quick=identityStatusValue(w)==="pending";
    if(activeQuickFilter==="identity_verified")quick=identityStatusValue(w)==="verified";
    if(activeQuickFilter==="identity_rejected")quick=identityStatusValue(w)==="rejected";
    if(activeQuickFilter==="identity_needs_data")quick=identityStatusValue(w)==="needs_data";
    if(activeQuickFilter==="identity_needs_id_reupload")quick=identityStatusValue(w)==="needs_id_reupload";
    if(activeQuickFilter==="has_pending_changes")quick=hasPendingChanges(w);
    return search&&trade&&area&&status&&quick;
  });
  renderWorkers(sortAdminWorkers(filtered));
}
function clearAdminFilters(){ document.getElementById("adminSearch").value=""; document.getElementById("adminTradeFilter").value=""; document.getElementById("adminAreaFilter").value=""; document.getElementById("adminStatusFilter").value=""; document.getElementById("adminSortFilter").value="default"; setQuickFilter(""); }

let lastReqError = "";
async function reqs(list){lastReqError="";for(const r of list){try{const opt={method:r.method||"POST",credentials:"include",headers:{"Content-Type":"application/json"}};if(r.body)opt.body=JSON.stringify(r.body);const res=await fetch(r.url,opt);if(res.status===401){showLogin();return false}if(res.status===403){const d=await res.json().catch(()=>({}));toast("error",d.error||"ليس لديك صلاحية");return false}if(res.ok)return true;const d=await res.json().catch(()=>({}));lastReqError=d.error||""}catch(e){}}return false}
function after(ok,msg){if(ok){toast("success",msg);loadAllData()}else toast("error",lastReqError||"لم يتم تنفيذ الأمر")}
async function toggleApprove(id,c){const ok=await reqs([{url:`/api/workers/${id}/approve`,method:"PUT",body:{approved:c?0:1}}]);if(ok){toast("success","تم تحديث الموافقة");patchWorkerLocal(id,{approved:c?0:1})}else toast("error",lastReqError||"لم يتم تنفيذ الأمر")}
async function toggleActive(id,c){const ok=await reqs([{url:`/api/workers/${id}/active`,method:"PUT",body:{active:c?0:1}}]);if(ok){toast("success","تم تحديث التفعيل");patchWorkerLocal(id,{active:c?0:1})}else toast("error",lastReqError||"لم يتم تنفيذ الأمر")}
async function toggleFeatured(id,c){const ok=await reqs([{url:`/api/workers/${id}/featured`,method:"PUT",body:{featured:c?0:1}}]);if(ok){toast("success","تم تحديث التمييز");patchWorkerLocal(id,{featured:c?0:1})}else toast("error",lastReqError||"لم يتم تنفيذ الأمر")}
async function deleteWorker(id){if(!confirm("هل أنت متأكد من الحذف النهائي للصنايعي؟ لا يمكن التراجع!"))return;const ok=await reqs([{url:`/api/workers/${id}`,method:"DELETE"}]);if(ok){toast("success","تم حذف الصنايعي نهائياً");removeWorkerLocal(id)}else toast("error",lastReqError||"لم يتم تنفيذ الأمر")}
function openPendingChangesModal(id){
  const w = allWorkers.find(x => String(wid(x)) === String(id));
  if(!w) return;
  const pending = w.pending_changes || {};
  let bodyHtml = workerSummary(w);

  if (pending.profile && typeof pending.profile === 'object') {
    const p = pending.profile;
    const fieldLabel = {name:'الاسم', trade:'الحرفة', area:'المنطقة', whatsapp:'الواتساب', description:'الوصف'};
    const rows = Object.keys(fieldLabel).filter(key => p[key] !== undefined && String(p[key]||'') !== String(w[key]||'')).map(key => {
      return `<div style="display:grid;grid-template-columns:90px 1fr 18px 1fr;gap:8px;align-items:center;margin-bottom:8px;">
        <b style="font-size:12px;color:#64748b;">${fieldLabel[key]}</b>
        <span style="background:#fee2e2;color:#991b1b;border-radius:10px;padding:7px 9px;font-size:12px;text-decoration:line-through;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">${esc(w[key]||'-')}</span>
        <span style="text-align:center;color:#94a3b8;">←</span>
        <span style="background:#dcfce7;color:#166534;border-radius:10px;padding:7px 9px;font-size:12px;font-weight:900;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">${esc(p[key]||'-')}</span>
      </div>`;
    }).join('');
    bodyHtml += `<div style="margin-bottom:16px;"><h3 style="font-size:15px;color:#0f172a;margin-bottom:10px;"><i class="fa-solid fa-user-pen"></i> تعديل البيانات الأساسية</h3>${rows || '<div style="color:#94a3b8;font-size:13px;">لا يوجد فرق فعلي عن البيانات الحالية</div>'}</div>`;
  }

  if (Array.isArray(pending.work_photos)) {
    const currentPhotos = (w.work_photos||[]).map(ph=>`<img src="${getValidImageUrl(ph)}" style="width:64px;height:64px;object-fit:cover;border-radius:8px;border:1px solid #e5e7eb;">`).join('') || '<span style="color:#94a3b8;font-size:12px;">لا توجد صور حالية</span>';
    const proposedPhotos = pending.work_photos.map(ph=>`<img src="${getValidImageUrl(ph)}" style="width:64px;height:64px;object-fit:cover;border-radius:8px;border:2px solid #16a34a;">`).join('') || '<span style="color:#94a3b8;font-size:12px;">هيبقى فاضي (حذف كل الصور)</span>';
    bodyHtml += `<div style="margin-bottom:16px;"><h3 style="font-size:15px;color:#0f172a;margin-bottom:10px;"><i class="fa-solid fa-images"></i> معرض الأعمال</h3>
      <div style="margin-bottom:8px;"><small style="color:#64748b;">الحالي:</small><div style="display:flex;gap:6px;flex-wrap:wrap;margin-top:4px;">${currentPhotos}</div></div>
      <div><small style="color:#16a34a;font-weight:900;">المقترح:</small><div style="display:flex;gap:6px;flex-wrap:wrap;margin-top:4px;">${proposedPhotos}</div></div>
    </div>`;
  }

  if (pending.image) {
    bodyHtml += `<div style="margin-bottom:16px;"><h3 style="font-size:15px;color:#0f172a;margin-bottom:10px;"><i class="fa-solid fa-image"></i> الصورة الشخصية</h3>
      <div style="display:flex;gap:16px;align-items:center;">
        <div style="text-align:center;"><small style="color:#64748b;display:block;margin-bottom:4px;">الحالية</small><img src="${wimg(w)}" style="width:76px;height:76px;object-fit:cover;border-radius:50%;border:1px solid #e5e7eb;"></div>
        <i class="fa-solid fa-arrow-left" style="color:#94a3b8;"></i>
        <div style="text-align:center;"><small style="color:#16a34a;font-weight:900;display:block;margin-bottom:4px;">المقترحة</small><img src="${getValidImageUrl(pending.image)}" style="width:76px;height:76px;object-fit:cover;border-radius:50%;border:2px solid #16a34a;"></div>
      </div>
    </div>`;
  }

  bodyHtml += `<div class="edit-field">
    <label><b>سبب الرفض (اختياري - هيوصل للصنايعي في شات مراسلة الإدارة)</b><textarea id="v8_reject_reason" style="min-height:80px"></textarea></label>
  </div>
  <div class="modal-actions">
    <button type="button" onclick="closeAdminActionForceModalV8()" class="modal-btn modal-btn-muted">إغلاق</button>
    <button type="button" onclick="rejectPendingChanges('${id}')" class="modal-btn modal-btn-cancel"><i class="fa-solid fa-xmark"></i> رفض</button>
    <button type="button" onclick="approvePendingChanges('${id}')" class="modal-btn modal-btn-success"><i class="fa-solid fa-check"></i> اعتماد كل التعديلات</button>
  </div>`;

  openForceModal('مراجعة تعديل الصنايعي', bodyHtml);
}

async function approvePendingChanges(id){
  const ok = await reqs([{url:`/api/admin/workers/${id}/approve-pending-changes`,method:"POST"}]);
  closeForceModal();
  if(ok){ toast("success","تم اعتماد التعديلات"); refreshWorkersOnly(); } else toast("error",lastReqError||"لم يتم تنفيذ الأمر");
}

async function rejectPendingChanges(id){
  const reason = (document.getElementById('v8_reject_reason')?.value || '').trim();
  const ok = await reqs([{url:`/api/admin/workers/${id}/reject-pending-changes`,method:"POST",body:{reason}}]);
  closeForceModal();
  if(ok){ toast("success","تم رفض التعديلات"); refreshWorkersOnly(); } else toast("error",lastReqError||"لم يتم تنفيذ الأمر");
}

async function renewAllWorkers() {
    const monthsInput = prompt("كم عدد الشهور التي تريد إضافتها لكل الصنايعية؟", "1");
    if (!monthsInput) return;
    const months = parseInt(monthsInput);
    if (isNaN(months) || months <= 0) { toast("error", "الرجاء إدخال عدد صحيح صالح."); return; }
    if (!confirm(`هل أنت متأكد أنك تريد تجديد اشتراك جميع الصنايعية بزيادة ${months} شهر؟`)) return;
    try {
        const response = await fetch('/api/admin/workers/renew-all', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ months: months }) });
        const result = await response.json();
        if (response.ok && result.success) { toast("success", result.message); loadAllData(); } else { toast("error", 'فشل التجديد الجماعي: ' + (result.error || 'خطأ غير معروف')); }
    } catch (err) { console.error(err); toast("error", 'حدث خطأ في الاتصال بالسيرفر.'); }
}

function renderTrades(){const list=document.getElementById("tradesList");list.innerHTML=allTrades.length?allTrades.map(i=>`<div class="list-item"><strong>${itemName(i)}</strong><button class="action-btn btn-red" onclick="deleteTrade('${itemId(i)}')">حذف</button></div>`).join(""):'<div class="empty-admin">لا توجد حرف</div>'}
async function addTrade(e){e.preventDefault();const input=document.getElementById("newTradeInput"),name=input.value.trim();if(!name)return toast("error","اكتب اسم الحرفة");const ok=await reqs([{url:"/api/trades",method:"POST",body:{name}}]);if(ok){input.value="";await loadTrades();toast("success","تمت إضافة الحرفة")}else toast("error",lastReqError||"لم تتم الإضافة")}
async function deleteTrade(id){if(!confirm("حذف الحرفة؟"))return;const ok=await reqs([{url:`/api/trades/${id}`,method:"DELETE"}]);if(ok){await loadTrades();toast("success","تم حذف الحرفة")}else toast("error",lastReqError||"لم يتم الحذف")}
function renderAreas(){const list=document.getElementById("areasList");list.innerHTML=allAreas.length?allAreas.map(i=>`<div class="list-item"><strong>${itemName(i)}</strong><button class="action-btn btn-red" onclick="deleteArea('${itemId(i)}')">حذف</button></div>`).join(""):'<div class="empty-admin">لا توجد مناطق</div>'}
async function addArea(e){e.preventDefault();const input=document.getElementById("newAreaInput"),name=input.value.trim();if(!name)return toast("error","اكتب اسم المنطقة");const ok=await reqs([{url:"/api/areas",method:"POST",body:{name}}]);if(ok){input.value="";await loadAreas();toast("success","تمت إضافة المنطقة")}else toast("error",lastReqError||"لم تتم الإضافة")}
async function deleteArea(id){if(!confirm("حذف المنطقة؟"))return;const ok=await reqs([{url:`/api/areas/${id}`,method:"DELETE"}]);if(ok){await loadAreas();toast("success","تم حذف المنطقة")}else toast("error",lastReqError||"لم يتم الحذف")}

// ==========================================
// محتوى الرئيسية: Hero Slides
// كل الإنشاء/التعديل بقى داخل Modal منظم (نفس نمط .modal-backdrop/.modal-card
// المستخدم في باقي لوحة الإدارة - راجع openForceModal) بدل فورم طويل غير
// منظم Inline. الحذف بيستخدم نفس confirm() المستخدم في كل لوحة الإدارة.
// ==========================================
let allHeroSlides = [];
let heroSlidePreviewUrl = null; // Object URL لمعاينة الصورة الجديدة قبل الحفظ - بيتنضف عند إغلاق/حفظ الـModal

async function loadHeroSlidesAdmin(){
  const d = await fetchJson(["/api/admin/hero-slides"]);
  allHeroSlides = (d && d.success) ? (d.data||[]) : [];
  renderHeroSlidesAdmin();
}

// حالة الشريحة الفعلية (نشطة/غير نشطة/مجدولة/منتهية) محسوبة من is_active +
// start_at/end_at مقابل الوقت الحالي - نفس منطق الفلترة في GET /api/hero-slides
// بالباك إند، بس هنا للعرض فقط في لوحة الإدارة
function heroSlideStatus(s){
  const now = new Date();
  if(!s.is_active) return { key: "inactive", label: "غير نشطة" };
  if(s.start_at && new Date(s.start_at) > now) return { key: "scheduled", label: "مجدولة" };
  if(s.end_at && new Date(s.end_at) < now) return { key: "expired", label: "منتهية" };
  return { key: "active", label: "نشطة" };
}

function renderHeroSlidesAdmin(){
  const list = document.getElementById("heroSlidesList");
  if(!list) return;
  list.innerHTML = allHeroSlides.length ? allHeroSlides.map(s => {
    const status = heroSlideStatus(s);
    return `
    <div class="hp-content-card">
      <img class="hp-content-thumb" src="${esc(s.image)}" alt="" onerror="this.style.visibility='hidden'" />
      <div class="hp-content-info">
        <strong>${esc(s.title)}</strong>
        <div class="hp-content-meta">
          <span class="hp-status-badge hp-status-${status.key}">${status.label}</span>
          <span>ترتيب ${esc(s.sort_order)}</span>
        </div>
      </div>
      <div class="hp-content-actions">
        <button class="action-btn" onclick="openHeroSlideModal('${s.id}')"><i class="fa-solid fa-pen"></i> تعديل</button>
        <button class="action-btn btn-red" onclick="deleteHeroSlide(${s.id})"><i class="fa-solid fa-trash"></i> حذف</button>
      </div>
    </div>`;
  }).join("") : '<div class="empty-admin">لا توجد شرائح</div>';
}

function closeHeroSlideModal(){
  const old = document.getElementById("heroSlideModalV1");
  if(old) old.remove();
  if(heroSlidePreviewUrl){ URL.revokeObjectURL(heroSlidePreviewUrl); heroSlidePreviewUrl = null; }
  document.body.style.overflow = "";
}

function openHeroSlideModal(id){
  const s = id ? allHeroSlides.find(x => String(x.id) === String(id)) : null;
  closeHeroSlideModal();
  const wrap = document.createElement("div");
  wrap.id = "heroSlideModalV1"; wrap.dir = "rtl"; wrap.className = "modal-backdrop show";
  wrap.innerHTML = `
    <div class="modal-card">
      <div class="modal-head">
        <h2 style="margin:0;font-size:20px;color:var(--primary);font-weight:900;">${s ? "تعديل شريحة" : "إضافة شريحة جديدة"}</h2>
        <button type="button" class="close-modal" onclick="closeHeroSlideModal()">×</button>
      </div>
      <form id="heroSlideForm" onsubmit="saveHeroSlide(event)">
        <input type="hidden" id="heroSlideId" value="${s ? esc(s.id) : ""}" />
        <div class="edit-grid">
          <div class="edit-field full">
            <label>الصورة (JPG/PNG/WEBP، حتى 6 ميجا)</label>
            <div style="display:flex;align-items:center;gap:12px;flex-wrap:wrap">
              <img id="heroSlideImgPreview" src="${s && s.image ? esc(s.image) : ""}" alt="" style="width:110px;height:70px;object-fit:cover;border-radius:10px;background:#e2e8f0;${s && s.image ? "" : "display:none"}" />
              <input id="heroSlideImageFile" type="file" accept="image/png,image/jpeg,image/webp" onchange="previewHeroSlideImage(this)" style="flex:1 1 200px" />
            </div>
            <input id="heroSlideImageUrl" type="text" placeholder="أو رابط صورة جاهز" value="${s ? esc(s.image||"") : ""}" style="margin-top:8px" />
          </div>
          <div class="edit-field full">
            <label>العنوان</label>
            <input id="heroSlideTitle" type="text" required value="${s ? esc(s.title||"") : ""}" />
          </div>
          <div class="edit-field full">
            <label>الوصف (اختياري)</label>
            <textarea id="heroSlideDescription">${s ? esc(s.description||"") : ""}</textarea>
          </div>
          <div class="edit-field">
            <label>نص الزر (اختياري)</label>
            <input id="heroSlideButtonText" type="text" value="${s ? esc(s.button_text||"") : ""}" />
          </div>
          <div class="edit-field">
            <label>رابط الزر</label>
            <input id="heroSlideButtonLink" type="text" placeholder="# أو URL" value="${s ? esc(s.button_link||"") : ""}" />
          </div>
          <div class="edit-field">
            <label>ترتيب العرض</label>
            <input id="heroSlideSortOrder" type="number" value="${s ? esc(s.sort_order||0) : 0}" />
          </div>
          <div class="edit-field">
            <label>الحالة</label>
            <label style="display:flex;align-items:center;gap:8px;height:44px"><input id="heroSlideActive" type="checkbox" ${!s || s.is_active ? "checked" : ""} /> نشطة</label>
          </div>
          <div class="edit-field">
            <label>يبدأ العرض من (اختياري)</label>
            <input id="heroSlideStartAt" type="datetime-local" value="${s && s.start_at ? s.start_at.slice(0,16) : ""}" />
          </div>
          <div class="edit-field">
            <label>ينتهي العرض في (اختياري)</label>
            <input id="heroSlideEndAt" type="datetime-local" value="${s && s.end_at ? s.end_at.slice(0,16) : ""}" />
          </div>
        </div>
        <div class="modal-actions">
          <button type="button" class="modal-btn modal-btn-muted" onclick="closeHeroSlideModal()">إلغاء</button>
          <button type="submit" class="modal-btn modal-btn-primary"><i class="fa-solid fa-floppy-disk"></i> حفظ الشريحة</button>
        </div>
      </form>
    </div>`;
  document.body.appendChild(wrap);
  document.body.style.overflow = "hidden";
}

// معاينة فورية للصورة الجديدة المرفوعة قبل الحفظ (Object URL محلي - مش بيتبعت
// للسيرفر إلا لما يضغط "حفظ الشريحة")
function previewHeroSlideImage(input){
  const img = document.getElementById("heroSlideImgPreview");
  if(!img) return;
  if(heroSlidePreviewUrl){ URL.revokeObjectURL(heroSlidePreviewUrl); heroSlidePreviewUrl = null; }
  const file = input.files && input.files[0];
  if(!file) return;
  heroSlidePreviewUrl = URL.createObjectURL(file);
  img.src = heroSlidePreviewUrl;
  img.style.display = "";
}

async function saveHeroSlide(e){
  e.preventDefault();
  const id = document.getElementById("heroSlideId").value;
  const fd = new FormData();
  fd.append("title", document.getElementById("heroSlideTitle").value.trim());
  fd.append("description", document.getElementById("heroSlideDescription").value.trim());
  fd.append("button_text", document.getElementById("heroSlideButtonText").value.trim());
  fd.append("button_link", document.getElementById("heroSlideButtonLink").value.trim());
  fd.append("sort_order", document.getElementById("heroSlideSortOrder").value || 0);
  fd.append("is_active", document.getElementById("heroSlideActive").checked ? "true" : "false");
  const startAt = document.getElementById("heroSlideStartAt").value;
  const endAt = document.getElementById("heroSlideEndAt").value;
  if(startAt) fd.append("start_at", startAt);
  if(endAt) fd.append("end_at", endAt);
  const imageUrl = document.getElementById("heroSlideImageUrl").value.trim();
  if(imageUrl) fd.append("image", imageUrl);
  const file = document.getElementById("heroSlideImageFile").files[0];
  if(file) fd.append("image", file);

  try{
    const res = await fetch(id ? `/api/admin/hero-slides/${id}` : "/api/admin/hero-slides", {
      method: id ? "PUT" : "POST",
      credentials: "include",
      body: fd
    });
    if(res.status===401){showLogin();return}
    const d = await res.json().catch(()=>({}));
    if(res.ok && d.success){
      closeHeroSlideModal();
      await loadHeroSlidesAdmin();
      toast("success", id ? "تم تعديل الشريحة" : "تمت إضافة الشريحة");
    } else {
      toast("error", d.error || "فشل الحفظ");
    }
  }catch(err){ toast("error","تعذر الاتصال بالسيرفر") }
}

async function deleteHeroSlide(id){
  if(!confirm("حذف الشريحة؟")) return;
  const ok = await reqs([{url:`/api/admin/hero-slides/${id}`, method:"DELETE"}]);
  if(ok){ await loadHeroSlidesAdmin(); toast("success","تم حذف الشريحة") }
  else toast("error", lastReqError || "لم يتم الحذف");
}

// ==========================================
// محتوى الرئيسية: Stats Slider
// نفس نمط الـModal، مع فورم يتغير حسب النوع (metric/custom) - metric_key مش
// بيظهر أبدًا في النوع المخصص، والقيمة تفضل للقراءة فقط في نوع "مقياس" لأنها
// بتتحسب لحظيًا من الباك إند
// ==========================================
let allStatsSliderItems = [];
let statsSliderMetricLabels = {};
const STATS_COLOR_THEMES = [
  { key: "navy", label: "كحلي" },
  { key: "blue", label: "أزرق" },
  { key: "green", label: "أخضر" },
  { key: "amber", label: "ذهبي" },
  { key: "purple", label: "بنفسجي" }
];

async function loadStatsSliderAdmin(){
  const d = await fetchJson(["/api/admin/stats-slider"]);
  allStatsSliderItems = (d && d.success) ? (d.data||[]) : [];
  statsSliderMetricLabels = (d && d.metric_labels) || {};
  renderStatsSliderAdmin();
}

function renderStatsSliderAdmin(){
  const list = document.getElementById("statsSliderItemsList");
  if(!list) return;
  list.innerHTML = allStatsSliderItems.length ? allStatsSliderItems.map(s => `
    <div class="hp-content-card">
      <div class="hp-content-icon stat-theme-${esc(s.color_theme||'blue')}"><i class="fa-solid ${esc(s.icon||'fa-chart-simple')}"></i></div>
      <div class="hp-content-info">
        <strong>${esc(s.type==='metric' ? (s.title || statsSliderMetricLabels[s.metric_key] || s.metric_key) : s.title)}</strong>
        <div class="hp-content-meta">
          <span class="hp-status-badge ${s.is_active ? 'hp-status-active' : 'hp-status-inactive'}">${s.is_active ? "نشط" : "متوقف"}</span>
          <span>${s.type==='metric' ? "مقياس تلقائي" : "مخصص: " + esc(s.value||"")}</span>
          <span>ترتيب ${esc(s.sort_order)}</span>
        </div>
      </div>
      <div class="hp-content-actions">
        <button class="action-btn" onclick="openStatsItemModal('${s.id}')"><i class="fa-solid fa-pen"></i> تعديل</button>
        <button class="action-btn btn-red" onclick="deleteStatsItem(${s.id})"><i class="fa-solid fa-trash"></i> حذف</button>
      </div>
    </div>
  `).join("") : '<div class="empty-admin">لا توجد عناصر</div>';
}

function closeStatsItemModal(){
  const old = document.getElementById("statsItemModalV1");
  if(old) old.remove();
  document.body.style.overflow = "";
}

function statsThemeOptionsHtml(selected){
  return STATS_COLOR_THEMES.map(t => `<option value="${t.key}" ${t.key===selected?"selected":""}>${t.label}</option>`).join("");
}

function statsMetricOptionsHtml(selected){
  return Object.entries(statsSliderMetricLabels).map(([k,v]) => `<option value="${esc(k)}" ${k===selected?"selected":""}>${esc(v)}</option>`).join("");
}

function openStatsItemModal(id){
  const s = id ? allStatsSliderItems.find(x => String(x.id) === String(id)) : null;
  const type = s ? s.type : "metric";
  closeStatsItemModal();
  const wrap = document.createElement("div");
  wrap.id = "statsItemModalV1"; wrap.dir = "rtl"; wrap.className = "modal-backdrop show";
  wrap.innerHTML = `
    <div class="modal-card">
      <div class="modal-head">
        <h2 style="margin:0;font-size:20px;color:var(--primary);font-weight:900;">${s ? "تعديل عنصر إحصائية" : "إضافة عنصر إحصائية"}</h2>
        <button type="button" class="close-modal" onclick="closeStatsItemModal()">×</button>
      </div>
      <form id="statsItemForm" onsubmit="saveStatsItem(event)">
        <input type="hidden" id="statsItemId" value="${s ? esc(s.id) : ""}" />
        <div class="edit-grid">
          <div class="edit-field full">
            <label>النوع</label>
            <select id="statsItemType" onchange="onStatsItemTypeChange()">
              <option value="metric" ${type==='metric'?'selected':''}>مقياس (قيمة تلقائية من قاعدة البيانات)</option>
              <option value="custom" ${type==='custom'?'selected':''}>مخصص (نص حر بالكامل)</option>
            </select>
          </div>
          <div class="edit-field" id="statsItemMetricKeyWrap">
            <label>المقياس</label>
            <select id="statsItemMetricKey">${statsMetricOptionsHtml(s ? s.metric_key : "")}</select>
            <span class="verification-small">القيمة تُحسب تلقائيًا ولا يمكن تعديلها يدويًا</span>
          </div>
          <div class="edit-field">
            <label>العنوان ${type==='metric' ? "(اختياري - له عنوان افتراضي)" : ""}</label>
            <input id="statsItemTitle" type="text" value="${s ? esc(s.title||"") : ""}" />
          </div>
          <div class="edit-field" id="statsItemValueWrap">
            <label>القيمة</label>
            <input id="statsItemValue" type="text" value="${s ? esc(s.value||"") : ""}" placeholder="مثال: +500" />
          </div>
          <div class="edit-field">
            <label>نص فرعي (اختياري)</label>
            <input id="statsItemSubtitle" type="text" value="${s ? esc(s.subtitle||"") : ""}" />
          </div>
          <div class="edit-field">
            <label>أيقونة Font Awesome</label>
            <input id="statsItemIcon" type="text" placeholder="مثال: fa-users-gear" value="${s ? esc(s.icon||"") : ""}" />
          </div>
          <div class="edit-field">
            <label>اللون</label>
            <select id="statsItemColorTheme">${statsThemeOptionsHtml(s ? s.color_theme : "blue")}</select>
          </div>
          <div class="edit-field">
            <label>ترتيب العرض</label>
            <input id="statsItemSortOrder" type="number" value="${s ? esc(s.sort_order||0) : 0}" />
          </div>
          <div class="edit-field">
            <label>الحالة</label>
            <label style="display:flex;align-items:center;gap:8px;height:44px"><input id="statsItemActive" type="checkbox" ${!s || s.is_active ? "checked" : ""} /> نشط</label>
          </div>
        </div>
        <div class="modal-actions">
          <button type="button" class="modal-btn modal-btn-muted" onclick="closeStatsItemModal()">إلغاء</button>
          <button type="submit" class="modal-btn modal-btn-primary"><i class="fa-solid fa-floppy-disk"></i> حفظ العنصر</button>
        </div>
      </form>
    </div>`;
  document.body.appendChild(wrap);
  document.body.style.overflow = "hidden";
  onStatsItemTypeChange();
}

// يبدّل ظهور الحقول حسب النوع: metric_key يظهر بس في "مقياس" ومش موجود
// أصلاً في نموذج "مخصص"، والقيمة تبقى للقراءة فقط في "مقياس" لأنها محسوبة
function onStatsItemTypeChange(){
  const type = document.getElementById("statsItemType")?.value;
  const metricWrap = document.getElementById("statsItemMetricKeyWrap");
  const valueInput = document.getElementById("statsItemValue");
  if(!type || !metricWrap || !valueInput) return;
  metricWrap.style.display = type === "metric" ? "" : "none";
  valueInput.readOnly = type === "metric";
  valueInput.placeholder = type === "metric" ? "القيمة تُحسب تلقائيًا" : "مثال: +500";
  if(type === "metric") valueInput.value = "";
}

async function saveStatsItem(e){
  e.preventDefault();
  const id = document.getElementById("statsItemId").value;
  const body = {
    type: document.getElementById("statsItemType").value,
    metric_key: document.getElementById("statsItemMetricKey").value,
    title: document.getElementById("statsItemTitle").value.trim(),
    value: document.getElementById("statsItemValue").value.trim(),
    subtitle: document.getElementById("statsItemSubtitle").value.trim(),
    icon: document.getElementById("statsItemIcon").value.trim(),
    color_theme: document.getElementById("statsItemColorTheme").value,
    sort_order: document.getElementById("statsItemSortOrder").value || 0,
    is_active: document.getElementById("statsItemActive").checked
  };
  const ok = await reqs([{url: id ? `/api/admin/stats-slider/${id}` : "/api/admin/stats-slider", method: id ? "PUT" : "POST", body}]);
  if(ok){
    closeStatsItemModal();
    await loadStatsSliderAdmin();
    toast("success", id ? "تم تعديل العنصر" : "تمت إضافة العنصر");
  } else {
    toast("error", lastReqError || "فشل الحفظ");
  }
}

async function deleteStatsItem(id){
  if(!confirm("حذف العنصر؟")) return;
  const ok = await reqs([{url:`/api/admin/stats-slider/${id}`, method:"DELETE"}]);
  if(ok){ await loadStatsSliderAdmin(); toast("success","تم حذف العنصر") }
  else toast("error", lastReqError || "لم يتم الحذف");
}

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
    const list=approvedGroups[workerId]; const sum=list.reduce((a,b)=>a+b,0);
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
async function toggleReviewApprove(id, current){const approved = current ? 0 : 1;const okReq = await reqs([{url:`/api/reviews/${id}/approve`,method:"PUT",body:{approved}}]);if(okReq){toast("success","تم تحديث حالة التقييم");await loadReviewsAdmin();renderReviews();}else{toast("error",lastReqError||"لم يتم تحديث التقييم");}}
async function deleteReview(id){if(!confirm("هل تريد حذف هذا التقييم؟")) return;const okReq = await reqs([{url:`/api/reviews/${id}`,method:"DELETE"}]);if(okReq){toast("success","تم حذف التقييم");await loadReviewsAdmin();renderReviews();}else{toast("error",lastReqError||"لم يتم حذف التقييم");}}

function downloadBackup(){return downloadFullBackup()}
function adminHtmlEscape(v){return String(v??"").replace(/[&<>"]/g,function(c){return {"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;"}[c]})}
function reportTypeLabel(t){return {wrong_phone:"رقم غير صحيح",wrong_data:"بيانات خاطئة",bad_service:"سوء خدمة",inappropriate_photos:"صور غير مناسبة",other:"أخرى"}[t]||t||"غير محدد"}
function reportStatusLabel(s){return {new:"جديد",reviewing:"قيد المراجعة",resolved:"تم الحل",rejected:"مرفوض"}[s]||s||"غير محدد"}
function reportStatusClass(s){return {new:"status-blue",reviewing:"status-yellow",resolved:"status-green",rejected:"status-red"}[s]||"status-blue"}
function reportDate(v){try{return v?new Date(v).toLocaleString("ar-EG"):"—"}catch(e){return v||"—"}}
async function loadReports(){
  if(!can("reports:read"))return;
  const box=document.getElementById("reportsList"); if(box)box.innerHTML='<div class="empty-admin">جاري تحميل البلاغات...</div>';
  try{
    const r=await fetch("/api/admin/reports",{credentials:"include"});
    const d=await r.json().catch(()=>({}));
    if(!r.ok||!d.success)throw new Error(d.error||"تعذر تحميل البلاغات");
    adminReports=d.items||[]; renderReports(d.stats||{});
  }catch(e){if(box)box.innerHTML=`<div class="empty-admin">${adminHtmlEscape(e.message||"تعذر تحميل البلاغات")}</div>`;}
}
function renderReportStats(stats){
  const s=stats||{}; const total=s.total ?? adminReports.length; const n=s.new ?? adminReports.filter(r=>r.status==='new').length; const rev=s.reviewing ?? adminReports.filter(r=>r.status==='reviewing').length; const res=s.resolved ?? adminReports.filter(r=>r.status==='resolved').length;
  const box=document.getElementById("reportsStats"); if(!box)return;
  box.innerHTML=[["fa-flag",total,"إجمالي البلاغات"],["fa-circle-exclamation",n,"جديد"],["fa-magnifying-glass",rev,"قيد المراجعة"],["fa-circle-check",res,"تم الحل"]]
    .map(([icon,val,label])=>`<div class="admin-stat"><div class="admin-stat-icon"><i class="fa-solid ${icon}"></i></div><div><h3>${val}</h3><p>${label}</p></div></div>`).join("");
}
function renderReports(stats){
  renderReportStats(stats); const box=document.getElementById("reportsList"); if(!box)return;
  const filter=document.getElementById("reportsStatusFilter")?.value||"all";
  const rows=(adminReports||[]).filter(r=>filter==='all'||r.status===filter);
  if(!rows.length){box.innerHTML='<div class="empty-admin">لا توجد بلاغات بهذه الحالة.</div>';return}
  box.innerHTML='<div class="admin-workers-grid">'+rows.map(r=>{
    const w=r.worker||{}; const workerName=adminHtmlEscape(w.name||r.worker_snapshot?.name||`صنايعي رقم ${r.worker_id||""}`);
    const tradeArea=[w.trade||r.worker_snapshot?.trade,w.area||r.worker_snapshot?.area].filter(Boolean).map(adminHtmlEscape).join(" - ");
    const reporter=[r.reporter_name,r.reporter_phone].filter(Boolean).map(adminHtmlEscape).join(" - ")||"غير مذكور";
    const canManage=can("reports:manage");
    return `<div class="review-admin-card"><div class="review-admin-head"><div><h3>${workerName}</h3><div style="color:var(--muted);font-weight:800;margin-top:4px;font-size:12.5px;">${tradeArea||"بيانات الصنايعي غير متاحة"}</div></div><span class="status-badge ${reportStatusClass(r.status)}">${reportStatusLabel(r.status)}</span></div><div class="worker-tags"><span class="worker-tag"><i class="fa-solid fa-triangle-exclamation"></i>${reportTypeLabel(r.report_type)}</span><span class="worker-tag"><i class="fa-solid fa-clock"></i>${reportDate(r.created_at)}</span><span class="worker-tag"><i class="fa-solid fa-user"></i>${reporter}</span></div><div class="review-comment">${adminHtmlEscape(r.message||"")}</div>${r.admin_note?`<div class="review-comment"><strong>ملاحظة الإدارة:</strong><br>${adminHtmlEscape(r.admin_note)}</div>`:""}<div class="card-actions">${r.worker_id?`<a class="action-btn btn-dark" href="/worker/${encodeURIComponent(r.worker_id)}" target="_blank"><i class="fa-solid fa-arrow-up-right-from-square"></i> فتح صفحة الصنايعي</a>`:""}${canManage?`<button class="action-btn btn-blue" onclick="updateReportStatus('${r.id}','reviewing')">قيد المراجعة</button><button class="action-btn btn-green" onclick="updateReportStatus('${r.id}','resolved')">تم الحل</button><button class="action-btn btn-yellow" onclick="updateReportStatus('${r.id}','rejected')">رفض البلاغ</button>`:""}</div></div>`;
  }).join("")+'</div>';
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

// ===============================
// طلبات الخدمة (متابعة فقط - بدون تعديل محتوى الطلب أو التقييم)
// ===============================
const SR_STATUS_LABELS={new:"جديد",accepted:"تم القبول",in_progress:"جاري التنفيذ",completed:"مكتمل",rejected:"مرفوض",cancelled:"ملغي"};
const SR_STATUS_BTN_CLASS={new:"btn-blue",accepted:"btn-green",in_progress:"btn-yellow",completed:"btn-purple",rejected:"btn-red",cancelled:"btn-dark"};
function srDate(v){try{return v?new Date(v).toLocaleString("ar-EG"):"—"}catch(e){return v||"—"}}
function debouncedLoadServiceRequestsAdmin(){clearTimeout(srAdminSearchDebounceTimer);srAdminSearchDebounceTimer=setTimeout(loadServiceRequestsAdmin,300);}

async function loadServiceRequestsAdmin(){
  if(!can("reports:read"))return;
  const box=document.getElementById("srAdminList"); if(box)box.innerHTML='<div class="empty-admin">جاري تحميل طلبات الخدمة...</div>';
  try{
    const status=document.getElementById("srAdminStatusFilter")?.value||"";
    const search=document.getElementById("srAdminSearchInput")?.value.trim()||"";
    const params=new URLSearchParams();
    if(status)params.set("status",status);
    if(search)params.set("search",search);
    const qs=params.toString();
    const r=await fetch("/api/admin/service-requests"+(qs?"?"+qs:""),{credentials:"include"});
    const d=await r.json().catch(()=>({}));
    if(!r.ok||!d.success)throw new Error(d.error||"تعذر تحميل طلبات الخدمة");
    adminServiceRequests=d.items||[]; renderServiceRequestsAdmin();
  }catch(e){if(box)box.innerHTML=`<div class="empty-admin">${adminHtmlEscape(e.message||"تعذر تحميل طلبات الخدمة")}</div>`;}
}

function srScheduleText(r){
  if(r.scheduled_at) return srDate(r.scheduled_at);
  return r.scheduling_type==='now'?"في أقرب وقت":"لم يُحدَّد";
}

function renderServiceRequestsStats(){
  const box=document.getElementById("srAdminStats"); if(!box)return;
  const rows=adminServiceRequests||[];
  const counts={new:0,accepted:0,in_progress:0,completed:0,rejected:0,cancelled:0};
  rows.forEach(r=>{ if(counts[r.status]!==undefined) counts[r.status]++; });
  box.innerHTML=[
    ["fa-inbox",counts.new,"جديد"],
    ["fa-check",counts.accepted,"مقبول"],
    ["fa-spinner",counts.in_progress,"قيد التنفيذ"],
    ["fa-flag-checkered",counts.completed,"مكتمل"],
    ["fa-ban",counts.rejected+counts.cancelled,"ملغي/مرفوض"]
  ].map(([icon,val,label])=>`<div class="admin-stat"><div class="admin-stat-icon"><i class="fa-solid ${icon}"></i></div><div><h3>${val}</h3><p>${label}</p></div></div>`).join("");
}

function renderServiceRequestsAdmin(){
  renderServiceRequestsStats();
  const box=document.getElementById("srAdminList"); if(!box)return;
  const rows=adminServiceRequests||[];
  if(!rows.length){box.innerHTML='<div class="empty-admin">لا توجد طلبات خدمة مطابقة.</div>';return}

  const rowsHtml=rows.map(r=>{
    const statusLabel=SR_STATUS_LABELS[r.status]||r.status;
    return `<tr onclick="openServiceRequestDetail(${r.id})" style="cursor:pointer;">
      <td>#${adminHtmlEscape(r.id)}</td>
      <td><strong>${adminHtmlEscape(r.customer_name||"—")}</strong><div class="admin-td-sub">${adminHtmlEscape(r.customer_phone||"")}</div></td>
      <td>${adminHtmlEscape(r.worker_name||("صنايعي رقم "+(r.worker_id||"")))}</td>
      <td>${adminHtmlEscape(r.worker_trade||"—")}</td>
      <td>${adminHtmlEscape(srScheduleText(r))}</td>
      <td><span class="action-btn ${SR_STATUS_BTN_CLASS[r.status]||'btn-blue'}" style="cursor:default;">${adminHtmlEscape(statusLabel)}</span></td>
    </tr>`;
  }).join("");

  const cardsHtml=rows.map(r=>{
    const statusLabel=SR_STATUS_LABELS[r.status]||r.status;
    return `<article class="admin-worker-compact-card" onclick="openServiceRequestDetail(${r.id})" style="cursor:pointer;">
      <div class="sr-admin-top">
        <div class="sr-admin-id">طلب #${adminHtmlEscape(r.id)}</div>
        <span class="action-btn ${SR_STATUS_BTN_CLASS[r.status]||'btn-blue'}">${adminHtmlEscape(statusLabel)}</span>
      </div>
      <div class="admin-td-sub" style="margin-top:8px;"><i class="fa-solid fa-user"></i> ${adminHtmlEscape(r.customer_name||"—")} · ${adminHtmlEscape(r.customer_phone||"")}</div>
      <div class="admin-td-sub" style="margin-top:4px;"><i class="fa-solid fa-screwdriver-wrench"></i> ${adminHtmlEscape(r.worker_name||("صنايعي رقم "+(r.worker_id||"")))} - ${adminHtmlEscape(r.worker_trade||"—")}</div>
      <div class="admin-td-sub" style="margin-top:4px;"><i class="fa-regular fa-calendar"></i> ${adminHtmlEscape(srScheduleText(r))}</div>
    </article>`;
  }).join("");

  box.innerHTML=`
    <div class="admin-table-wrap">
      <table class="admin-table">
        <thead><tr><th>رقم الطلب</th><th>العميل</th><th>الصنايعي</th><th>الحرفة</th><th>الموعد</th><th>الحالة</th></tr></thead>
        <tbody>${rowsHtml}</tbody>
      </table>
    </div>
    <div class="admin-worker-compact-list">${cardsHtml}</div>
  `;
}

function srTimelineHtml(r){
  const steps=[{label:"تم إنشاء الطلب",done:true,at:r.created_at}];
  if(r.status==='rejected'){ steps.push({label:"مرفوض"+(r.rejected_reason?": "+r.rejected_reason:""),done:true,at:null}); }
  else if(r.status==='cancelled'){ steps.push({label:"ملغي"+(r.rejected_reason?": "+r.rejected_reason:""),done:true,at:null}); }
  else{
    steps.push({label:"تم القبول",done:!!r.accepted_at,at:r.accepted_at});
    steps.push({label:"جاري التنفيذ",done:r.status==='in_progress'||r.status==='completed',at:null});
    steps.push({label:"مكتمل",done:!!r.completed_at,at:r.completed_at});
  }
  return `<div style="display:grid;gap:8px;margin:14px 0;">${steps.map(s=>`<div style="display:flex;align-items:center;gap:8px;color:${s.done?'var(--primary)':'var(--muted)'};font-weight:800;font-size:13px;"><i class="fa-solid ${s.done?'fa-circle-check':'fa-circle'}" style="color:${s.done?'#16a34a':'#cbd5e1'};"></i> ${esc(s.label)}${s.at?` - ${srDate(s.at)}`:""}</div>`).join("")}</div>`;
}

async function openServiceRequestDetail(id){
  const r=(adminServiceRequests||[]).find(x=>String(x.id)===String(id));
  if(!r){toast("error","تعذر إيجاد الطلب");return}
  const canManage=can("reports:manage");
  let actions="";
  if(canManage){
    if(r.status==='new')actions=`<button class="action-btn btn-green" onclick="updateServiceRequestAdminStatus(${r.id},'accepted').then(closeForceModal)">قبول</button><button class="action-btn btn-red" onclick="updateServiceRequestAdminStatus(${r.id},'rejected').then(closeForceModal)">رفض</button><button class="action-btn btn-dark" onclick="updateServiceRequestAdminStatus(${r.id},'cancelled').then(closeForceModal)">إلغاء</button>`;
    else if(r.status==='accepted')actions=`<button class="action-btn btn-yellow" onclick="updateServiceRequestAdminStatus(${r.id},'in_progress').then(closeForceModal)">بدء التنفيذ</button><button class="action-btn btn-dark" onclick="updateServiceRequestAdminStatus(${r.id},'cancelled').then(closeForceModal)">إلغاء</button>`;
    else if(r.status==='in_progress')actions=`<button class="action-btn btn-purple" onclick="updateServiceRequestAdminStatus(${r.id},'completed').then(closeForceModal)">إتمام</button><button class="action-btn btn-dark" onclick="updateServiceRequestAdminStatus(${r.id},'cancelled').then(closeForceModal)">إلغاء</button>`;
  }
  openForceModal("تفاصيل طلب #"+r.id, `
    <div class="sr-admin-parties">
      <div class="sr-admin-party"><small>العميل</small><strong>${esc(r.customer_name||"—")}</strong><div style="color:var(--muted);font-size:12px;margin-top:2px">${esc(r.customer_phone||"")}</div></div>
      <div class="sr-admin-party"><small>الصنايعي</small><strong>${esc(r.worker_name||("صنايعي رقم "+(r.worker_id||"")))}</strong><div style="color:var(--muted);font-size:12px;margin-top:2px">${[r.worker_trade,r.worker_area].filter(Boolean).map(esc).join(" - ")}</div></div>
    </div>
    <div class="sr-admin-desc" style="margin-top:10px;">${esc(r.description||"لا يوجد وصف")}</div>
    <div style="margin-top:10px;font-weight:800;font-size:13px;color:var(--muted);"><i class="fa-regular fa-calendar"></i> الموعد: ${esc(srScheduleText(r))}</div>
    <div id="srDetailAttachments" style="margin-top:10px;"><div class="empty-admin" style="padding:12px;">جاري تحميل المرفقات...</div></div>
    ${srTimelineHtml(r)}
    ${actions?`<div class="modal-actions">${actions}</div>`:""}
  `);
  try{
    const res=await fetch(`/api/admin/service-requests/${id}/attachments`,{credentials:"include"});
    const d=await res.json().catch(()=>({}));
    const abox=document.getElementById("srDetailAttachments");
    if(!abox)return;
    if(d.success && d.attachments && d.attachments.length){
      abox.innerHTML='<div style="display:flex;flex-wrap:wrap;gap:8px;">'+d.attachments.map(a=>`<a href="${esc(a.url)}" target="_blank" style="display:block;width:72px;height:72px;border-radius:12px;overflow:hidden;border:1px solid var(--border);"><img src="${esc(a.url)}" style="width:100%;height:100%;object-fit:cover;"></a>`).join("")+'</div>';
    }else{
      abox.innerHTML='<div class="empty-admin" style="padding:12px;">لا توجد مرفقات لهذا الطلب.</div>';
    }
  }catch(e){ const abox=document.getElementById("srDetailAttachments"); if(abox) abox.innerHTML='<div class="empty-admin" style="padding:12px;">تعذر تحميل المرفقات.</div>'; }
}

async function updateServiceRequestAdminStatus(id,status){
  if(!can("reports:manage")){toast("error","ليس لديك صلاحية تعديل طلبات الخدمة");return}
  let reason="";
  if(status==='rejected'||status==='cancelled'){
    reason=prompt(status==='cancelled'?"اكتب سبب الإلغاء (اختياري):":"اكتب سبب الرفض (اختياري):");
    if(reason===null)return; // المستخدم ألغى العملية
  }
  try{
    const r=await fetch(`/api/admin/service-requests/${encodeURIComponent(id)}/status`,{method:"PATCH",credentials:"include",headers:{"Content-Type":"application/json"},body:JSON.stringify({status,rejected_reason:reason||""})});
    const d=await r.json().catch(()=>({}));
    if(!r.ok||!d.success)throw new Error(d.error||"تعذر تحديث حالة الطلب");
    toast("success","تم تحديث حالة الطلب"); await loadServiceRequestsAdmin();
  }catch(e){toast("error",e.message||"تعذر تحديث حالة الطلب")}
}

// ===============================
// العملاء (نظام البوابة البسيطة) - عرض فقط
// ===============================
let adminCustomers=[];
const CUST_EVENT_LABELS={app_open:"فتح التطبيق",category_view:"مشاهدة قسم",worker_profile_view:"مشاهدة بروفايل",profile_view:"مشاهدة بروفايل",search:"بحث",phone_reveal:"إظهار رقم الهاتف",call_click:"ضغط اتصال",call:"ضغط اتصال",whatsapp_click:"ضغط واتساب",whatsapp:"ضغط واتساب",share:"مشاركة",filter_trade:"فلترة حرفة",filter_area:"فلترة منطقة",copy_phone:"نسخ الرقم"};
const CUST_EVENT_ICONS={app_open:"fa-door-open",category_view:"fa-layer-group",worker_profile_view:"fa-eye",profile_view:"fa-eye",search:"fa-magnifying-glass",phone_reveal:"fa-phone-volume",call_click:"fa-phone",call:"fa-phone",whatsapp_click:"fa-brands fa-whatsapp",whatsapp:"fa-brands fa-whatsapp",share:"fa-share-nodes",filter_trade:"fa-filter",filter_area:"fa-filter",copy_phone:"fa-copy"};
function custDate(v){try{return v?new Date(v).toLocaleString("ar-EG"):"—"}catch(e){return v||"—"}}

async function loadCustomersAdmin(){
  if(!can("analytics:read"))return;
  const box=document.getElementById("customersAdminList"); if(box)box.innerHTML='<div class="empty-admin">جاري تحميل العملاء...</div>';
  try{
    const r=await fetch("/api/admin/customers",{credentials:"include"});
    const d=await r.json().catch(()=>({}));
    if(!r.ok||!d.success)throw new Error(d.error||"تعذر تحميل العملاء");
    adminCustomers=d.items||[]; renderCustomersAdmin();
  }catch(e){if(box)box.innerHTML=`<div class="empty-admin">${adminHtmlEscape(e.message||"تعذر تحميل العملاء")}</div>`;}
}

function renderCustomerStats(){
  const box=document.getElementById("customersStats"); if(!box)return;
  const total=adminCustomers.length;
  const active=adminCustomers.filter(c=>c.status==='نشط').length;
  const calls=adminCustomers.reduce((s,c)=>s+(c.call_clicks||0),0);
  const wa=adminCustomers.reduce((s,c)=>s+(c.whatsapp_clicks||0),0);
  box.innerHTML=`<div class="admin-stat"><div class="admin-stat-icon"><i class="fa-solid fa-users"></i></div><div><h3>${total}</h3><p>إجمالي العملاء</p></div></div><div class="admin-stat"><div class="admin-stat-icon"><i class="fa-solid fa-bolt"></i></div><div><h3>${active}</h3><p>نشطين (آخر 30 يوم)</p></div></div><div class="admin-stat"><div class="admin-stat-icon"><i class="fa-solid fa-phone"></i></div><div><h3>${calls}</h3><p>إجمالي ضغطات اتصال</p></div></div><div class="admin-stat"><div class="admin-stat-icon"><i class="fa-brands fa-whatsapp"></i></div><div><h3>${wa}</h3><p>إجمالي ضغطات واتساب</p></div></div>`;
}

function renderCustomersAdmin(){
  renderCustomerStats();
  const box=document.getElementById("customersAdminList"); if(!box)return;
  if(!adminCustomers.length){box.innerHTML='<div class="empty-admin">لا يوجد عملاء مسجّلين بعد.</div>';return}

  const q=(document.getElementById("adminCustomerSearch")?.value||"").trim().toLowerCase();
  const rows=q?adminCustomers.filter(c=>String(c.name||"").toLowerCase().includes(q)||String(c.phone||"").toLowerCase().includes(q)):adminCustomers;
  if(!rows.length){box.innerHTML='<div class="empty-admin">لا يوجد عملاء مطابقين للبحث.</div>';return}

  const rowsHtml=rows.map(c=>{
    const statusClass=c.status==='نشط'?'active':'inactive';
    return `<tr onclick="openCustomerDetailModal(${c.id})" style="cursor:pointer;">
      <td><strong>${adminHtmlEscape(c.name)}</strong></td>
      <td>${adminHtmlEscape(c.phone)}</td>
      <td>${custDate(c.created_at)}</td>
      <td><span class="cust-admin-status ${statusClass}">${adminHtmlEscape(c.status)}</span></td>
      <td><button type="button" class="icon-action-btn btn-dark" onclick="event.stopPropagation();openCustomerDetailModal(${c.id})" title="عرض التفاصيل"><i class="fa-solid fa-eye"></i></button></td>
    </tr>`;
  }).join("");

  const cardsHtml=rows.map(c=>{
    const statusClass=c.status==='نشط'?'active':'inactive';
    return `<div class="cust-admin-card" onclick="openCustomerDetailModal(${c.id})">
      <div class="cust-admin-top">
        <div><div class="cust-admin-name">${adminHtmlEscape(c.name)}</div><div class="cust-admin-phone">${adminHtmlEscape(c.phone)}</div></div>
        <span class="cust-admin-status ${statusClass}">${adminHtmlEscape(c.status)}</span>
      </div>
      <div class="cust-admin-meta">
        <span><i class="fa-regular fa-calendar"></i> سجّل: ${custDate(c.created_at)}</span>
        <span><i class="fa-solid fa-clock"></i> آخر نشاط: ${c.last_active?custDate(c.last_active):"—"}</span>
        <span><i class="fa-solid fa-eye"></i> <strong>${c.profile_views}</strong> مشاهدة</span>
        <span><i class="fa-solid fa-phone"></i> <strong>${c.call_clicks}</strong> اتصال</span>
        <span><i class="fa-brands fa-whatsapp"></i> <strong>${c.whatsapp_clicks}</strong> واتساب</span>
      </div>
    </div>`;
  }).join("");

  box.innerHTML=`
    <div class="admin-table-wrap">
      <table class="admin-table">
        <thead><tr><th>الاسم</th><th>الهاتف</th><th>تاريخ التسجيل</th><th>الحالة</th><th>إجراءات</th></tr></thead>
        <tbody>${rowsHtml}</tbody>
      </table>
    </div>
    <div class="admin-worker-compact-list">${cardsHtml}</div>
  `;
}

async function openCustomerDetailModal(id){
  const modal=document.getElementById("customerDetailModal");
  const content=document.getElementById("customerDetailContent");
  if(!modal||!content)return;
  content.innerHTML='<div class="empty-admin">جاري التحميل...</div>';
  modal.classList.add("show");
  try{
    const r=await fetch(`/api/admin/customers/${encodeURIComponent(id)}`,{credentials:"include"});
    const d=await r.json().catch(()=>({}));
    if(!r.ok||!d.success)throw new Error(d.error||"تعذر تحميل بيانات العميل");
    const c=d.customer||{};
    const activityHtml=(d.activity||[]).length?(d.activity||[]).map(a=>{
      const label=CUST_EVENT_LABELS[a.event_type]||a.event_type;
      const icon=CUST_EVENT_ICONS[a.event_type]||"fa-circle-dot";
      const workerLine=a.worker_name?`${adminHtmlEscape(a.worker_name)}${a.worker_trade?" - "+adminHtmlEscape(a.worker_trade):""}`:"";
      const extraLine=a.category_id?`قسم: ${adminHtmlEscape(a.category_id)}`:(a.search_query?`بحث: "${adminHtmlEscape(a.search_query)}"`:"");
      const sub=[workerLine,extraLine].filter(Boolean).join(" · ")||custDate(a.created_at);
      return `<div class="cust-activity-item">
        <div class="cust-activity-icon"><i class="fa-solid ${icon}"></i></div>
        <div>
          <div class="cust-activity-title">${adminHtmlEscape(label)}</div>
          <div class="cust-activity-sub">${sub}${workerLine||extraLine?" · "+custDate(a.created_at):""}</div>
        </div>
      </div>`;
    }).join(""):'<div class="empty-admin">لا يوجد نشاط مسجّل لهذا العميل بعد.</div>';

    content.innerHTML=`
      <h3 style="margin:0 0 4px;color:var(--primary);">${adminHtmlEscape(c.name)}</h3>
      <p style="color:var(--muted);font-weight:700;margin:0 0 16px;">${adminHtmlEscape(c.phone)} · سجّل ${custDate(c.created_at)}</p>
      <div>${activityHtml}</div>
    `;
  }catch(e){
    content.innerHTML=`<div class="empty-admin">${adminHtmlEscape(e.message||"تعذر تحميل بيانات العميل")}</div>`;
  }
}

function closeCustomerDetailModal(e){
  if(e&&e.target&&e.target.id!=="customerDetailModal")return;
  const modal=document.getElementById("customerDetailModal");
  if(modal)modal.classList.remove("show");
}

function requireBackupPermission(){if(!can("backup:export")){toast("error","ليس لديك صلاحية النسخ الاحتياطي");return false}return true}
function downloadFullBackup(){if(!requireBackupPermission())return;window.location.href="/api/admin/backups/full-json"}
function exportWorkersReport(){if(!requireBackupPermission())return;window.location.href="/api/export-workers"}

async function loadBackupSummary(){
  if(!requireBackupPermission())return;
  const box=document.getElementById("backupSummary"); if(box)box.innerHTML='<div class="empty-admin">جاري تحميل ملخص النسخ الاحتياطي...</div>';
  try{
    const r=await fetch("/api/admin/backups/summary",{credentials:"include"});
    const d=await r.json().catch(()=>({}));
    if(!r.ok||!d.success)throw new Error(d.error||"تعذر تحميل ملخص النسخ الاحتياطي");
    if(box){ box.innerHTML=(d.items||[]).map(item=>`<div class="admin-stat"><div class="admin-stat-icon"><i class="fa-solid fa-table"></i></div><div><h3>${item.count===null?"—":item.count}</h3><p>${item.label||item.table}${item.error?' - غير جاهز':''}</p></div></div>`).join("") || '<div class="empty-admin">لا توجد بيانات</div>'; }
  }catch(e){ if(box)box.innerHTML='<div class="empty-admin">تعذر تحميل الملخص</div>'; }
}

let __subPricingCache=null;

async function loadSubscriptionsAdmin(){
  await Promise.all([loadSubscriptionPricingForm(), loadSubscriptionPayments()]);
}

async function loadSubscriptionPricingForm(){
  try{
    const r=await fetch("/api/admin/settings/subscription-pricing",{credentials:"include"});
    const d=await r.json().catch(()=>({}));
    if(!r.ok||!d.success) throw new Error(d.error||"تعذر تحميل التسعير");
    __subPricingCache=d.pricing;
    document.getElementById("subPriceMonthly").value=d.pricing.monthly;
    document.getElementById("subDiscountQuarter").value=d.pricing.discounts.quarter;
    document.getElementById("subDiscountHalf").value=d.pricing.discounts.half;
    document.getElementById("subDiscountYear").value=d.pricing.discounts.year;
    renderSubPricingPreview(d.pricing);
  }catch(e){ toast("error", e.message||"تعذر تحميل إعدادات التسعير"); }
}

function renderSubPricingPreview(pricing){
  const box=document.getElementById("subPricingPreview"); if(!box) return;
  const labels={month:"شهر",quarter:"ربع سنوي",half:"نصف سنوي",year:"سنوي"};
  box.innerHTML = Object.keys(pricing.plans).map(k=>{
    const p=pricing.plans[k];
    return `<span style="display:inline-block;background:#f1f5f9;border-radius:999px;padding:6px 14px;margin:4px;font-weight:800;">${labels[k]}: ${p.price} ج.م</span>`;
  }).join("");
}

async function saveSubscriptionPricing(){
  const monthly=Number(document.getElementById("subPriceMonthly").value)||0;
  const discounts={
    quarter:Number(document.getElementById("subDiscountQuarter").value)||0,
    half:Number(document.getElementById("subDiscountHalf").value)||0,
    year:Number(document.getElementById("subDiscountYear").value)||0
  };
  try{
    const r=await fetch("/api/admin/settings/subscription-pricing",{
      method:"PUT", credentials:"include",
      headers:{"Content-Type":"application/json"},
      body:JSON.stringify({monthly,discounts})
    });
    const d=await r.json().catch(()=>({}));
    if(!r.ok||!d.success) throw new Error(d.error||"فشل حفظ التسعير");
    __subPricingCache=d.pricing;
    renderSubPricingPreview(d.pricing);
    toast("success","تم حفظ التسعير بنجاح");
  }catch(e){ toast("error", e.message||"فشل حفظ التسعير"); }
}

async function loadSubscriptionPayments(){
  const box=document.getElementById("subscriptionPaymentsList"); if(box)box.innerHTML='<div class="empty-admin">جاري تحميل سجل المدفوعات...</div>';
  try{
    const r=await fetch("/api/admin/subscription-payments",{credentials:"include"});
    const d=await r.json().catch(()=>({}));
    if(!r.ok||!d.success) throw new Error(d.error||"تعذر تحميل سجل المدفوعات");
    const items=d.payments||[];
    if(box) box.innerHTML = items.length ? items.map(renderSubscriptionPaymentItem).join("") : '<div class="empty-admin">لا يوجد مدفوعات مسجّلة بعد</div>';
  }catch(e){ if(box) box.innerHTML='<div class="empty-admin">تعذر تحميل سجل المدفوعات</div>'; }
}

function renderSubscriptionPaymentItem(p){
  const statusLabels={paid:"مدفوع",pending:"منتظر",failed:"فشل",cancelled:"ملغي"};
  const statusColors={paid:"#166534",pending:"#92400e",failed:"#991b1b",cancelled:"#64748b"};
  const workerName=esc((p.workers&&p.workers.name)||"صنايعي محذوف");
  const methodLabels={paymob:"PayMob",cash:"كاش",vodafone_cash:"فودافون كاش",instapay:"إنستاباي",bank_transfer:"تحويل بنكي",free:"مجاني",other:"أخرى"};
  return `<div class="list-item">
    <div>
      <strong>${workerName}</strong> — ${p.months} ${p.months===1?"شهر":"أشهر"} — <strong>${p.amount} ${esc(p.currency||"EGP")}</strong>
      <div style="color:var(--muted);font-size:12px;font-weight:800;margin-top:4px;">${methodLabels[p.payment_method]||esc(p.payment_method)} · ${waDate(p.created_at)}</div>
    </div>
    <span style="font-weight:900;color:${statusColors[p.status]||"#64748b"}">${statusLabels[p.status]||esc(p.status)}</span>
  </div>`;
}

async function loadActivityLog(){
  const box=document.getElementById("activityLogList"); if(box)box.innerHTML='<div class="empty-admin">جاري تحميل سجل النشاط...</div>';
  try{
    const r=await fetch("/api/admin/activity-log?limit=150",{credentials:"include"});
    const d=await r.json().catch(()=>({}));
    if(!r.ok||d.success===false) throw new Error(d.error||"تعذر تحميل سجل النشاط");
    const items=d.items||[];
    if(box) box.innerHTML = items.length ? items.map(renderActivityLogItem).join("") : '<div class="empty-admin">لا يوجد نشاط مسجّل بعد</div>';
  }catch(e){ if(box) box.innerHTML='<div class="empty-admin">تعذر تحميل سجل النشاط</div>'; }
}
function renderActivityLogItem(row){
  const label=esc(row.action_label||row.action||"إجراء");
  const admin=esc(row.admin_name||"الإدارة");
  const entity=row.entity_name?` — ${esc(row.entity_name)}`:"";
  const time=waDate(row.created_at);
  return `<div class="list-item"><div><strong>${label}${entity}</strong><div style="color:var(--muted);font-size:12px;font-weight:800;margin-top:4px;">${admin} · ${time}</div></div></div>`;
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
  const pendingChanges = adminNotifications.pendingWorkerChanges || allWorkers.filter(hasPendingChanges).length;
  const a=document.getElementById("notifyPendingWorkers"), b=document.getElementById("notifyPendingReviews"), c=document.getElementById("notifySubscriptionsSoon"), d=document.getElementById("notifySubscriptionsExpired"), e=document.getElementById("notifyPendingWorkerChanges");
  if(a)a.textContent=pendingWorkers; if(b)b.textContent=pendingReviews; if(c)c.textContent=soon; if(d)d.textContent=expired; if(e)e.textContent=pendingChanges;
}
function activateWorkersTab(){const workersBtn = document.querySelector(".admin-tab");if(workersBtn) switchTab("workers", workersBtn);}
function showPendingWorkers(){activateWorkersTab();document.getElementById("adminStatusFilter").value = "pending";filterAdminWorkers();document.getElementById("workersSection").scrollIntoView({behavior:"smooth"});}
function showSubscriptionsSoon(){activateWorkersTab();document.getElementById("adminStatusFilter").value = "sub_soon";filterAdminWorkers();document.getElementById("workersSection").scrollIntoView({behavior:"smooth"});}
function showSubscriptionsExpired(){activateWorkersTab();document.getElementById("adminStatusFilter").value = "sub_expired";filterAdminWorkers();document.getElementById("workersSection").scrollIntoView({behavior:"smooth"});}
function showPendingWorkerChanges(){activateWorkersTab();setQuickFilter("has_pending_changes");document.getElementById("workersSection").scrollIntoView({behavior:"smooth"});}
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
  box.innerHTML=adminUsers.map(u=>`<div class="review-admin-card"><div class="review-admin-head"><div><h3>${esc(u.display_name||u.username)}</h3><div style="color:var(--muted);font-weight:800;margin-top:4px;font-size:12.5px;">اسم المستخدم: ${esc(u.username)}</div></div><span class="status-badge ${u.active?'status-green':'status-red'}">${roleLabel(u.role)} - ${u.active?'نشط':'متوقف'}</span></div><div class="card-actions" style="margin-top:12px"><select onchange="updateAdminUser('${u.id}',{role:this.value})"><option value="super_admin" ${u.role==='super_admin'?'selected':''}>مدير كامل</option><option value="reviewer" ${u.role==='reviewer'?'selected':''}>موظف مراجعة</option><option value="subscription_manager" ${u.role==='subscription_manager'?'selected':''}>موظف اشتراكات</option><option value="viewer" ${u.role==='viewer'?'selected':''}>مشاهد</option></select><button class="action-btn ${u.active?'btn-yellow':'btn-green'}" onclick="updateAdminUser('${u.id}',{active:${u.active?0:1}})">${u.active?'إيقاف':'تفعيل'}</button><button class="action-btn btn-blue" onclick="changeAdminPassword('${u.id}')">تغيير كلمة السر</button><button class="action-btn btn-red" onclick="deleteAdminUser('${u.id}')">حذف</button></div></div>`).join("");
}
async function createAdminUser(e){
  e.preventDefault();
  const body={username:document.getElementById("newAdminUsername").value.trim(),display_name:document.getElementById("newAdminDisplayName").value.trim(),password:document.getElementById("newAdminPassword").value,role:document.getElementById("newAdminRole").value};
  const ok=await reqs([{url:"/api/admin/users",method:"POST",body}]);
  if(ok){toast("success","تم إنشاء مستخدم الإدارة");e.target.reset();await loadAdminUsers()}
}
async function updateAdminUser(id,body){const ok=await reqs([{url:`/api/admin/users/${id}`,method:"PUT",body}]);if(ok){toast("success","تم تحديث المستخدم");await loadAdminUsers()}else toast("error",lastReqError||"تعذر تحديث المستخدم")}
async function changeAdminPassword(id){const password=prompt("اكتب كلمة السر الجديدة - 8 أحرف على الأقل");if(!password)return;const ok=await reqs([{url:`/api/admin/users/${id}/password`,method:"PUT",body:{password}}]);if(ok)toast("success","تم تغيير كلمة السر");else toast("error",lastReqError||"تعذر تغيير كلمة السر")}
async function deleteAdminUser(id){if(!confirm("حذف مستخدم الإدارة؟"))return;const ok=await reqs([{url:`/api/admin/users/${id}`,method:"DELETE"}]);if(ok){toast("success","تم حذف المستخدم");await loadAdminUsers()}else toast("error",lastReqError||"تعذر حذف المستخدم")}

// ==========================================
// منطق التحليلات الاحترافي (Dashboard Analytics)
// ==========================================
function analyticsNumber(v) { return Number(v || 0).toLocaleString("ar-EG"); }
function analyticsPercent(v) { return (Number(v || 0) || 0).toLocaleString("ar-EG") + "%"; }

function renderModernBars(id, rows, fillClass) {
  const box = document.getElementById(id); 
  if (!box) return;
  if (!rows || !rows.length) {
    box.innerHTML = '<div class="empty-admin" style="padding:20px;background:#f8fafc;border-radius:12px;">لا توجد بيانات كافية حالياً.</div>';
    return;
  }
  const maxVal = Math.max(...rows.map(r => r.count));
  box.innerHTML = rows.slice(0, 7).map(x => {
    const title = x.name || "غير محدد";
    const percentage = maxVal > 0 ? ((x.count / maxVal) * 100) : 0;
    return `
      <div class="bar-item">
        <div class="bar-info">
          <span>${adminHtmlEscape(title)}</span>
          <span style="color:#64748b;">${analyticsNumber(x.count)}</span>
        </div>
        <div class="bar-track">
          <div class="bar-fill ${fillClass}" style="width: ${percentage}%"></div>
        </div>
      </div>
    `;
  }).join("");
}

function overviewKpiCard(value,label){ return `<div class="overview-kpi-card"><strong>${value}</strong><span>${label}</span></div>`; }

async function renderSystemOverview(){
  // قُمع التسجيل والتوثيق - من allWorkers المحمّلة أصلًا، بدون أي رقم مُختلق
  const identityBox = document.getElementById("overviewIdentityFunnel");
  if(identityBox){
    const counts = {pending:0,verified:0,rejected:0,needs_data:0,needs_id_reupload:0};
    allWorkers.forEach(w=>{ const s=identityStatusValue(w); if(counts[s]!==undefined) counts[s]++; });
    identityBox.innerHTML =
      overviewKpiCard(allWorkers.length,"إجمالي الصنايعية المسجلين") +
      overviewKpiCard(counts.verified,"موثّقين") +
      overviewKpiCard(counts.pending,"بانتظار المراجعة") +
      overviewKpiCard(counts.needs_data+counts.needs_id_reupload,"يحتاجون إجراء من الصنايعي") +
      overviewKpiCard(counts.rejected,"مرفوضين");
  }

  // صحة الاشتراكات - بنفس منطق subInfo() المستخدم في كل كارت
  const subBox = document.getElementById("overviewSubscriptions");
  if(subBox){
    let active=0,soon=0,expired=0,unset=0;
    allWorkers.forEach(w=>{ const d=daysLeft(w); if(d===null) unset++; else if(d<0) expired++; else if(d<=7) soon++; else active++; });
    subBox.innerHTML =
      overviewKpiCard(active,"اشتراكات شغالة") +
      overviewKpiCard(soon,"قرب تنتهي (≤7 أيام)") +
      overviewKpiCard(expired,"اشتراكات منتهية") +
      overviewKpiCard(unset,"بدون تاريخ نهاية");
  }

  // التقييمات والبلاغات - نضمن تحميل allReviews أولًا (مش كل الأدمنز بيفتحوا تبويب التقييمات قبل التحليلات)
  const revRepBox = document.getElementById("overviewReviewsReports");
  if(revRepBox){
    if(!__adminLoaded.reviews){ await loadReviewsAdmin(); __adminLoaded.reviews=true; }
    const totalReviews = allReviews.length;
    const approvedReviews = allReviews.filter(r=>ok(r.approved)).length;
    const avgRating = totalReviews ? (allReviews.reduce((a,r)=>a+(Number(r.rating)||0),0)/totalReviews) : 0;
    let reportsHtml = "";
    try{
      const r = await fetch("/api/admin/reports",{credentials:"include"});
      const d = await r.json().catch(()=>({}));
      const s = d.stats || {};
      reportsHtml = overviewKpiCard(s.total||0,"إجمالي البلاغات") + overviewKpiCard(s.new||0,"بلاغات جديدة") + overviewKpiCard(s.resolved||0,"بلاغات تم حلها");
    }catch(e){}
    revRepBox.innerHTML =
      overviewKpiCard(totalReviews,"إجمالي التقييمات") +
      overviewKpiCard(approvedReviews,"تقييمات معتمدة") +
      overviewKpiCard(avgRating?avgRating.toFixed(1):"—","متوسط التقييم") +
      reportsHtml;
  }

  // إحصائيات واتساب الفعلية (الأرسال التلقائي واليدوي المسجّل) - من سجل الإرسال الموجود بالفعل
  const waBox = document.getElementById("overviewWhatsapp");
  if(waBox){
    try{
      const r = await fetch("/api/admin/whatsapp/logs?limit=500",{credentials:"include"});
      const d = await r.json().catch(()=>({}));
      const t = d.totals || {total:0,sent:0,failed:0,pending:0};
      waBox.innerHTML =
        overviewKpiCard(t.total||0,"إجمالي رسائل واتساب المُرسلة") +
        overviewKpiCard(t.sent||0,"وصلت بنجاح") +
        overviewKpiCard(t.failed||0,"فشل الإرسال") +
        overviewKpiCard(t.pending||0,"قيد الإرسال");
    }catch(e){ waBox.innerHTML=""; }
  }

  // توزيع الصنايعية حسب الحرفة/المنطقة على مستوى كل المسجلين (مش بس الأكثر تواصلًا) - يكشف فجوات التغطية
  const tradeCounts={}, areaCounts={};
  allWorkers.forEach(w=>{
    const t=wtrade(w); if(t) tradeCounts[t]=(tradeCounts[t]||0)+1;
    const a=warea(w); if(a) areaCounts[a]=(areaCounts[a]||0)+1;
  });
  const toRows=(obj)=>Object.entries(obj).map(([name,count])=>({name,count})).sort((a,b)=>b.count-a.count);
  renderModernBars("overviewTradesDistribution", toRows(tradeCounts), "fill-blue");
  renderModernBars("overviewAreasDistribution", toRows(areaCounts), "fill-emerald");
}

async function loadDashboardCoreStats() {
  const setText = (id, val) => { const el = document.getElementById(id); if (el) el.textContent = val; };

  // عدد الصنايعية + توثيق معلّق - من allWorkers المحمّلة أصلًا (loadAllData)، بدون أي fetch إضافي
  setText("dashWorkersCount", analyticsNumber(allWorkers.length));
  setText("dashPendingVerification", analyticsNumber(allWorkers.filter(w => identityStatusValue(w) === "pending").length));

  // طلبات اليوم / قيد التنفيذ / نسبة الإكمال / آخر 7 أيام - من /api/admin/service-requests
  // الموجود بالفعل (نفس صلاحية reports:read لتبويب الطلبات - لو مش متاحة للأدمن الحالي
  // بتتجاهل بهدوء من غير ما تكسر باقي الـDashboard)
  try {
    const r = await fetch("/api/admin/service-requests", { credentials: "include" });
    const d = await r.json().catch(() => ({}));
    if (!r.ok || !d.success) throw new Error("no-access");
    const items = d.items || [];

    const todayStr = new Date().toISOString().slice(0, 10);
    const todayCount = items.filter(it => String(it.created_at || "").slice(0, 10) === todayStr).length;
    const inProgressCount = items.filter(it => it.status === "accepted" || it.status === "in_progress").length;
    const completedCount = items.filter(it => it.status === "completed").length;
    const completionRate = items.length ? Math.round((completedCount / items.length) * 100) : null;

    setText("dashRequestsToday", analyticsNumber(todayCount));
    setText("dashRequestsInProgress", analyticsNumber(inProgressCount));
    setText("dashCompletionRate", completionRate === null ? "—" : completionRate + "%");

    const days7 = [];
    for (let i = 6; i >= 0; i--) {
      const dt = new Date(Date.now() - i * 24 * 60 * 60 * 1000);
      days7.push(dt.toISOString().slice(0, 10));
    }
    const counts7 = days7.map(dateStr => items.filter(it => String(it.created_at || "").slice(0, 10) === dateStr).length);
    renderRequests7dChart(days7, counts7);
  } catch (e) {
    setText("dashRequestsToday", "—"); setText("dashRequestsInProgress", "—"); setText("dashCompletionRate", "—");
  }
}

let _dashRequests7dChartInstance = null;
function renderRequests7dChart(days7, counts7) {
  const canvas = document.getElementById("dashRequests7dChart");
  if (!canvas || typeof Chart === "undefined") return;
  if (_dashRequests7dChartInstance) _dashRequests7dChartInstance.destroy();
  _dashRequests7dChartInstance = new Chart(canvas.getContext("2d"), {
    type: "bar",
    data: {
      labels: days7.map(analyticsDayLabel),
      datasets: [{ label: "الطلبات", data: counts7, backgroundColor: "rgba(37,99,235,.75)", borderRadius: 8, maxBarThickness: 34 }]
    },
    options: {
      responsive: true, maintainAspectRatio: false,
      plugins: { legend: { display: false } },
      scales: {
        x: { ticks: { font: { family: "Cairo" } }, grid: { display: false } },
        y: { beginAtZero: true, ticks: { precision: 0, font: { family: "Cairo" } } }
      }
    }
  });
}

async function loadAnalytics() {
  loadDashboardCoreStats();
  renderSystemOverview();
  const boxTopWorkers = document.getElementById("analyticsTopWorkers");
  const msg = document.getElementById("analyticsMessage");
  const rangeEl = document.getElementById("analyticsRange");

  if (!boxTopWorkers) return;
  const days = rangeEl ? rangeEl.value : 30;
  
  boxTopWorkers.innerHTML = '<div style="grid-column: 1/-1; text-align:center; padding: 20px; color:#64748b;"><i class="fa-solid fa-spinner fa-spin"></i> جاري تحليل البيانات...</div>';
  if(msg) msg.style.display = "none";
  
  try {
    const r = await fetch("/api/admin/analytics?days=" + encodeURIComponent(days), { credentials: "include" });
    const d = await r.json().catch(() => ({}));
    
    if (!r.ok || !d.success) throw new Error(d.error || "تعذر تحميل التحليلات");
    
    const totals = d.totals || {};
    const setText = (id, val) => { const el = document.getElementById(id); if (el) el.textContent = analyticsNumber(val); };
    setText("analyticsCalls", totals.call); setText("analyticsWhatsapp", totals.whatsapp); setText("analyticsViews", totals.profile_view); setText("analyticsContacts", totals.total_contacts);
    const conv = document.getElementById("analyticsConversion"); if (conv) conv.textContent = analyticsPercent(totals.conversion_rate);

    const workersRows = d.top_workers || [];
    if (!workersRows.length) {
      boxTopWorkers.innerHTML = "";
      if (msg) { msg.innerHTML = '<i class="fa-solid fa-circle-info"></i> لا توجد بيانات تواصل في هذه الفترة.'; msg.style.display = "block"; }
    } else {
      boxTopWorkers.innerHTML = workersRows.map((row, idx) => {
        const w = row.worker || {};
        const name = w.name || ("صنايعي رقم " + row.worker_id);
        const trade = w.trade || "غير محدد";
        const area = w.area || "غير محدد";
        let img = w.image;
        if(img && !img.startsWith('http') && !img.startsWith('/uploads')) img = '/uploads/' + img;
        if(!img) img = '/icons/default-worker-avatar.png';

        return `
          <div class="top-worker-card" style="cursor:pointer" onclick="selectWorkerAnalytics('${adminActionsEscapeAttr(row.worker_id)}')">
            <div class="top-worker-info">
              <span style="font-size: 18px; font-weight: 900; color: #cbd5e1;">#${idx + 1}</span>
              <img src="${adminHtmlEscape(img)}" class="top-worker-img" onerror="this.src='/icons/default-worker-avatar.png'">
              <div>
                <h4 class="top-w-name">${adminHtmlEscape(name)}</h4>
                <p class="top-w-trade">${adminHtmlEscape(trade)} - ${adminHtmlEscape(area)}</p>
              </div>
            </div>
            <div class="top-w-score">
              <i class="fa-solid fa-fire"></i> ${analyticsNumber(row.total_contacts)} تواصل
            </div>
          </div>
        `;
      }).join("");
    }

    renderModernBars("analyticsTopTrades", d.top_trades, "fill-blue");
    renderModernBars("analyticsTopAreas", d.top_areas, "fill-emerald");

    // --- التعديل هنا: تحويل مسارات الصفحات لأسماء مقروءة ---
    const formattedPages = (d.top_pages || []).map(page => {
      let friendlyName = page.name;
      try {
        const decodedPath = decodeURIComponent(page.name);
        if (decodedPath === '/' || decodedPath === '') {
          friendlyName = '🏠 الصفحة الرئيسية';
        } else if (decodedPath.startsWith('/worker/')) {
          const wId = decodedPath.split('/')[2];
          const worker = allWorkers.find(w => String(wid(w)) === String(wId));
          friendlyName = worker ? `👷‍♂️ ${wname(worker)}` : `صنايعي رقم ${wId}`;
        } else if (decodedPath.startsWith('/trade/')) {
          const tradeName = decodedPath.split('/')[2];
          friendlyName = `🛠️ حرفة: ${tradeName.replace(/-/g, ' ')}`;
        } else if (decodedPath.startsWith('/area/')) {
          const areaName = decodedPath.split('/')[2];
          friendlyName = `📍 منطقة: ${areaName.replace(/-/g, ' ')}`;
        } else {
           friendlyName = decodedPath;
        }
      } catch(e) {}
      return { name: friendlyName, count: page.count };
    });

    renderModernBars("analyticsTopPages", formattedPages, "fill-purple");
    renderDailyChart(d.daily || []);
    populateWorkerAnalyticsSelect();

    // ===== حقول إضافية لنظام البوابة/حسابات العملاء =====
    const customers = d.customers || {};
    setText("analyticsCustomersTotal", customers.total);
    setText("analyticsCustomersToday", customers.today);
    setText("analyticsCustomersWeek", customers.week);
    setText("analyticsCustomersMonth", customers.month);
    setText("dashCustomersCount", customers.total);

    renderModernBars("analyticsTopTradesByViews", d.top_trades_by_views, "fill-blue");

    const renderTopWorkersByMetric = (containerId, rows) => {
      const box = document.getElementById(containerId);
      if (!box) return;
      if (!rows || !rows.length) { box.innerHTML = '<div class="empty-admin" style="padding:16px;">لا توجد بيانات كافية.</div>'; return; }
      box.innerHTML = rows.map((row, idx) => {
        const w = row.worker || {};
        const name = w.name || ("صنايعي رقم " + row.worker_id);
        const trade = w.trade || "غير محدد";
        return `<div class="top-worker-card" style="cursor:pointer" onclick="selectWorkerAnalytics('${adminActionsEscapeAttr(row.worker_id)}')">
          <div class="top-worker-info">
            <span style="font-size: 16px; font-weight: 900; color: #cbd5e1;">#${idx + 1}</span>
            <div><h4 class="top-w-name">${adminHtmlEscape(name)}</h4><p class="top-w-trade">${adminHtmlEscape(trade)}</p></div>
          </div>
          <div class="top-w-score"><i class="fa-solid fa-fire"></i> ${analyticsNumber(row.count)}</div>
        </div>`;
      }).join("");
    };
    renderTopWorkersByMetric("analyticsTopWorkersByCall", d.top_workers_by_call_click);
    renderTopWorkersByMetric("analyticsTopWorkersByWhatsapp", d.top_workers_by_whatsapp_click);

  } catch (e) {
    boxTopWorkers.innerHTML = "";
    if (msg) { msg.innerHTML = '<i class="fa-solid fa-triangle-exclamation"></i> ' + (e.message || "تعذر تحميل التحليلات"); msg.style.display = "block"; }
  }
}

let _analyticsDailyChartInstance=null, _workerAnalyticsChartInstance=null;
const analyticsDayLabel=(iso)=>{ try{ return new Date(iso+'T00:00:00').toLocaleDateString('ar-EG',{day:'numeric',month:'short'}); }catch(e){ return iso; } };

function renderDailyChart(daily){
  const canvas=document.getElementById('analyticsDailyChart');
  if(!canvas || typeof Chart==='undefined') return;
  if(_analyticsDailyChartInstance) _analyticsDailyChartInstance.destroy();
  const hasAnyActivity = daily.some(d=>d.profile_view||d.call||d.whatsapp);
  const msgEl = document.getElementById('analyticsMessage');
  if(!hasAnyActivity && daily.length && msgEl){
    msgEl.innerHTML = '<i class="fa-solid fa-triangle-exclamation"></i> مفيش أي نشاط حقيقي (زيارات/مكالمات/واتساب) خلال الفترة دي — يستاهل نتأكد إن الموقع بيستقبل زوار.';
    msgEl.style.display='block';
  }
  _analyticsDailyChartInstance = new Chart(canvas.getContext('2d'), {
    type:'line',
    data:{
      labels: daily.map(d=>analyticsDayLabel(d.date)),
      datasets:[
        {label:'مشاهدات البروفايل', data:daily.map(d=>d.profile_view), borderColor:'#f59e0b', backgroundColor:'rgba(245,158,11,.12)', tension:.35, fill:true},
        {label:'مكالمات', data:daily.map(d=>d.call), borderColor:'#8b5cf6', backgroundColor:'rgba(139,92,246,.12)', tension:.35, fill:true},
        {label:'واتساب', data:daily.map(d=>d.whatsapp), borderColor:'#10b981', backgroundColor:'rgba(16,185,129,.12)', tension:.35, fill:true}
      ]
    },
    options:{
      responsive:true, maintainAspectRatio:false,
      interaction:{mode:'index',intersect:false},
      plugins:{legend:{position:'bottom',rtl:true,labels:{font:{family:'Cairo',weight:'700'}}}},
      scales:{
        x:{ticks:{font:{family:'Cairo'}}, grid:{display:false}},
        y:{beginAtZero:true, ticks:{precision:0,font:{family:'Cairo'}}}
      }
    }
  });
}

function selectWorkerAnalytics(id){
  const sel=document.getElementById('workerAnalyticsSelect');
  if(!sel) return;
  sel.value=String(id);
  loadWorkerAnalytics();
  document.getElementById('workerAnalyticsSelect')?.closest('.chart-card')?.scrollIntoView({behavior:'smooth',block:'center'});
}

function populateWorkerAnalyticsSelect(){
  const sel=document.getElementById('workerAnalyticsSelect');
  if(!sel) return;
  const current=sel.value;
  sel.innerHTML='<option value="">اختر صنايعي لعرض تفاصيل صفحته...</option>' +
    allWorkers.slice().sort((a,b)=>wname(a).localeCompare(wname(b),'ar')).map(w=>`<option value="${esc(wid(w))}">${esc(wname(w))} — ${esc(wtrade(w))}</option>`).join('');
  if(current) sel.value=current;
}

async function loadWorkerAnalytics(){
  const id=document.getElementById('workerAnalyticsSelect')?.value;
  const box=document.getElementById('workerAnalyticsResult');
  if(!box) return;
  if(!id){ toast('error','اختار صنايعي الأول'); return; }
  const days = document.getElementById('analyticsRange')?.value || 30;
  box.innerHTML='<div class="empty-admin"><i class="fa-solid fa-spinner fa-spin"></i> جاري تحميل تفاصيل الصفحة...</div>';
  try{
    const r=await fetch(`/api/admin/analytics/worker/${encodeURIComponent(id)}?days=${encodeURIComponent(days)}`,{credentials:'include'});
    const d=await r.json().catch(()=>({}));
    if(!r.ok||!d.success) throw new Error(d.error||'تعذر تحميل تفاصيل الصنايعي');
    const t=d.totals||{};
    box.innerHTML = `
      <div class="overview-kpi-grid" style="margin-bottom:16px;">
        ${overviewKpiCard(analyticsNumber(t.profile_view||0),'مشاهدات صفحته')}
        ${overviewKpiCard(analyticsNumber(t.call||0),'مكالمات')}
        ${overviewKpiCard(analyticsNumber(t.whatsapp||0),'واتساب')}
        ${overviewKpiCard(analyticsNumber(t.copy_phone||0),'نسخ الرقم')}
        ${overviewKpiCard(analyticsPercent(t.conversion_rate||0),'معدل التحويل')}
      </div>
      <div style="position:relative;height:220px;"><canvas id="workerAnalyticsChart"></canvas></div>
    `;
    if(!t.profile_view && !t.call && !t.whatsapp){
      box.innerHTML += '<div class="empty-admin" style="margin-top:14px;"><i class="fa-solid fa-circle-info"></i> الصنايعي ده مفيهوش أي زيارة أو تواصل مسجّل في الفترة دي.</div>';
    }
    const canvas=document.getElementById('workerAnalyticsChart');
    if(canvas && typeof Chart!=='undefined'){
      if(_workerAnalyticsChartInstance) _workerAnalyticsChartInstance.destroy();
      const daily=d.daily||[];
      _workerAnalyticsChartInstance = new Chart(canvas.getContext('2d'), {
        type:'bar',
        data:{
          labels: daily.map(x=>analyticsDayLabel(x.date)),
          datasets:[
            {label:'مشاهدات', data:daily.map(x=>x.profile_view), backgroundColor:'#f59e0b'},
            {label:'مكالمات', data:daily.map(x=>x.call), backgroundColor:'#8b5cf6'},
            {label:'واتساب', data:daily.map(x=>x.whatsapp), backgroundColor:'#10b981'}
          ]
        },
        options:{
          responsive:true, maintainAspectRatio:false,
          plugins:{legend:{position:'bottom',rtl:true,labels:{font:{family:'Cairo',weight:'700'}}}},
          scales:{ x:{stacked:true,ticks:{font:{family:'Cairo'}},grid:{display:false}}, y:{stacked:true,beginAtZero:true,ticks:{precision:0,font:{family:'Cairo'}}} }
        }
      });
    }
  }catch(e){
    box.innerHTML = `<div class="empty-admin"><i class="fa-solid fa-triangle-exclamation"></i> ${esc(e.message||'تعذر تحميل تفاصيل الصنايعي')}</div>`;
  }
}

// ==========================================
// رسائل الواتساب
// ==========================================

// بيحوّل أي رقم لصيغة واتساب دولية (زي normalizeWhatsAppRecipient في الباك إند)، وبيرجع "" لو الرقم مش صالح
function adminWhatsAppNumber(phone){
  let d=String(phone||"").replace(/[٠-٩]/g,c=>"٠١٢٣٤٥٦٧٨٩".indexOf(c)).replace(/[۰-۹]/g,c=>"۰۱۲۳۴۵۶۷۸۹".indexOf(c)).replace(/[^0-9]/g,"");
  if(!d)return"";
  if(d.startsWith("00"))d=d.slice(2);
  if(d.startsWith("0")&&d.length>=10)d="20"+d.slice(1);
  if(d.length===10&&/^(10|11|12|15)/.test(d))d="20"+d;
  return d.length>=11?d:"";
}

// رابط بروفايل الصنايعي العام
function workerDisplayLink(id){return location.origin+"/worker/"+id}

// رابط صفحة متابعة حالة الطلب (status.html بتقرأ ?code=)
function registrationStatusLink(w){return location.origin+"/status?code="+encodeURIComponent(registrationCodeText(w))}

// رابط صفحة تسجيل دخول الصنايعي (نفس الرابط لكل الصنايعية)
function workerLoginLink(){return location.origin+"/worker-login"}

// نص رسالة الواتساب الجاهز حسب نوع الحالة
function buildWhatsAppTemplate(type,w,extra){
  const name=wname(w),trade=wtrade(w),area=warea(w);
  const activationUrl=(extra&&extra.activationUrl)||workerLoginLink();
  const templates={
    registration_id_reupload:`أهلاً ${name} 👋\n\nطلب تسجيلك في دليل صنايعي مطروح محتاج إعادة رفع صورة البطاقة الشخصية (وجه وظهر) بشكل واضح.\n\nتقدر ترفعها من هنا:\n${registrationStatusLink(w)}`,
    registration_update_data:`أهلاً ${name} 👋\n\nطلب تسجيلك في دليل صنايعي مطروح محتاج تعديل أو استكمال بعض البيانات (زي رقم الهاتف أو الحرفة أو المنطقة) قبل الاعتماد.\n\nتابع طلبك من هنا:\n${registrationStatusLink(w)}`,
    registration_work_photos:`أهلاً ${name} 👋\n\nعشان بروفايلك يبان بشكل أحسن للعملاء، محتاجين ترفع صور من شغلك السابق (حتى لو صورة أو اتنين).\n\nارفعها من هنا:\n${registrationStatusLink(w)}`,
    approved:`مبروك يا ${name}! 🎉\n\nتم اعتماد بروفايلك في دليل صنايعي مطروح، وبقيت ظاهر للعملاء دلوقتي كـ ${trade} في ${area}.\n\nشوف بروفايلك من هنا:\n${workerDisplayLink(wid(w))}`,
    request_email:`أهلاً ${name}\n\nمحتاجين بريدك الإلكتروني عشان تقدر تستقبل رسايل مهمة من إدارة صنايعي مطروح (زي تحديثات حسابك واستعادة كلمة المرور).\n\nدوس على الرابط ده لتحديد كلمة مرور والدخول لحسابك، وضيف بريدك من لوحة تحكمك:\n${activationUrl}`
  };
  return templates[type]||`أهلاً ${name}، رسالة من إدارة دليل صنايعي مطروح.`;
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
    if(f==="no_email")return !w.email;
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
  let text=`المستلمون الصالحون: ${count}\nغير داخل الشريحة أو بدون رقم صالح: ${invalid}\nطريقة الإرسال: ${mode==="template"?"Template رسمي":"نص عربي مباشر"}\nنوع الرسالة: ${type}\n`;
  if(count>100)text+=`\nتنبيه: سيتم إرسال أول 100 فقط في العملية الواحدة.\n`;
  if(sample){text+=`\nمثال لأول مستلم: ${wname(sample)} - ${adminWhatsAppNumber(wwhatsapp(sample)||wphone(sample))}\n\n${waBulkMessageForWorker(sample).slice(0,700)}`}
  else text+=`\nلا يوجد مستلمون مطابقون.`;
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

// ==========================================
// طابور الإرسال اليدوي عبر واتساب (wa.me) - بديل موثوق لحد ما توثيق ميتا يخلص
// ==========================================
let waQueueState = { workers: [], index: 0, sent: [] };

function startWaQueue(){
  const workers = waBulkEligibleWorkers();
  if(!workers.length){ toast("error","لا يوجد مستلمون مطابقون للفلتر الحالي"); return; }
  waQueueState = { workers, index: 0, sent: [] };
  document.getElementById("waQueuePanel").style.display = "block";
  renderWaQueueStep();
  document.getElementById("waQueuePanel").scrollIntoView({ behavior: "smooth", block: "center" });
}

function renderWaQueueStep(){
  const { workers, index, sent } = waQueueState;
  const info = document.getElementById("waQueueInfo");
  const openBtn = document.getElementById("waQueueOpenBtn");
  const nextBtn = document.getElementById("waQueueNextBtn");
  const doneCount = document.getElementById("waQueueDoneCount");

  if(doneCount) doneCount.textContent = String(sent.length);

  if(index >= workers.length){
    info.innerHTML = `<i class="fa-solid fa-circle-check" style="color:#16a34a"></i> <b>تم الانتهاء من الطابور</b> - أُرسلت ${sent.length} من ${workers.length}`;
    if(openBtn) openBtn.style.display = "none";
    if(nextBtn) nextBtn.style.display = "none";
    return;
  }

  const w = workers[index];
  const num = adminWhatsAppNumber(wwhatsapp(w)||wphone(w));
  info.innerHTML = `<b>${index+1} من ${workers.length}</b> &nbsp;-&nbsp; ${esc(wname(w))} &nbsp;-&nbsp; ${esc(num||"بدون رقم واتساب صالح")}`;
  if(openBtn){ openBtn.style.display = ""; openBtn.disabled = !num; }
  if(nextBtn) nextBtn.style.display = "";
}

async function waQueueOpenCurrent(){
  const { workers, index, sent } = waQueueState;
  const w = workers[index];
  if(!w) return;
  const num = adminWhatsAppNumber(wwhatsapp(w)||wphone(w));
  if(!num){ toast("error","لا يوجد رقم واتساب صالح لهذا الصنايعي"); return; }

  const type = document.getElementById("waBulkTemplateType")?.value || "custom";
  const openBtn = document.getElementById("waQueueOpenBtn");
  const originalText = openBtn ? openBtn.innerHTML : "";
  let msg;

  if(type === "request_email"){
    if(openBtn){ openBtn.disabled = true; openBtn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> جاري تجهيز رابط آمن...'; }
    try{
      const r = await fetch(`/api/admin/workers/${wid(w)}/generate-activation-link`, { method:"POST", credentials:"include" });
      const d = await r.json();
      if(!r.ok || !d.success) throw new Error(d.error || "تعذر إنشاء رابط التفعيل");
      msg = buildWhatsAppTemplate("request_email", w, { activationUrl: d.url });
    }catch(e){
      toast("error", e.message || "فشل تجهيز رابط التفعيل");
      if(openBtn){ openBtn.disabled = false; openBtn.innerHTML = originalText; }
      return;
    }
    if(openBtn){ openBtn.disabled = false; openBtn.innerHTML = originalText; }
  } else {
    msg = waBulkMessageForWorker(w);
  }

  window.open("https://wa.me/"+num+"?text="+encodeURIComponent(msg), "_blank");
  sent.push(String(wid(w)));
}

function waQueueNext(){
  waQueueState.index++;
  renderWaQueueStep();
}

function closeWaQueue(){
  waQueueState = { workers: [], index: 0, sent: [] };
  document.getElementById("waQueuePanel").style.display = "none";
}

let waInboxTimer=null;
function loadWhatsappInboxDebounced(){clearTimeout(waInboxTimer);waInboxTimer=setTimeout(()=>loadWhatsappInbox(),350);}
function waInboxDefaultReply(row){const name=row.worker_name||row.profile_name||""; return `السلام عليكم${name?" أستاذ/ "+name:""}\n\nتم استلام رسالتك، وسيتم مراجعة الطلب والرد عليك من إدارة صنايعي مطروح.`;}

async function loadWhatsappInbox(){
  if(!can("whatsapp:send"))return;
  const list=document.getElementById("waInboxList"),stats=document.getElementById("waInboxStats"); if(!list)return;
  list.innerHTML='<div class="empty-admin">جاري تحميل صندوق الوارد...</div>';
  const status=document.getElementById("waInboxStatus")?.value||"all"; const q=(document.getElementById("waInboxSearch")?.value||"").trim();
  try{
    const r=await fetch(`/api/admin/whatsapp/inbox?limit=120&status=${encodeURIComponent(status)}&q=${encodeURIComponent(q)}`,{credentials:"include"});
    const d=await r.json().catch(()=>({}));
    if(!r.ok||!d.success)throw new Error(d.error||"تعذر تحميل وارد واتساب");
    const items=d.items||[]; const totals=d.totals||{};
    if(d.warning){list.innerHTML=`<div class="empty-admin">${waEscape(d.warning)}</div>`; if(stats)stats.innerHTML=''; return;}
    if(stats){stats.innerHTML=`<div class="stat-card"><strong>${totals.total||items.length||0}</strong><span>إجمالي</span></div><div class="stat-card"><strong>${totals.unread||0}</strong><span>غير مقروء</span></div><div class="stat-card"><strong>${totals.archived||0}</strong><span>مؤرشف</span></div>`}
    if(!items.length){list.innerHTML='<div class="empty-admin">لا توجد ردود واردة حتى الآن.</div>';return}
    list.innerHTML=items.map(row=>{
      const unread=(!row.read_at && (row.status||"new")!=="archived");
      const title=row.worker_name||row.profile_name||row.from_number||"رد وارد";
      const sub=[row.from_number||row.wa_id||"",row.message_type||"رسالة",waDate(row.received_at||row.created_at)].filter(Boolean).join(" - ");
      const worker=row.worker_snapshot||{};
      const workerInfo=worker&&worker.id?`<span class="wa-pill"><i class="fa-solid fa-user"></i>${waEscape(worker.registration_code||worker.name||row.worker_name||"")}</span><span class="wa-pill">${waEscape((worker.trade||"")+(worker.area?" - "+worker.area:""))}</span>`:'<span class="wa-pill pending">غير مربوط بصنايعي</span>';
      return `<div class="wa-inbox-item ${unread?"unread":""}"><div class="wa-inbox-head"><div><div class="wa-inbox-title">${waEscape(title)}</div><div class="wa-log-meta"><span class="wa-pill ${unread?"sent":""}">${unread?"غير مقروء":"مقروء/مؤرشف"}</span><span class="wa-pill"><i class="fa-brands fa-whatsapp"></i>${waEscape(sub)}</span>${workerInfo}</div></div></div><div class="wa-inbox-text">${waEscape(row.message_text||"")}</div><div class="wa-inbox-reply"><textarea id="waInboxReply_${row.id}" placeholder="اكتب رد الإدارة هنا...">${waEscape(waInboxDefaultReply(row))}</textarea></div><div class="wa-inbox-actions"><button class="big-btn btn-blue" onclick="sendWhatsappInboxReply('${waEscape(row.id)}')"><i class="fa-solid fa-paper-plane"></i> إرسال رد</button><button class="big-btn btn-dark" onclick="updateWhatsappInboxStatus('${waEscape(row.id)}','read')"><i class="fa-solid fa-check"></i> تعليم كمقروء</button><button class="big-btn btn-red" onclick="updateWhatsappInboxStatus('${waEscape(row.id)}','archived')"><i class="fa-solid fa-box-archive"></i> أرشفة</button></div></div>`;
    }).join("");
  }catch(e){list.innerHTML=`<div class="empty-admin">${waEscape(e.message||"تعذر تحميل الوارد")}</div>`}
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
  list.innerHTML='<div class="empty-admin">جاري تحميل سجل واتساب...</div>';
  const status=document.getElementById("waLogStatus")?.value||"all";
  try{
    const r=await fetch(`/api/admin/whatsapp/logs?limit=120&status=${encodeURIComponent(status)}`,{credentials:"include"});
    const d=await r.json().catch(()=>({}));
    if(!r.ok||!d.success)throw new Error(d.error||"تعذر تحميل سجل واتساب");
    const items=d.items||[]; const totals=d.totals||{};
    if(stats){stats.innerHTML=`<div class="stat-card"><strong>${totals.total||items.length||0}</strong><span>إجمالي</span></div><div class="stat-card"><strong>${totals.sent||0}</strong><span>ناجحة</span></div><div class="stat-card"><strong>${totals.failed||0}</strong><span>فاشلة</span></div>`}
    if(!items.length){list.innerHTML='<div class="empty-admin">لا توجد رسائل في السجل حتى الآن.</div>';return}
    list.innerHTML=items.map(row=>{
      const st=row.status||"pending"; const cls=st==="sent"?"sent":(st==="failed"?"failed":"pending");
      const title=row.worker_name||row.phone||"مستلم واتساب"; const msg=row.message_text||"";
      const err=row.error_message?`<div class="verification-note" style="margin-top:8px;color:#991b1b;background:#fee2e2;border-color:#fecaca">${waEscape(row.error_message)}</div>`:"";
      return `<div class="wa-log-item"><h4>${waEscape(title)}</h4><p>${waEscape(msg).slice(0,260)}</p><div class="wa-log-meta"><span class="wa-pill ${cls}">${st==="sent"?"ناجحة":st==="failed"?"فاشلة":"قيد الانتظار"}</span><span class="wa-pill"><i class="fa-brands fa-whatsapp"></i>${waEscape(row.phone||"")}</span><span class="wa-pill">${waEscape(row.message_type||"رسالة")}</span><span class="wa-pill">${waEscape(row.sent_by||"الإدارة")}</span><span class="wa-pill">${waDate(row.created_at)}</span></div>${err}</div>`;
    }).join("");
  }catch(e){list.innerHTML=`<div class="empty-admin">${waEscape(e.message||"تعذر تحميل السجل")}</div>`}
}

// ==========================================
// محادثات الإدارة والصنايعية (Application Chat)
// ==========================================
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
    if(el && d.success && Number(d.count||0)>0){el.textContent=d.count;el.style.display='inline-flex';}
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
      return [t.name, t.registration_code, t.phone, t.whatsapp, t.trade, t.area, t.message].join(' ').toLowerCase().includes(q);
    });
  }
  if(!list.length){ box.innerHTML = '<div class="chat-empty">لا توجد محادثات مطابقة</div>'; return; }
  box.innerHTML = list.map(t => {
    const unread = Number(t.unread_count || 0);
    return `<div class="chat-thread ${unread ? 'unread' : ''} ${String(t.id) === String(adminChatCurrentWorkerId) ? 'active' : ''}" onclick="loadAdminChatMessages('${chatAdminEsc(t.id)}')"><h4>${chatAdminEsc(t.name || 'صنايعي')}</h4><p>${chatAdminEsc(t.registration_code || '')} - ${chatAdminEsc(t.trade || '')} - ${chatAdminEsc(t.area || '')}</p><p>${chatAdminEsc((t.message || '').slice(0, 90))}</p><span class="chat-badge"><i class="fa-solid ${unread ? 'fa-bell' : 'fa-clock'}"></i> ${unread ? unread + ' غير مقروء' : chatAdminTime(t.date)}</span></div>`;
  }).join('');
}

async function loadAdminChatMessages(workerId){
  if(!workerId)return;
  adminChatCurrentWorkerId=workerId;
  const box=document.getElementById('adminChatMessages'); if(box)box.innerHTML='<div class="chat-empty">جاري تحميل الرسائل...</div>';
  try{
    const r=await fetch(`/api/admin/worker-chat/messages/${encodeURIComponent(workerId)}`,{credentials:'include'});
    const d=await r.json().catch(()=>({}));
    if(r.status===401){showLogin();return}
    if(!r.ok||!d.success)throw new Error(d.error||'تعذر تحميل المحادثة');
    
    const t = adminChatThreadsData.find(x => String(x.id) === String(workerId)) || {};
    document.getElementById('adminChatTitle').textContent=t.name||'محادثة صنايعي';
    document.getElementById('adminChatSub').textContent=[t.registration_code,t.trade,t.area,t.phone].filter(Boolean).join(' - ');
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
    const fd=new FormData(); fd.set('message',msg); fd.set('worker_id', adminChatCurrentWorkerId); 
    if(file&&file.files&&file.files[0])fd.set('attachment',file.files[0]);
    const r=await fetch(`/api/admin/worker-chat/messages`,{method:'POST',credentials:'include',body:fd});
    const d=await r.json().catch(()=>({}));
    if(r.status===401){showLogin();return}
    if(!r.ok||!d.success)throw new Error(d.error||'تعذر إرسال الرد');
    if(input)input.value=''; if(file)file.value=''; toast('success',d.message||'تم إرسال الرد'); 
    loadAdminChatMessages(adminChatCurrentWorkerId);
  }catch(err){ toast('error',err.message||'تعذر إرسال الرد'); }
  finally{ if(btn){btn.disabled=false;btn.innerHTML=old;} }
}

function renderAdminChatMessages(messages){
  const box = document.getElementById('adminChatMessages'); if(!box) return;
  if(!messages || !messages.length){ box.innerHTML = '<div class="chat-empty">لا توجد رسائل في هذه المحادثة</div>'; return; }
  box.innerHTML = messages.map(m => {
    const cls = m.sender_type === 'admin' ? 'admin' : 'worker';
    const who = m.sender_type === 'admin' ? 'الإدارة' : 'الصنايعي';
    let imgUrl = m.attachment_url;
    if(imgUrl && !imgUrl.startsWith('http') && !imgUrl.startsWith('/uploads')) imgUrl = '/uploads/' + imgUrl;
    const img = imgUrl ? `<a href="${chatAdminEsc(imgUrl)}" target="_blank"><img src="${chatAdminEsc(imgUrl)}" alt="مرفق" style="max-width:200px;border-radius:8px;margin-top:5px;display:block;border:1px solid #cbd5e1"></a>` : '';
    return `<div class="admin-chat-msg ${cls}"><b>${who}</b><br>${chatAdminEsc(m.message_text || '').replace(/\n/g, '<br>')}${img}<small>${chatAdminEsc(chatAdminTime(m.created_at))}</small></div>`;
  }).join('');
  box.scrollTop = box.scrollHeight;
}

// ==========================================
// محادثات خدمة العملاء (Support Chat)
// ==========================================
let adminSupportThreadsData = [];
let adminSupportCurrentId = null;
const SUPPORT_STATUS_LABELS_ADMIN = { new: 'مفتوحة', in_progress: 'قيد المتابعة', resolved: 'تم الحل', closed: 'مغلقة' };
const SUPPORT_STATUS_CLASS_ADMIN = { new: 'status-blue', in_progress: 'status-yellow', resolved: 'status-green', closed: 'status-gray' };
const SUPPORT_TYPE_LABELS_ADMIN = { technical: 'مشكلة تقنية', account: 'الحساب', worker_issue: 'مشكلة مع صنايعي', payment: 'الدفع والاشتراك', other: 'أخرى' };

const SUPPORT_PRIORITY_LABELS_ADMIN = { low: 'منخفضة', normal: 'عادية', high: 'عالية', urgent: 'عاجلة' };
const SUPPORT_PRIORITY_CLASS_ADMIN = { low: 'status-gray', normal: 'status-blue', high: 'status-yellow', urgent: 'status-red' };
let adminSupportStaff = [];
let adminSupportListPollTimer = null;
let adminSupportConvPollTimer = null;
let adminSupportListLastHash = '';
let adminSupportConvLastHash = '';

function adminSupportQueryString() {
  const params = new URLSearchParams();
  const status = document.getElementById('adminSupportStatusFilter')?.value || '';
  const category = document.getElementById('adminSupportTypeFilter')?.value || '';
  const priority = document.getElementById('adminSupportPriorityFilter')?.value || '';
  const assignedTo = document.getElementById('adminSupportAssignFilter')?.value || '';
  const unreadOnly = document.getElementById('adminSupportUnreadOnly')?.checked || false;
  const sortByPriority = document.getElementById('adminSupportPrioritySort')?.checked || false;
  if (status) params.set('status', status);
  if (category) params.set('category', category);
  if (priority) params.set('priority', priority);
  if (assignedTo) params.set('assigned_to', assignedTo);
  if (unreadOnly) params.set('unread_only', 'true');
  if (sortByPriority) params.set('sort', 'priority');
  return params.toString();
}

async function loadAdminSupportThreads(silent) {
  const box = document.getElementById('adminSupportThreads');
  if (box && !silent) box.innerHTML = '<div class="chat-empty">جاري تحميل المحادثات...</div>';
  try {
    const qs = adminSupportQueryString();
    const r = await fetch('/api/admin/support-chat/conversations' + (qs ? '?' + qs : ''), { credentials: 'include' });
    const d = await r.json().catch(() => ({}));
    if (r.status === 403) { if (box) box.innerHTML = '<div class="chat-empty">ليس لديك صلاحية عرض خدمة العملاء</div>'; stopAdminSupportListPolling(); return; }
    if (!r.ok || !d.success) throw new Error(d.error || 'تعذر تحميل المحادثات');

    const hash = JSON.stringify((d.conversations || []).map(c => [c.id, c.admin_unread_count, c.status, c.priority, c.assigned_admin_id, c.last_message_at]));
    if (hash === adminSupportListLastHash && silent) return;
    adminSupportListLastHash = hash;

    adminSupportThreadsData = d.conversations || [];
    renderSupportStats();
    renderAdminSupportThreads();
    updateAdminSupportTabBadge();
    if (!adminSupportStaff.length) loadAdminSupportStaff();
    startAdminSupportListPolling();
  } catch (e) {
    if (box && !silent) box.innerHTML = '<div class="chat-empty">' + chatAdminEsc(e.message || 'تعذر التحميل') + '</div>';
  }
}

async function loadAdminSupportStaff() {
  try {
    const r = await fetch('/api/admin/support-chat/staff', { credentials: 'include' });
    const d = await r.json().catch(() => ({}));
    if (r.ok && d.success) adminSupportStaff = d.staff || [];
  } catch (e) {}
}

function updateAdminSupportTabBadge() {
  const badge = document.getElementById('adminSupportTabBadge');
  if (!badge) return;
  const total = adminSupportThreadsData.reduce((sum, t) => sum + (t.admin_unread_count || 0), 0);
  if (total > 0) { badge.textContent = total > 99 ? '99+' : total; badge.style.display = 'inline-flex'; }
  else badge.style.display = 'none';
}

function renderSupportStats() {
  const box = document.getElementById('supportStats'); if (!box) return;
  const counts = { total: adminSupportThreadsData.length, new: 0, in_progress: 0, resolved: 0, unread: 0 };
  adminSupportThreadsData.forEach(t => { if (counts[t.status] !== undefined) counts[t.status]++; if (t.admin_unread_count > 0) counts.unread++; });
  box.innerHTML = [
    ['fa-inbox', counts.total, 'إجمالي المحادثات'],
    ['fa-envelope-open', counts.new, 'جديدة'],
    ['fa-spinner', counts.in_progress, 'قيد المتابعة'],
    ['fa-circle-check', counts.resolved, 'محلولة'],
    ['fa-envelope', counts.unread, 'غير مقروءة']
  ].map(([icon, val, label]) => `<div class="admin-stat"><div class="admin-stat-icon"><i class="fa-solid ${icon}"></i></div><div><h3>${val}</h3><p>${label}</p></div></div>`).join('');
}

function renderAdminSupportThreads() {
  const box = document.getElementById('adminSupportThreads');
  if (!box) return;
  const q = (document.getElementById('adminSupportSearch')?.value || '').trim().toLowerCase();
  let rows = adminSupportThreadsData.filter(t => !q || (t.customer_name || '').toLowerCase().includes(q) || (t.phone || '').toLowerCase().includes(q) || (t.subject || '').toLowerCase().includes(q));

  if (!rows.length) { box.innerHTML = '<div class="chat-empty"><i class="fa-solid fa-inbox" style="font-size:26px;display:block;margin-bottom:8px;color:#cbd5e1;"></i>لا توجد محادثات مطابقة</div>'; return; }

  box.innerHTML = rows.map(t => {
    const typeIcon = t.created_by_type === 'worker' ? 'fa-user-gear' : 'fa-user';
    const dim = (t.status === 'resolved' || t.status === 'closed') ? ' dim' : '';
    return `<div class="chat-thread${t.admin_unread_count > 0 ? ' unread' : ''}${dim}${String(t.id) === String(adminSupportCurrentId) ? ' active' : ''}" onclick="loadAdminSupportMessages(${t.id})">
      <h4><i class="fa-solid ${typeIcon}"></i> ${chatAdminEsc(t.customer_name || t.phone || 'مستخدم')} ${t.admin_unread_count > 0 ? `<span class="chat-badge" style="display:inline-flex;margin:0 4px">${t.admin_unread_count}</span>` : ''}</h4>
      <p>${chatAdminEsc(t.subject || SUPPORT_TYPE_LABELS_ADMIN[t.category] || '')}</p>
      <div style="display:flex;gap:5px;flex-wrap:wrap;margin-top:5px;align-items:center;">
        <span class="status-badge ${SUPPORT_STATUS_CLASS_ADMIN[t.status] || 'status-blue'}">${SUPPORT_STATUS_LABELS_ADMIN[t.status] || t.status}</span>
        <span class="status-badge ${SUPPORT_PRIORITY_CLASS_ADMIN[t.priority] || 'status-blue'}">${SUPPORT_PRIORITY_LABELS_ADMIN[t.priority] || t.priority}</span>
        ${t.assigned_admin_name ? `<span class="status-badge status-blue"><i class="fa-solid fa-user-check"></i> ${chatAdminEsc(t.assigned_admin_name)}</span>` : ''}
      </div>
      <span style="display:block;margin-top:4px;color:var(--muted);font-size:10.5px;">${waDate(t.last_message_at)}</span>
    </div>`;
  }).join('');
}

function adminSupportBackToList() {
  document.getElementById('adminSupportListPanel')?.classList.remove('mobile-hidden');
  document.getElementById('adminSupportDetailPanel')?.classList.remove('mobile-active');
  adminSupportCurrentId = null;
  stopAdminSupportConvPolling();
}

function startAdminSupportListPolling() {
  if (adminSupportListPollTimer) return;
  adminSupportListPollTimer = setInterval(() => {
    if (document.visibilityState !== 'visible') return;
    if (!document.getElementById('supportSection')?.classList.contains('active')) return;
    loadAdminSupportThreads(true);
  }, 12000);
}
function stopAdminSupportListPolling() { clearInterval(adminSupportListPollTimer); adminSupportListPollTimer = null; }
function startAdminSupportConvPolling() {
  stopAdminSupportConvPolling();
  adminSupportConvPollTimer = setInterval(() => {
    if (document.visibilityState !== 'visible') return;
    if (!adminSupportCurrentId) return;
    loadAdminSupportMessages(adminSupportCurrentId, true);
  }, 5000);
}
function stopAdminSupportConvPolling() { clearInterval(adminSupportConvPollTimer); adminSupportConvPollTimer = null; }

function renderAdminSupportAssignSelect(conv) {
  const sel = document.getElementById('adminSupportAssignSelect');
  if (!sel) return;
  sel.innerHTML = '<option value="">غير مخصصة</option>' + adminSupportStaff.map(s => `<option value="${s.id}">${chatAdminEsc(s.name)}</option>`).join('');
  sel.value = conv.assigned_admin_id || '';
}

async function loadAdminSupportMessages(threadId, silent) {
  const isNewConv = String(adminSupportCurrentId) !== String(threadId);
  adminSupportCurrentId = threadId;
  document.getElementById('adminSupportListPanel')?.classList.add('mobile-hidden');
  document.getElementById('adminSupportDetailPanel')?.classList.add('mobile-active');
  const box = document.getElementById('adminSupportMessages');
  if (box && !silent) box.innerHTML = '<div class="chat-empty">جاري تحميل الرسائل...</div>';
  try {
    const r = await fetch(`/api/admin/support-chat/conversations/${encodeURIComponent(threadId)}/messages`, { credentials: 'include' });
    const d = await r.json().catch(() => ({}));
    if (r.status === 403) { if (box) box.innerHTML = '<div class="chat-empty">ليس لديك صلاحية عرض هذه المحادثة</div>'; return; }
    if (!r.ok || !d.success) throw new Error(d.error || 'تعذر التحميل');
    const conv = d.conversation || {};
    const msgs = d.messages || [];
    const hash = JSON.stringify(msgs.map(m => m.id)) + '|' + conv.status + '|' + conv.priority + '|' + conv.assigned_admin_id;
    if (silent && hash === adminSupportConvLastHash) return;
    const wasAtBottom = box ? (box.scrollHeight - box.scrollTop - box.clientHeight < 60) : true;
    adminSupportConvLastHash = hash;

    document.getElementById('adminSupportTitle').textContent = conv.subject || 'محادثة';
    document.getElementById('adminSupportSub').textContent = (conv.customer_name || '') + (conv.phone ? ' - ' + conv.phone : '') + (conv.assigned_admin_name ? ' · مسؤول: ' + conv.assigned_admin_name : '');
    const canReply = can('support:reply'), canManage = can('support:manage');
    document.getElementById('adminSupportForm').style.display = canReply ? 'grid' : 'none';
    document.getElementById('adminSupportControls').style.display = 'flex';
    document.getElementById('adminSupportStatusSelect').value = conv.status || 'new';
    document.getElementById('adminSupportStatusSelect').disabled = !canManage;
    document.getElementById('adminSupportPrioritySelect').value = conv.priority || 'normal';
    document.getElementById('adminSupportPrioritySelect').disabled = !canManage;
    document.getElementById('adminSupportAssignSelect').disabled = !canManage;
    renderAdminSupportAssignSelect(conv);
    const attachLink = document.getElementById('adminSupportAttachmentLink');
    if (conv.has_attachment) {
      attachLink.style.display = 'inline-flex';
      attachLink.onclick = async (ev) => {
        ev.preventDefault();
        try {
          const ar = await fetch(`/api/admin/support-chat/conversations/${threadId}/attachment`, { credentials: 'include' });
          const ad = await ar.json().catch(() => ({}));
          if (ad.success && ad.url) window.open(ad.url, '_blank');
          else toast('error', 'تعذر فتح المرفق');
        } catch (e) { toast('error', 'تعذر فتح المرفق'); }
      };
    } else attachLink.style.display = 'none';

    if (box) {
      box.innerHTML = msgs.map(m => {
        if (m.is_system) return `<div class="admin-chat-msg-system">${chatAdminEsc(m.message_text || '')}</div>`;
        return `<div class="admin-chat-msg ${m.sender_type === 'admin' ? 'admin' : 'worker'}"><b>${m.sender_type === 'admin' ? 'الإدارة' : (conv.created_by_type === 'worker' ? 'الصنايعي' : 'العميل')}</b><br>${chatAdminEsc(m.message_text || '')}</div>`;
      }).join('');
      if (!silent || wasAtBottom) box.scrollTop = box.scrollHeight;
    }
    const item = adminSupportThreadsData.find(t => String(t.id) === String(threadId));
    if (item) { item.admin_unread_count = 0; item.status = conv.status; item.priority = conv.priority; item.assigned_admin_id = conv.assigned_admin_id; item.assigned_admin_name = conv.assigned_admin_name; }
    renderAdminSupportThreads();
    renderSupportStats();
    updateAdminSupportTabBadge();
    if (isNewConv) startAdminSupportConvPolling();
  } catch (e) {
    if (box && !silent) box.innerHTML = '<div class="chat-empty">' + chatAdminEsc(e.message) + '</div>';
  }
}

async function sendAdminSupportMessage(e) {
  e.preventDefault();
  if (!adminSupportCurrentId) return;
  const input = document.getElementById('adminSupportInput');
  const message = String(input?.value || '').trim();
  if (!message) return;
  try {
    const r = await fetch(`/api/admin/support-chat/conversations/${encodeURIComponent(adminSupportCurrentId)}/messages`, {
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

async function updateAdminSupportStatus() {
  if (!adminSupportCurrentId) return;
  const status = document.getElementById('adminSupportStatusSelect').value;
  try {
    const r = await fetch(`/api/admin/support-chat/conversations/${adminSupportCurrentId}/status`, { method: 'PATCH', credentials: 'include', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ status }) });
    const d = await r.json().catch(() => ({}));
    if (!r.ok || !d.success) throw new Error(d.error || 'تعذر تحديث الحالة');
    toast('success', 'تم تحديث حالة المحادثة');
    loadAdminSupportMessages(adminSupportCurrentId);
    loadAdminSupportThreads();
  } catch (err) { toast('error', err.message || 'تعذر تحديث الحالة'); }
}

async function updateAdminSupportPriority() {
  if (!adminSupportCurrentId) return;
  const priority = document.getElementById('adminSupportPrioritySelect').value;
  try {
    const r = await fetch(`/api/admin/support-chat/conversations/${adminSupportCurrentId}/priority`, { method: 'PATCH', credentials: 'include', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ priority }) });
    const d = await r.json().catch(() => ({}));
    if (!r.ok || !d.success) throw new Error(d.error || 'تعذر تحديث الأولوية');
    toast('success', 'تم تحديث الأولوية');
    loadAdminSupportThreads(true);
  } catch (err) { toast('error', err.message || 'تعذر تحديث الأولوية'); }
}

async function updateAdminSupportAssignment() {
  if (!adminSupportCurrentId) return;
  const adminId = document.getElementById('adminSupportAssignSelect').value || null;
  try {
    const r = await fetch(`/api/admin/support-chat/conversations/${adminSupportCurrentId}/assign`, { method: 'PATCH', credentials: 'include', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ admin_id: adminId }) });
    const d = await r.json().catch(() => ({}));
    if (!r.ok || !d.success) throw new Error(d.error || 'تعذر تحديث التعيين');
    toast('success', 'تم تحديث التعيين');
    loadAdminSupportMessages(adminSupportCurrentId);
    loadAdminSupportThreads();
  } catch (err) { toast('error', err.message || 'تعذر تحديث التعيين'); }
}

function assignSupportToMe() {
  if (!currentAdmin?.id) { toast('error', 'تعذر تحديد هويتك'); return; }
  const sel = document.getElementById('adminSupportAssignSelect');
  if (sel) sel.value = currentAdmin.id;
  updateAdminSupportAssignment();
}

async function loadSupportChannels() {
  try {
    const r = await fetch('/api/admin/settings/support-channels', { credentials: 'include' });
    const d = await r.json().catch(() => ({}));
    if (r.ok && d.success) {
      document.getElementById('supportChannelPhone').value = d.channels.phone || '';
      document.getElementById('supportChannelWhatsapp').value = d.channels.whatsapp || '';
      document.getElementById('supportChannelHours').value = d.channels.working_hours || '';
    }
  } catch (e) {}
}

async function saveSupportChannels() {
  try {
    const phone = document.getElementById('supportChannelPhone').value.trim();
    const whatsapp = document.getElementById('supportChannelWhatsapp').value.trim();
    const working_hours = document.getElementById('supportChannelHours').value.trim();
    const r = await fetch('/api/admin/settings/support-channels', { method: 'PUT', credentials: 'include', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ phone, whatsapp, working_hours }) });
    const d = await r.json().catch(() => ({}));
    if (!r.ok || !d.success) throw new Error(d.error || 'تعذر الحفظ');
    toast('success', 'تم حفظ قنوات التواصل');
  } catch (err) { toast('error', err.message || 'تعذر الحفظ'); }
}

window.onload = checkLogin;

// ==========================================
// دوال التقييمات (النجوم) لروت الصنايعية
// ==========================================
function getRatingSummary(workerId) {
  if (!ratingsByWorker[workerId]) return { average: 0, count: 0 };
  return ratingsByWorker[workerId];
}

function renderAdminRating(id) {
  const summary = getRatingSummary(id);
  if (!summary.count) {
    return '<div class="admin-card-rating no-rating"><i class="fa-regular fa-star"></i> لا توجد تقييمات</div>';
  }
  return `<div class="admin-card-rating"><i class="fa-solid fa-star"></i> ${summary.average} من 5 (${summary.count})</div>`;
}
// ==========================================
// دالة ترتيب الصنايعية في لوحة الإدارة (ضرورية للفلترة)
// ==========================================
function sortAdminWorkers(workers){
  const sortEl = document.getElementById("adminSortFilter");
  const sortValue = sortEl ? sortEl.value : "default";
  const sorted = [...workers];

  if(sortValue === "rating"){
    sorted.sort((a, b) => {
      const ar = (typeof getRatingSummary === "function") ? getRatingSummary(wid(a)) : { average: 0, count: 0 };
      const br = (typeof getRatingSummary === "function") ? getRatingSummary(wid(b)) : { average: 0, count: 0 };
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
  }

  return sorted;
}

// ==========================================
// نظام التحديث التلقائي والإشعارات الصوتية بالخلفية
// ==========================================
const notifySound = new Audio('https://cdn.pixabay.com/download/audio/2021/08/04/audio_0625c1539c.mp3?filename=message-incoming-132057.mp3');
let lastPendingWorkers = null;
let lastUnreadChats = null;

async function fetchAutoUpdates() {
    if (typeof currentAdmin === 'undefined' || !currentAdmin) return;
    try {
        if(typeof fetchJson === 'function') {
            const notifData = await fetchJson(["/api/admin/notifications"]);
            if (notifData) {
                const currentPending = notifData.pendingWorkers || 0;
                if (lastPendingWorkers !== null && currentPending > lastPendingWorkers) {
                    notifySound.play().catch(e => console.log("الصوت محظور مؤقتاً بواسطة المتصفح"));
                    if(typeof toast === 'function') toast('success', '🔔 انتباه: طلب تسجيل صنايعي جديد بانتظار الموافقة!');
                    if(typeof loadWorkers === 'function' && typeof filterAdminWorkers === 'function') { await loadWorkers(); filterAdminWorkers(); }
                }
                lastPendingWorkers = currentPending;
                if(typeof adminNotifications !== 'undefined') adminNotifications = notifData;
                if(typeof renderNotifications === 'function') renderNotifications();
            }
        }
        let totalUnread = 0;
        try {
            const chatRes = await fetch('/api/admin/worker-chat/unread-count', {credentials: 'include'});
            if (chatRes.ok) {
                const chatData = await chatRes.json();
                const workerUnread = Number(chatData.unread_count || 0);
                totalUnread += workerUnread;
                const chatBadge = document.getElementById('adminChatTabBadge');
                if(chatBadge) { chatBadge.textContent = workerUnread; chatBadge.style.display = workerUnread > 0 ? 'inline-flex' : 'none'; }
            }
        } catch(e) {}
        try {
            const supportRes = await fetch('/api/admin/support-chat/unread-count', {credentials: 'include'}); 
            if (supportRes.ok) {
                const supportData = await supportRes.json();
                const supportUnread = Number(supportData.unread_count || 0);
                totalUnread += supportUnread;
                const supportBadge = document.getElementById('adminSupportTabBadge');
                if(supportBadge) { supportBadge.textContent = supportUnread; supportBadge.style.display = supportUnread > 0 ? 'inline-flex' : 'none'; }
            }
        } catch(e) {}

        if (lastUnreadChats !== null && totalUnread > lastUnreadChats) {
            notifySound.play().catch(e => console.log("الصوت محظور مؤقتاً بواسطة المتصفح"));
            if(typeof toast === 'function') toast('success', '💬 رسالة جديدة في المحادثات!');
            if(typeof loadAdminChatThreads === 'function') loadAdminChatThreads();
            if(typeof loadAdminSupportThreads === 'function') loadAdminSupportThreads();
            if (document.getElementById('chatSection')?.classList.contains('active') && typeof adminChatCurrentWorkerId !== 'undefined' && adminChatCurrentWorkerId) {
                if(typeof loadAdminChatMessages === 'function') loadAdminChatMessages(adminChatCurrentWorkerId);
            }
            if (document.getElementById('supportSection')?.classList.contains('active') && typeof adminSupportCurrentId !== 'undefined' && adminSupportCurrentId) {
                if(typeof loadAdminSupportMessages === 'function') loadAdminSupportMessages(adminSupportCurrentId);
            }
        }
        lastUnreadChats = totalUnread;
    } catch (err) { console.error("Auto-update check failed:", err); }
}
setInterval(fetchAutoUpdates, 10000); setTimeout(fetchAutoUpdates, 2000);