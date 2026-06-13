
let allWorkers=[],allTrades=[],allAreas=[],photosByWorker={},allReviews=[],ratingsByWorker={},pendingReviewsByWorker={},adminNotifications={};
async function loginAdmin(e){e.preventDefault();const p=document.getElementById("adminPassword").value.trim();const err=document.getElementById("loginError");err.classList.remove("show");err.textContent="جاري التحقق...";try{const r=await fetch("/api/admin/login",{method:"POST",credentials:"include",headers:{"Content-Type":"application/json"},body:JSON.stringify({password:p})});const d=await r.json().catch(()=>({}));if(!r.ok||!d.success)throw new Error(d.error||"تعذر تسجيل الدخول");err.classList.remove("show");showDashboard()}catch(ex){err.textContent=ex.message||"كلمة السر غير صحيحة";err.classList.add("show")}}
function showDashboard(){document.getElementById("loginScreen").style.display="none";document.getElementById("dashboard").classList.add("show");loadAllData()}
function showLogin(){document.getElementById("dashboard").classList.remove("show");document.getElementById("loginScreen").style.display="flex"}
async function logoutAdmin(){try{await fetch("/api/admin/logout",{method:"POST",credentials:"include"})}catch(e){} location.reload()}
async function checkLogin(){try{const r=await fetch("/api/admin/me",{credentials:"include"});const d=await r.json();if(d.authenticated)showDashboard();else showLogin()}catch(e){showLogin()}}
function switchTab(t,b){document.querySelectorAll(".admin-tab").forEach(x=>x.classList.remove("active"));b.classList.add("active");document.querySelectorAll(".admin-section").forEach(s=>s.classList.remove("active"));document.getElementById(t+"Section").classList.add("active");if(t==='reviews')renderReviews()}function toast(type,text){const el=document.getElementById("toast");el.className="message-toast show "+type;el.innerHTML=text;setTimeout(()=>{el.className="message-toast";el.innerHTML=""},3500)}
async function fetchJson(urls){for(const u of urls){try{const r=await fetch(u,{credentials:"include"});if(r.status===401){showLogin();return []}if(r.ok)return await r.json()}catch(e){}}return []}function arr(d){if(Array.isArray(d))return d;for(const k of["data","workers","sanaieya","trades","crafts","areas","items"])if(d&&Array.isArray(d[k]))return d[k];return[]}function itemName(i){if(typeof i==="string")return i;return i.name||i.title||i.trade||i.craft||i.area||i.location||""}function itemId(i){if(typeof i==="string")return i;return i.id||i._id||i.name||i.title||""}
async function loadAllData(){await loadTrades();await loadAreas();await loadWorkers();await loadPhotosForAll();await loadReviewsAdmin();await loadNotifications();buildRatingMaps();fillTradeSelects();fillAreaSelects();renderWorkers(allWorkers);stats()}
async function loadWorkers(){allWorkers=arr(await fetchJson(["/api/admin/workers","/api/workers/all"]))}async function loadTrades(){allTrades=arr(await fetchJson(["/api/trades","/api/crafts","/trades","/crafts"]));renderTrades();fillTradeSelects()}async function loadAreas(){allAreas=arr(await fetchJson(["/api/areas","/api/locations","/areas","/locations"]));renderAreas();fillAreaSelects()}
async function loadPhotosForAll(){photosByWorker={};for(const w of allWorkers){const id=wid(w);photosByWorker[id]=arr(await fetchJson(["/api/workers/"+id+"/photos"]))}}
function fillTradeSelects(){const f=document.getElementById("adminTradeFilter"),e=document.getElementById("editTrade");if(!f||!e)return;f.innerHTML='<option value="">كل الحرف</option>';e.innerHTML='<option value="">اختر الحرفة</option>';allTrades.forEach(i=>{const name=itemName(i);if(name){f.innerHTML+=`<option value="${name}">${name}</option>`;e.innerHTML+=`<option value="${name}">${name}</option>`}})}function fillAreaSelects(){
  const e=document.getElementById("editArea");
  const filter=document.getElementById("adminAreaFilter");
  if(e)e.innerHTML='<option value="">اختر المنطقة</option>';
  if(filter)filter.innerHTML='<option value="">كل المناطق</option>';
  allAreas.forEach(i=>{
    const name=itemName(i);
    if(!name)return;
    if(e)e.innerHTML+=`<option value="${name}">${name}</option>`;
    if(filter)filter.innerHTML+=`<option value="${name}">${name}</option>`;
  });
}
function wid(w){return w.id||w._id||w.worker_id}function wname(w){return w.name||w.full_name||w.worker_name||"صنايعي"}function wphone(w){return w.phone||w.mobile||w.phone_number||""}function wwhatsapp(w){return w.whatsapp||w.whatsapp_number||w.whats||""}function wtrade(w){return w.trade||w.craft||w.job||w.profession||w.trade_name||"غير محدد"}function warea(w){return w.area||w.location||w.region||w.area_name||"غير محدد"}function wdesc(w){return w.description||w.about||w.notes||""}function wimg(w){const image=w.image||w.photo||w.image_url||w.photo_url||"";if(!image)return"https://ui-avatars.com/api/?name=صنايعي&background=1D4ED8&color=fff&size=300";if(image.startsWith("http"))return image;if(image.startsWith("/uploads"))return image;if(image.startsWith("uploads"))return"/"+image;return"/uploads/"+image}
function ok(v){return v===1||v===true||v==="1"||v==="true"||v==="approved"||v==="active"}function isApproved(w){return ok(w.approved??w.is_approved??w.visible??0)}function isActive(w){return ok(w.active??w.is_active??w.status??1)}function isFeatured(w){return ok(w.featured??w.is_featured??w.special??0)}
function formatDate(x){if(!x)return"غير محدد";const d=new Date(x);return isNaN(d.getTime())?"غير محدد":d.toLocaleDateString("ar-EG",{year:"numeric",month:"long",day:"numeric"})}function daysLeft(w){const end=w.subscription_end||w.subscriptionEnd||w.end_date;if(!end)return null;const t=new Date(),e=new Date(end);t.setHours(0,0,0,0);e.setHours(0,0,0,0);if(isNaN(e.getTime()))return null;return Math.ceil((e-t)/(86400000))}
function subInfo(w){const d=daysLeft(w);let cls="sub-active",icon="fa-circle-check",text="الاشتراك شغال";if(d===null){cls="sub-soon";icon="fa-circle-question";text="لم يتم تحديد نهاية الاشتراك"}else if(d<0){cls="sub-expired";icon="fa-circle-xmark";text="الاشتراك منتهي"}else if(d===0){cls="sub-soon";icon="fa-triangle-exclamation";text="ينتهي اليوم"}else if(d<=7){cls="sub-soon";icon="fa-triangle-exclamation";text=`قرب ينتهي - متبقي ${d} يوم`}else{text=`شغال - متبقي ${d} يوم`}return{start:w.subscription_start||"",end:w.subscription_end||"",daysLeft:d,cls,icon,text}}
function stats(){document.getElementById("totalCount").textContent=allWorkers.length;document.getElementById("approvedCount").textContent=allWorkers.filter(isApproved).length;document.getElementById("pendingCount").textContent=allWorkers.length-allWorkers.filter(isApproved).length;document.getElementById("featuredCount").textContent=allWorkers.filter(isFeatured).length;
  const pendingReviews = allReviews.filter(r=>!ok(r.approved)).length;
  const pendingEl=document.getElementById("pendingReviewsCount");
  if(pendingEl) pendingEl.textContent=pendingReviews;
}
function imgPath(image){if(!image)return"";if(image.startsWith("http"))return image;if(image.startsWith("/uploads"))return image;if(image.startsWith("uploads"))return"/"+image;return"/uploads/"+image}
function renderPhotoAdmin(id){const photos=photosByWorker[id]||[];if(!photos.length)return'<div class="no-photos">لا توجد صور أعمال مضافة</div>';return`<div class="work-admin-gallery">${photos.map(p=>`<div class="work-admin-photo"><img src="${imgPath(p.image)}"><button onclick="deleteWorkPhoto(event,'${p.id}')">×</button></div>`).join("")}</div>`}
function buildRatingMaps(){
  ratingsByWorker={};
  pendingReviewsByWorker={};

  allWorkers.forEach(w=>{
    const id=String(wid(w));
    ratingsByWorker[id]={average:0,count:0};
    pendingReviewsByWorker[id]=0;
  });

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
    ratingsByWorker[workerId]={
      average: list.length ? Math.round((sum/list.length)*10)/10 : 0,
      count: list.length
    };
  });
}

function getRatingSummary(id){
  return ratingsByWorker[String(id)] || {average:0,count:0};
}

function getPendingReviewsCount(id){
  return pendingReviewsByWorker[String(id)] || 0;
}

function renderAdminRating(id){
  const summary=getRatingSummary(id);
  const pending=getPendingReviewsCount(id);

  if(!summary.count && !pending){
    return '<div class="admin-card-rating no-rating"><i class="fa-regular fa-star"></i> لا توجد تقييمات</div>';
  }

  let text='';
  if(summary.count){
    text += `<i class="fa-solid fa-star"></i> ${summary.average} من 5 (${summary.count})`;
  }else{
    text += '<i class="fa-regular fa-star"></i> لا توجد تقييمات معتمدة';
  }

  if(pending){
    text += ` - ${pending} منتظر`;
  }

  return `<div class="admin-card-rating">${text}</div>`;
}

function sortAdminWorkers(workers){
  const sortEl=document.getElementById("adminSortFilter");
  const sortValue=sortEl ? sortEl.value : "default";
  const sorted=[...workers];

  if(sortValue==="rating"){
    sorted.sort((a,b)=>{
      const ar=getRatingSummary(wid(a));
      const br=getRatingSummary(wid(b));
      if(br.average !== ar.average) return br.average - ar.average;
      return br.count - ar.count;
    });
  }

  if(sortValue==="newest"){
    sorted.sort((a,b)=>(Number(wid(b))||0)-(Number(wid(a))||0));
  }

  if(sortValue==="featured"){
    sorted.sort((a,b)=>{
      const af=isFeatured(a)?1:0;
      const bf=isFeatured(b)?1:0;
      if(bf !== af) return bf-af;
      return (Number(wid(b))||0)-(Number(wid(a))||0);
    });
  }

  if(sortValue==="pending_reviews"){
    sorted.sort((a,b)=>getPendingReviewsCount(wid(b))-getPendingReviewsCount(wid(a)));
  }

  return sorted;
}

function renderWorkers(workers){const grid=document.getElementById("adminWorkersGrid");grid.innerHTML="";if(!workers.length){grid.innerHTML='<div class="empty-admin" style="grid-column:1/-1">لا يوجد صنايعية للعرض حاليًا</div>';return}workers.forEach(w=>{const id=wid(w),sub=subInfo(w),approved=isApproved(w),active=isActive(w),featured=isFeatured(w);const card=document.createElement("article");card.className="admin-worker-card";card.innerHTML=`<img class="admin-worker-img" src="${wimg(w)}"><div class="admin-worker-main"><h3>${wname(w)}</h3>${renderAdminRating(id)}<div class="worker-tags"><span class="worker-tag"><i class="fa-solid fa-phone"></i>${wphone(w)||"لا يوجد اتصال"}</span><span class="worker-tag"><i class="fa-brands fa-whatsapp"></i>${wwhatsapp(w)||"نفس رقم الاتصال"}</span><span class="worker-tag"><i class="fa-solid fa-screwdriver-wrench"></i>${wtrade(w)}</span><span class="worker-tag"><i class="fa-solid fa-location-dot"></i>${warea(w)}</span></div><div class="status-row"><span class="status-badge ${approved?'status-green':'status-yellow'}">${approved?"موافق عليه":"بانتظار الموافقة"}</span><span class="status-badge ${active?'status-green':'status-red'}">${active?"نشط":"متوقف"}</span><span class="status-badge ${featured?'status-yellow':'status-blue'}">${featured?"مميز":"عادي"}</span></div><div class="subscription-box"><strong>بيانات الاشتراك</strong><div class="subscription-dates"><div class="subscription-date"><small>البداية</small><strong>${formatDate(sub.start)}</strong></div><div class="subscription-date"><small>النهاية</small><strong>${formatDate(sub.end)}</strong></div></div><span class="subscription-status ${sub.cls}"><i class="fa-solid ${sub.icon}"></i>${sub.text}</span></div><p>${wdesc(w)||"لا يوجد وصف."}</p><strong><i class="fa-solid fa-images"></i> صور الأعمال</strong>${renderPhotoAdmin(id)}<div class="card-actions"><button class="action-btn ${approved?'btn-yellow':'btn-green'}" onclick="toggleApprove('${id}',${approved})">${approved?"إلغاء الموافقة":"موافقة"}</button><button class="action-btn ${active?'btn-yellow':'btn-green'}" onclick="toggleActive('${id}',${active})">${active?"إيقاف":"تفعيل"}</button><button class="action-btn ${featured?'btn-purple':'btn-yellow'}" onclick="toggleFeatured('${id}',${featured})">${featured?"إلغاء التمييز":"تمييز"}</button><button class="action-btn btn-blue" onclick="openRenewModal('${id}')"><i class="fa-solid fa-credit-card"></i> تجديد الاشتراك</button><button class="action-btn btn-dark" onclick="openEditModal('${id}')">تعديل</button><button class="action-btn btn-red" onclick="deleteWorker('${id}')">حذف</button></div></div>`;grid.appendChild(card)})}
function filterAdminWorkers(){
  const s=document.getElementById("adminSearch").value.trim().toLowerCase();
  const tf=document.getElementById("adminTradeFilter").value.trim().toLowerCase();
  const af=document.getElementById("adminAreaFilter").value.trim().toLowerCase();
  const sf=document.getElementById("adminStatusFilter").value;

  const filtered=allWorkers.filter(w=>{
    const search=wname(w).toLowerCase().includes(s)||wphone(w).toLowerCase().includes(s)||wwhatsapp(w).toLowerCase().includes(s)||wtrade(w).toLowerCase().includes(s)||warea(w).toLowerCase().includes(s)||wdesc(w).toLowerCase().includes(s);
    const trade=!tf||wtrade(w).toLowerCase()===tf;
    const area=!af||warea(w).toLowerCase()===af;

    let status=true;
    if(sf==="approved")status=isApproved(w);
    if(sf==="pending")status=!isApproved(w);
    if(sf==="active")status=isActive(w);
    if(sf==="inactive")status=!isActive(w);
    if(sf==="featured")status=isFeatured(w);

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
async function reqs(list){for(const r of list){try{const opt={method:r.method||"POST",credentials:"include",headers:{"Content-Type":"application/json"}};if(r.body)opt.body=JSON.stringify(r.body);const res=await fetch(r.url,opt);if(res.status===401){showLogin();return false}if(res.ok)return true}catch(e){}}return false}
function after(ok,msg){if(ok){toast("success",msg);loadAllData()}else toast("error","لم يتم تنفيذ الأمر")}
async function toggleApprove(id,c){after(await reqs([{url:`/api/workers/${id}/approve`,method:"PUT",body:{approved:c?0:1}}]),"تم تحديث الموافقة")}
async function toggleActive(id,c){after(await reqs([{url:`/api/workers/${id}/active`,method:"PUT",body:{active:c?0:1}}]),"تم تحديث التفعيل")}
async function toggleFeatured(id,c){after(await reqs([{url:`/api/workers/${id}/featured`,method:"PUT",body:{featured:c?0:1}}]),"تم تحديث التمييز")}
function renewPlanDefaults(plan){const map={month:{months:1,amount:100},half:{months:6,amount:600},year:{months:12,amount:1200},custom:{months:1,amount:0}};return map[plan]||map.month}
function updateRenewPlanDefaults(){const plan=document.getElementById("renewPlan").value;const d=renewPlanDefaults(plan);document.getElementById("renewMonths").value=d.months;document.getElementById("renewAmount").value=d.amount}
function openRenewModal(id){const w=allWorkers.find(x=>String(wid(x))===String(id));if(!w)return;const sub=subInfo(w);document.getElementById("renewWorkerId").value=id;document.getElementById("renewWorkerName").textContent=wname(w);document.getElementById("renewCurrentEnd").textContent="نهاية الاشتراك الحالية: "+formatDate(sub.end);document.getElementById("renewPlan").value="month";document.getElementById("renewPaymentMethod").value="cash";document.getElementById("renewPaymentStatus").value="paid";document.getElementById("renewNote").value="";document.getElementById("renewWarning").innerHTML="";updateRenewPlanDefaults();document.getElementById("renewModal").classList.add("show");loadSubscriptionPayments(id)}
function closeRenewModal(){document.getElementById("renewModal").classList.remove("show")}
function paymentMethodLabel(v){return {cash:"كاش",vodafone_cash:"فودافون كاش",instapay:"إنستاباي",bank_transfer:"تحويل بنكي",free:"مجاني / هدية",other:"أخرى"}[v]||v||"غير محدد"}
function paymentStatusLabel(v){return {paid:"مدفوع",pending:"منتظر الدفع",partial:"مدفوع جزئيًا"}[v]||v||"غير محدد"}
function formatMoney(v){return (Number(v)||0).toLocaleString("ar-EG")+" جنيه"}
async function loadSubscriptionPayments(id){const box=document.getElementById("subscriptionHistory");box.innerHTML='<div class="subscription-history-empty">جاري تحميل سجل التجديدات...</div>';try{const r=await fetch(`/api/workers/${id}/subscription-payments`,{credentials:"include"});const d=await r.json();const items=d.items||[];if(!items.length){box.innerHTML='<div class="subscription-history-empty">لا يوجد سجل تجديدات محفوظ لهذا الصنايعي حتى الآن.</div>';return}box.innerHTML=items.map(x=>`<div class="subscription-history-item"><strong>${formatMoney(x.amount)} - ${paymentMethodLabel(x.payment_method)} - ${paymentStatusLabel(x.payment_status)}</strong><small>الباقة: ${x.plan||"غير محدد"} | المدة: ${x.months||0} شهر</small><small>من ${formatDate(x.previous_subscription_end)} إلى ${formatDate(x.new_subscription_end)}</small>${x.note?`<small>ملاحظة: ${x.note}</small>`:""}</div>`).join("")}catch(e){box.innerHTML='<div class="subscription-history-empty">تعذر تحميل سجل التجديدات.</div>'}}
async function submitRenewWorker(e){e.preventDefault();const id=document.getElementById("renewWorkerId").value;const body={plan:document.getElementById("renewPlan").value,months:Number(document.getElementById("renewMonths").value)||1,amount:Number(document.getElementById("renewAmount").value)||0,payment_method:document.getElementById("renewPaymentMethod").value,payment_status:document.getElementById("renewPaymentStatus").value,note:document.getElementById("renewNote").value.trim()};try{const r=await fetch(`/api/workers/${id}/renew`,{method:"PUT",credentials:"include",headers:{"Content-Type":"application/json"},body:JSON.stringify(body)});const d=await r.json().catch(()=>({}));if(r.status===401){showLogin();return}if(!r.ok||!d.success)throw new Error(d.error||"لم يتم التجديد");if(d.warning){document.getElementById("renewWarning").innerHTML=`<div class="payment-warning">${d.warning}</div>`}else{closeRenewModal()}toast("success","تم تجديد الاشتراك وتحديث البيانات");await loadAllData();if(d.warning)loadSubscriptionPayments(id)}catch(ex){toast("error",ex.message||"لم يتم تجديد الاشتراك")}}
async function renewWorker(id,plan){openRenewModal(id);if(plan){document.getElementById("renewPlan").value=plan;updateRenewPlanDefaults()}}

async function deleteWorker(id){if(!confirm("هل أنت متأكد؟"))return;after(await reqs([{url:`/api/workers/${id}`,method:"DELETE"}]),"تم حذف الصنايعي")}
async function deleteWorkPhoto(e,id){e.stopPropagation();if(!confirm("حذف صورة العمل؟"))return;after(await reqs([{url:`/api/workers/photos/${id}`,method:"DELETE"}]),"تم حذف الصورة")}
function openEditModal(id){const w=allWorkers.find(x=>String(wid(x))===String(id));if(!w)return;document.getElementById("editId").value=id;document.getElementById("editName").value=wname(w);document.getElementById("editPhone").value=wphone(w);document.getElementById("editWhatsapp").value=wwhatsapp(w);document.getElementById("editTrade").value=wtrade(w);document.getElementById("editArea").value=warea(w);document.getElementById("editDescription").value=wdesc(w);document.getElementById("editModal").classList.add("show")}function closeEditModal(){document.getElementById("editModal").classList.remove("show")}
async function submitEditWorker(e){e.preventDefault();const id=document.getElementById("editId").value;const body={name:document.getElementById("editName").value.trim(),phone:document.getElementById("editPhone").value.trim(),whatsapp:document.getElementById("editWhatsapp").value.trim(),trade:document.getElementById("editTrade").value.trim(),area:document.getElementById("editArea").value.trim(),description:document.getElementById("editDescription").value.trim()};const ok=await reqs([{url:`/api/workers/${id}`,method:"PUT",body}]);if(ok)closeEditModal();after(ok,"تم تعديل البيانات")}
function renderTrades(){const list=document.getElementById("tradesList");list.innerHTML=allTrades.length?allTrades.map(i=>`<div class="list-item"><strong>${itemName(i)}</strong><button class="action-btn btn-red" onclick="deleteTrade('${itemId(i)}')">حذف</button></div>`).join(""):'<div class="empty-admin">لا توجد حرف</div>'}async function addTrade(e){e.preventDefault();const input=document.getElementById("newTradeInput"),name=input.value.trim();if(!name)return toast("error","اكتب اسم الحرفة");const ok=await reqs([{url:"/api/trades",method:"POST",body:{name}}]);if(ok){input.value="";await loadTrades();toast("success","تمت إضافة الحرفة")}else toast("error","لم تتم الإضافة")}async function deleteTrade(id){if(!confirm("حذف الحرفة؟"))return;const ok=await reqs([{url:`/api/trades/${id}`,method:"DELETE"}]);if(ok){await loadTrades();toast("success","تم حذف الحرفة")}else toast("error","لم يتم الحذف")}
function renderAreas(){const list=document.getElementById("areasList");list.innerHTML=allAreas.length?allAreas.map(i=>`<div class="list-item"><strong>${itemName(i)}</strong><button class="action-btn btn-red" onclick="deleteArea('${itemId(i)}')">حذف</button></div>`).join(""):'<div class="empty-admin">لا توجد مناطق</div>'}async function addArea(e){e.preventDefault();const input=document.getElementById("newAreaInput"),name=input.value.trim();if(!name)return toast("error","اكتب اسم المنطقة");const ok=await reqs([{url:"/api/areas",method:"POST",body:{name}}]);if(ok){input.value="";await loadAreas();toast("success","تمت إضافة المنطقة")}else toast("error","لم تتم الإضافة")}async function deleteArea(id){if(!confirm("حذف المنطقة؟"))return;const ok=await reqs([{url:`/api/areas/${id}`,method:"DELETE"}]);if(ok){await loadAreas();toast("success","تم حذف المنطقة")}else toast("error","لم يتم الحذف")}

async function loadReviewsAdmin(){
  allReviews = arr(await fetchJson(["/api/admin/reviews"]));
  buildRatingMaps();
}

function renderReviewStars(value){
  const rating = Math.round(Number(value) || 0);
  return "★★★★★".slice(0, rating) + "☆☆☆☆☆".slice(0, 5 - rating);
}

function renderReviews(){
  const grid = document.getElementById("reviewsGrid");
  if(!grid) return;

  const searchEl = document.getElementById("reviewSearch");
  const statusEl = document.getElementById("reviewStatusFilter");

  const search = searchEl ? searchEl.value.trim().toLowerCase() : "";
  const status = statusEl ? statusEl.value : "";

  const filtered = allReviews.filter(r => {
    const text = [
      r.customer_name,
      r.comment,
      r.worker_name,
      r.worker_trade,
      r.worker_area
    ].join(" ").toLowerCase();

    let statusOk = true;
    if(status === "pending") statusOk = !ok(r.approved);
    if(status === "approved") statusOk = ok(r.approved);

    return text.includes(search) && statusOk;
  });

  grid.innerHTML = "";

  if(!filtered.length){
    grid.innerHTML = '<div class="empty-admin" style="grid-column:1/-1">لا توجد تقييمات للعرض حاليًا</div>';
    return;
  }

  filtered.forEach(r => {
    const approved = ok(r.approved);
    const card = document.createElement("div");
    card.className = "review-admin-card";
    card.innerHTML = `
      <div class="review-admin-head">
        <div>
          <h3>${r.worker_name || "صنايعي محذوف"}</h3>
          <div class="worker-tags">
            <span class="worker-tag"><i class="fa-solid fa-user"></i>${r.customer_name || "عميل"}</span>
            <span class="worker-tag"><i class="fa-solid fa-screwdriver-wrench"></i>${r.worker_trade || "غير محدد"}</span>
            <span class="worker-tag"><i class="fa-solid fa-location-dot"></i>${r.worker_area || "غير محدد"}</span>
          </div>
        </div>
        <span class="status-badge ${approved ? "status-green" : "status-yellow"}">
          ${approved ? "معتمد" : "بانتظار الموافقة"}
        </span>
      </div>

      <div class="review-stars">${renderReviewStars(r.rating)}</div>
      <div class="review-comment">${r.comment || ""}</div>

      <div class="card-actions">
        <button class="action-btn ${approved ? "btn-yellow" : "btn-green"}" onclick="toggleReviewApprove('${r.id}', ${approved})">
          ${approved ? "إلغاء الموافقة" : "موافقة"}
        </button>
        <button class="action-btn btn-red" onclick="deleteReview('${r.id}')">
          حذف
        </button>
      </div>
    `;
    grid.appendChild(card);
  });
}

async function toggleReviewApprove(id, current){
  const approved = current ? 0 : 1;
  const okReq = await reqs([{url:`/api/reviews/${id}/approve`,method:"PUT",body:{approved}}]);
  if(okReq){
    toast("success","تم تحديث حالة التقييم");
    await loadReviewsAdmin();
    renderReviews();
  }else{
    toast("error","لم يتم تحديث التقييم");
  }
}

async function deleteReview(id){
  if(!confirm("هل تريد حذف هذا التقييم؟")) return;
  const okReq = await reqs([{url:`/api/reviews/${id}`,method:"DELETE"}]);
  if(okReq){
    toast("success","تم حذف التقييم");
    await loadReviewsAdmin();
    renderReviews();
  }else{
    toast("error","لم يتم حذف التقييم");
  }
}


function downloadBackup(){
  window.location.href = "/api/backup-db";
}


function exportWorkersReport(){
  window.location.href = "/api/export-workers";
}



async function loadNotifications(){
  try{
    const data = await fetchJson(["/api/admin/notifications"]);
    adminNotifications = data || {};
  }catch(e){
    adminNotifications = {};
  }

  renderNotifications();
}

function renderNotifications(){
  const pendingWorkers = adminNotifications.pendingWorkers || 0;
  const pendingReviews = adminNotifications.pendingReviews || 0;
  const soon = adminNotifications.subscriptionsSoon || 0;
  const expired = adminNotifications.subscriptionsExpired || 0;

  const a=document.getElementById("notifyPendingWorkers");
  const b=document.getElementById("notifyPendingReviews");
  const c=document.getElementById("notifySubscriptionsSoon");
  const d=document.getElementById("notifySubscriptionsExpired");

  if(a)a.textContent=pendingWorkers;
  if(b)b.textContent=pendingReviews;
  if(c)c.textContent=soon;
  if(d)d.textContent=expired;
}

function activateWorkersTab(){
  const workersBtn = document.querySelector(".admin-tab");
  if(workersBtn) switchTab("workers", workersBtn);
}

function showPendingWorkers(){
  activateWorkersTab();
  document.getElementById("adminStatusFilter").value = "pending";
  filterAdminWorkers();
  document.getElementById("workersSection").scrollIntoView({behavior:"smooth"});
}

function showSubscriptionsSoon(){
  activateWorkersTab();
  document.getElementById("adminStatusFilter").value = "sub_soon";
  filterAdminWorkers();
  document.getElementById("workersSection").scrollIntoView({behavior:"smooth"});
}

function showSubscriptionsExpired(){
  activateWorkersTab();
  document.getElementById("adminStatusFilter").value = "sub_expired";
  filterAdminWorkers();
  document.getElementById("workersSection").scrollIntoView({behavior:"smooth"});
}

function showPendingReviews(){
  const tabs = Array.from(document.querySelectorAll(".admin-tab"));
  const reviewsBtn = tabs.find(btn => btn.textContent.includes("التقييمات"));
  if(reviewsBtn) switchTab("reviews", reviewsBtn);

  const status = document.getElementById("reviewStatusFilter");
  if(status) status.value = "pending";

  if(typeof renderReviews === "function") renderReviews();

  const section = document.getElementById("reviewsSection");
  if(section) section.scrollIntoView({behavior:"smooth"});
}

checkLogin();


    if ("serviceWorker" in navigator) {
      window.addEventListener("load", function () {
        navigator.serviceWorker.register("/service-worker.js").catch(function (error) {
          console.log("Service Worker registration failed:", error);
        });
      });
    }
  