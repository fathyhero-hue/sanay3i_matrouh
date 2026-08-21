let allWorkers = [];
let allTrades = [];
let allAreas = [];
let ratingsByWorker = {};
let expandedTradeKey = "";
let renderDebounceTimer = null;

// حماية احتياطية: لو customerGate.js لسه ما اتحملش (مثلاً نسخة قديمة متخزنة
// في كاش المتصفح/service worker من قبل ما نضيف السكريبت ده لـ index.html)،
// منسيبش الضغطة تعمل TypeError صامت - وفي نفس الوقت مانفتحش بروفايل الصنايعي
// من غير تسجيل عميل. نسجل الخطأ في الـ console عشان يبان بوضوح، مش يتبلع بصمت.
function withCustomerGate(callback) {
  if (window.CustomerGate && typeof window.CustomerGate.ensureIdentified === "function") {
    callback(window.CustomerGate);
  } else {
    console.error("CustomerGate لم يتم تحميله - تم منع فتح بروفايل الصنايعي احتياطيًا");
  }
}

// البحث كان يعيد بناء كل البطاقات مع كل حرف؛ تأخير صغير يجعل الكتابة سلسة.
function scheduleTradeGroupsRender() {
  window.clearTimeout(renderDebounceTimer);
  renderDebounceTimer = window.setTimeout(renderTradeGroups, 180);
  scheduleSearchTracking();
}

// تتبع البحث بعد ما المستخدم يوقف عن الكتابة شوية (مش مع كل حرف) عشان
// منولدش حدث لكل ضغطة على لوحة المفاتيح
let searchTrackDebounceTimer = null;
function scheduleSearchTracking() {
  window.clearTimeout(searchTrackDebounceTimer);
  searchTrackDebounceTimer = window.setTimeout(() => {
    const query = document.getElementById("searchInput")?.value.trim() || "";
    if (query.length >= 2 && window.CustomerGate) {
      CustomerGate.trackEvent("search", { search_query: query, source: "home_page" });
    }
  }, 800);
}

function toggleMobileMenu() {
  const nav = document.getElementById("mobileNav");
  if(nav) nav.classList.toggle("show");
}

function ok(v) {
  return v === 1 || v === true || v === "1" || v === "true" || v === "approved" || v === "active";
}

function normalizeArray(data) {
  if (Array.isArray(data)) return data;
  if (data && Array.isArray(data.data)) return data.data;
  if (data && Array.isArray(data.workers)) return data.workers;
  if (data && Array.isArray(data.sanaieya)) return data.sanaieya;
  if (data && Array.isArray(data.items)) return data.items;
  if (data && Array.isArray(data.trades)) return data.trades;
  return [];
}

function getTradeLabel(item) {
  if (!item) return "";
  return item.name || item.trade || item.craft || item.title || item;
}

function normalizeText(value) {
  return String(value || "")
    .trim()
    .toLowerCase()
    .replace(/[أإآ]/g, "ا")
    .replace(/ة/g, "ه")
    .replace(/ى/g, "ي");
}

function escapeHtml(value) {
  return String(value || "").replace(/[&<>"']/g, function (char) {
    return {
      "&": "&amp;",
      "<": "&lt;",
      ">": "&gt;",
      "\"": "&quot;",
      "'": "&#039;"
    }[char];
  });
}

function setMetaContent(selector, value, attr) {
  const meta = document.querySelector(selector);
  if (!meta) return;
  meta.setAttribute(attr || "content", value || "");
}

function absoluteUrl(path) {
  if (!path) return window.location.origin + "/";
  if (/^https?:\/\//i.test(path)) return path;
  return window.location.origin + (path.startsWith("/") ? path : "/" + path);
}

function buildListingPath(tradeName, areaName) {
  if (tradeName && areaName) {
    return "/trade/" + encodeURIComponent(tradeName) + "/area/" + encodeURIComponent(areaName);
  }
  if (tradeName) {
    return "/trade/" + encodeURIComponent(tradeName);
  }
  if (areaName) {
    return "/area/" + encodeURIComponent(areaName);
  }
  return "/";
}

function updateListingSeo(tradeName, areaName, count) {
  const cleanTrade = String(tradeName || "").trim();
  const cleanArea = String(areaName || "").trim();
  const totalText = Number.isFinite(Number(count)) ? " عدد النتائج المتاحة: " + count + "." : "";
  let title = "صنايعي مطروح | دليل الصنايعية في مرسى مطروح";
  let description = "صنايعي مطروح هو دليل مباشر للوصول إلى أفضل الصنايعية والحرفيين في مرسى مطروح حسب الحرفة والمنطقة مع اتصال وواتساب مباشر.";

  if (cleanTrade && cleanArea) {
    title = cleanTrade + " في " + cleanArea + " | صنايعي مطروح";
  } else if (cleanTrade) {
    title = cleanTrade + " في مطروح | صنايعي مطروح";
  } else if (cleanArea) {
    title = "صنايعية " + cleanArea + " | صنايعي مطروح";
  }

  const path = buildListingPath(cleanTrade, cleanArea);
  const url = absoluteUrl(path);
  const image = absoluteUrl("/icons/icon-512.png");

  document.title = title;
  setMetaContent('meta[name="description"]', description);
  setMetaContent('#canonicalLink', url, "href");
  setMetaContent('#ogTitle', title);
  setMetaContent('#ogDescription', description);
  setMetaContent('#ogUrl', url);
  setMetaContent('#ogImage', image);
}

function getTradeFromUrl() {
  const params = new URLSearchParams(window.location.search);
  const queryTrade = params.get("trade") || params.get("craft") || "";
  if (queryTrade) return decodeURIComponent(queryTrade).trim();
  const parts = window.location.pathname.split("/").filter(Boolean);
  if (parts[0] === "trade" && parts[1]) {
    const areaIndex = parts.indexOf("area");
    const tradeParts = areaIndex > 1 ? parts.slice(1, areaIndex) : [parts[1]];
    return decodeURIComponent(tradeParts.join("/")).trim();
  }
  return "";
}

function getAreaFromUrl() {
  const params = new URLSearchParams(window.location.search);
  const queryArea = params.get("area") || params.get("location") || "";
  if (queryArea) return decodeURIComponent(queryArea).trim();
  const parts = window.location.pathname.split("/").filter(Boolean);
  if (parts[0] === "area" && parts[1]) {
    return decodeURIComponent(parts.slice(1).join("/")).trim();
  }
  return "";
}

function ensureTradeOption(tradeName) {
  const select = document.getElementById("tradeFilter");
  if (!select || !tradeName) return;
  const exists = Array.from(select.options).some(option => normalizeText(option.value) === normalizeText(tradeName));
  if (!exists) {
    const option = document.createElement("option");
    option.value = tradeName;
    option.textContent = tradeName;
    select.appendChild(option);
  }
}

function setTradeFilterValue(tradeName) {
  const select = document.getElementById("tradeFilter");
  if (!select) return;
  if (tradeName) ensureTradeOption(tradeName);
  const normalized = normalizeText(tradeName);
  const matchingOption = Array.from(select.options).find(option => normalizeText(option.value) === normalized);
  select.value = matchingOption ? matchingOption.value : (tradeName || "");
}

function ensureAreaOption(areaName) {
  const select = document.getElementById("areaFilter");
  if (!select || !areaName) return;
  const exists = Array.from(select.options).some(option => normalizeText(option.value) === normalizeText(areaName));
  if (!exists) {
    const option = document.createElement("option");
    option.value = areaName;
    option.textContent = areaName;
    select.appendChild(option);
  }
}

function setAreaFilterValue(areaName) {
  const select = document.getElementById("areaFilter");
  if (!select) return;
  if (areaName) ensureAreaOption(areaName);
  const normalized = normalizeText(areaName);
  const matchingOption = Array.from(select.options).find(option => normalizeText(option.value) === normalized);
  select.value = matchingOption ? matchingOption.value : (areaName || "");
}

function applyFilterFromUrl() {
  const tradeName = getTradeFromUrl();
  const areaName = getAreaFromUrl();
  if (!tradeName && !areaName) return false;
  setTradeFilterValue(tradeName);
  setAreaFilterValue(areaName);
  if (tradeName) expandedTradeKey = normalizeText(tradeName);
  renderTradeGroups();
  return true;
}

function onTradeFilterChanged() { renderTradeGroups(); }
function onAreaFilterChanged() { renderTradeGroups(); }

function tradeIconClass(tradeName) {
  const text = normalizeText(tradeName);
  if (text.includes("سباك")) return "fa-faucet-drip";
  if (text.includes("كهرب")) return "fa-bolt";
  if (text.includes("نجار")) return "fa-hammer";
  if (text.includes("نقاش") || text.includes("دهان")) return "fa-paint-roller";
  if (text.includes("تكييف")) return "fa-wind";
  return "fa-screwdriver-wrench";
}

function getUniqueTradeNames() {
  const seen = new Set(); const names = [];
  allTrades.forEach(item => {
    const name = String(getTradeLabel(item) || "").trim();
    if (name && !seen.has(normalizeText(name))) { seen.add(normalizeText(name)); names.push(name); }
  });
  return names;
}

function countWorkersForTrade(tradeName) {
  const target = normalizeText(tradeName);
  if (!target) return allWorkers.length;
  return allWorkers.filter(w => normalizeText(getWorkerTrade(w)) === target).length;
}

function renderAreaIcons() {
  const grid = document.getElementById("areaIconsGrid"); if (!grid) return;
  const seen = new Set(); const areas = [];
  allAreas.forEach(item => {
    const name = String(item.name || item.area || item.location || "").trim();
    if (name && !seen.has(normalizeText(name))) { seen.add(normalizeText(name)); areas.push(name); }
  });
  grid.innerHTML = "";
  if (!areas.length) { grid.innerHTML = '<div class="area-icons-empty">لا توجد مناطق.</div>'; return; }
  
  const allBtn = document.createElement("button");
  allBtn.type = "button"; allBtn.className = "area-chip";
  allBtn.innerHTML = `<i class="fa-solid fa-map"></i> كل المناطق <small>(${allWorkers.length})</small>`;
  allBtn.addEventListener("click", () => {
    setAreaFilterValue("");
    renderTradeGroups();
    scrollToWorkersSection();
  });
  grid.appendChild(allBtn);

  const areasWithCounts = areas.map(a => ({
    name: a,
    count: allWorkers.filter(w => normalizeText(getWorkerArea(w)) === normalizeText(a)).length
  }));
  areasWithCounts.sort((x, y) => y.count - x.count);

  areasWithCounts.forEach(({ name: a, count }) => {
    const btn = document.createElement("button");
    btn.type = "button"; btn.className = "area-chip";
    btn.innerHTML = `<i class="fa-solid fa-location-dot"></i> ${escapeHtml(a)} <small>(${count})</small>`;
    btn.addEventListener("click", () => {
      setAreaFilterValue(a);
      renderTradeGroups();
      scrollToWorkersSection();
    });
    grid.appendChild(btn);
  });
}

function scrollToWorkersSection() {
  const workersSection = document.getElementById("workers");
  if (workersSection) workersSection.scrollIntoView({ behavior: "smooth", block: "start" });
}

function renderTopDemandWorkers() {
  const grid = document.getElementById("topDemandWorkersGrid");
  if (!grid) return;
  const ranked = allWorkers
    .map(worker => ({ worker, score: getWorkerDemandScore(worker) }))
    .filter(entry => entry.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, 4);

  grid.innerHTML = "";
  if (!ranked.length) {
    grid.innerHTML = '<div class="demand-empty">لا توجد بيانات طلب كافية حتى الآن.</div>';
    return;
  }

  ranked.forEach((entry, index) => {
    const worker = entry.worker;
    const id = getWorkerId(worker);
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "demand-chip";
    btn.innerHTML = `
      <span class="demand-chip-rank">${index + 1}</span>
      <span class="demand-chip-name">${escapeHtml(getWorkerName(worker))}</span>
      <span class="demand-chip-score"><i class="fa-solid fa-fire"></i> ${entry.score}</span>
    `;
    btn.addEventListener("click", () => {
      if (!id) return;
      withCustomerGate((gate) => gate.ensureIdentified(() => { location.href = "/worker/" + id; }));
    });
    grid.appendChild(btn);
  });
}

function renderTopDemandTrades() {
  const grid = document.getElementById("topDemandTradesGrid");
  if (!grid) return;
  const ranked = getUniqueTradeNames()
    .map(trade => ({
      trade,
      score: allWorkers
        .filter(w => normalizeText(getWorkerTrade(w)) === normalizeText(trade))
        .reduce((sum, w) => sum + getWorkerDemandScore(w), 0),
      count: countWorkersForTrade(trade)
    }))
    .filter(entry => entry.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, 4);

  grid.innerHTML = "";
  if (!ranked.length) {
    grid.innerHTML = '<div class="demand-empty">لا توجد بيانات طلب كافية حتى الآن.</div>';
    return;
  }

  ranked.forEach((entry, index) => {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "demand-chip";
    btn.innerHTML = `
      <span class="demand-chip-rank">${index + 1}</span>
      <span class="demand-chip-name">${escapeHtml(entry.trade)}</span>
      <span class="demand-chip-score"><i class="fa-solid fa-fire"></i> ${entry.score}</span>
    `;
    btn.addEventListener("click", () => {
      setTradeFilterValue(entry.trade);
      expandedTradeKey = normalizeText(entry.trade);
      renderTradeGroups();
      scrollToWorkersSection();
    });
    grid.appendChild(btn);
  });
}

async function loadTrades(data) {
  data = data || await fetchJson("/api/trades");
  allTrades = normalizeArray(data);
  const select = document.getElementById("tradeFilter");
  if(select) {
    select.innerHTML = '<option value="">كل الحرف</option>';
    allTrades.forEach(i => {
      const name = getTradeLabel(i);
      if (name) select.innerHTML += `<option value="${escapeHtml(name)}">${escapeHtml(name)}</option>`;
    });
  }
  const tCount = document.getElementById("tradesCount");
  if(tCount) tCount.textContent = allTrades.length;
}

async function loadAreas(data) {
  data = data || await fetchJson("/api/areas");
  allAreas = normalizeArray(data);
  const select = document.getElementById("areaFilter");
  if(select) {
    select.innerHTML = '<option value="">كل المناطق</option>';
    allAreas.forEach(i => {
      const name = i.name || i.area || i.location || i;
      if (name) select.innerHTML += `<option value="${escapeHtml(name)}">${escapeHtml(name)}</option>`;
    });
  }
  renderAreaIcons();
}

async function loadWorkers(data) {
  const loadingBox = document.getElementById("loadingBox");
  const emptyBox = document.getElementById("emptyBox");
  if(loadingBox) loadingBox.style.display = "flex";
  if(emptyBox) emptyBox.style.display = "none";

  data = data || await fetchJson("/api/workers?limit=1200");
  const workers = normalizeArray(data);

  allWorkers = workers.filter(worker => {
    const approved = worker.approved ?? worker.is_approved ?? 1;
    const active = worker.active ?? worker.is_active ?? 1;
    return ok(approved) && ok(active) && isSubscriptionOk(worker);
  });

  loadRatingsForWorkers();
  if(loadingBox) loadingBox.style.display = "none";
  renderTradeGroups();
  updateStats();
  renderAreaIcons();
  renderTopDemandTrades();
  renderTopDemandWorkers();
}

async function loadRatingsForWorkers() {
  ratingsByWorker = {};
  allWorkers.forEach(worker => {
    const id = getWorkerId(worker);
    if (!id) return;
    const signals = worker.smart_score_signals || worker.smartScoreSignals || {};
    ratingsByWorker[id] = {
      average: Number(signals.rating_average || worker.rating_average || 0) || 0,
      count: Number(signals.review_count || worker.review_count || 0) || 0
    };
  });
}

function getRatingSummary(workerId) {
  return ratingsByWorker[workerId] || { average: 0, count: 0 };
}

function getWorkerDemandScore(worker) {
  const s = worker.smart_score_signals || worker.smartScoreSignals || worker.analytics || {};
  return Math.max(0, Math.round(Number(s.call || 0) + Number(s.whatsapp || 0)));
}

function renderDemandBadge(worker) {
  return getWorkerDemandScore(worker) > 0 ? '<div class="demand-card-badge"><i class="fa-solid fa-fire"></i> الأكثر طلبًا</div>' : '';
}

function renderSmartBadge(worker) {
  const score = Number(worker.smart_score || 0);
  if (!score) return "";
  return `<div class="smart-score-badge"><i class="fa-solid fa-ranking-star"></i> ترتيب ذكي</div>`;
}

function renderRatingBadge(workerId) {
  const summary = getRatingSummary(workerId);
  if (!summary.count) return '<div class="card-rating no-rating"><i class="fa-regular fa-star"></i> لا توجد تقييمات</div>';
  return `<div class="card-rating"><i class="fa-solid fa-star"></i> ${summary.average} من 5 <span>(${summary.count})</span></div>`;
}

function sortWorkers(workers) {
  const sortValue = document.getElementById("sortFilter")?.value || "default";
  const sorted = [...workers];
  if (sortValue === "featured") {
    sorted.sort((a, b) => (isFeatured(b) ? 1 : 0) - (isFeatured(a) ? 1 : 0));
  } else if (sortValue === "rating") {
    sorted.sort((a, b) => getRatingSummary(getWorkerId(b)).average - getRatingSummary(getWorkerId(a)).average);
  } else if (sortValue === "demand") {
    sorted.sort((a, b) => getWorkerDemandScore(b) - getWorkerDemandScore(a));
  } else {
    sorted.sort((a, b) => (isFeatured(b) ? 1 : 0) - (isFeatured(a) ? 1 : 0));
  }
  return sorted;
}

function updateStats() {
  const wCount = document.getElementById("workersCount");
  if(wCount) wCount.textContent = allWorkers.length;
}

function isSubscriptionOk(worker) {
  const end = worker.subscription_end || worker.end_date || "";
  if (!end) return true;
  return new Date(end) >= new Date();
}

function getWorkerImage(worker) {
  const image = worker.image || worker.photo || worker.image_url || "";
  if (!image) return "/icons/default-worker-avatar.png";
  if (image.startsWith("http") || image.startsWith("/")) return image;
  return "/uploads/" + image;
}

function getWorkerName(worker) { return worker.name || worker.full_name || "صنايعي"; }
function getWorkerTrade(worker) { return worker.trade || worker.craft || "حرفة غير محددة"; }
function getWorkerArea(worker) { return worker.area || worker.location || "منطقة غير محددة"; }
function getWorkerDescription(worker) { return worker.description || worker.about || "لا يوجد وصف متاح."; }
function getWorkerPhone(worker) { return worker.phone || ""; }
function getWorkerWhatsapp(worker) { return worker.whatsapp || getWorkerPhone(worker); }
function getWorkerId(worker) { return worker.id || worker._id; }
function isFeatured(worker) { return ok(worker.featured || worker.special); }
function isVerified(worker) { return ok(worker.identity_verified || worker.verified); }

function createWorkerCardElement(worker) {
  const name = getWorkerName(worker);
  const area = getWorkerArea(worker);
  const desc = getWorkerDescription(worker);
  const phone = getWorkerPhone(worker);
  const wa = getWorkerWhatsapp(worker);
  const id = getWorkerId(worker);
  const image = getWorkerImage(worker);
  const featured = isFeatured(worker);
  const verified = isVerified(worker);

  const callNum = phone.replace(/[^\d]/g, "");
  const waNum = wa.replace(/[^\d]/g, "");

  const card = document.createElement("article");
  card.className = "worker-card" + (featured ? " featured-card" : "") + (verified ? " verified-card" : "");
  card.style.cursor = "pointer";
  // فتح بروفايل الصنايعي الكامل محتاج تسجيل عميل الأول (اسم + رقم) - الكارت
  // نفسه (اسم/صورة/منطقة/تقييم) يفضل ظاهر لأي زائر بدون حساب
  card.addEventListener("click", () => {
    if (!id) return;
    withCustomerGate((gate) => gate.ensureIdentified(() => { location.href = "/worker/" + id; }));
  });

  card.innerHTML = `
    <div class="worker-image-wrap">
      <img loading="lazy" src="${escapeHtml(image)}" alt="${escapeHtml(name)}" onerror="this.onerror=null;this.src='/icons/default-worker-avatar.png'">
      ${featured ? '<div class="featured-badge"><i class="fa-solid fa-star"></i> مميز</div>' : ''}
      ${verified ? '<div class="verified-badge"><i class="fa-solid fa-shield-halved"></i> موثّق</div>' : ''}
    </div>
    <div class="worker-content">
      <h3>${escapeHtml(name)}</h3>
      ${verified ? '<div class="worker-trust-line"><i class="fa-solid fa-shield-halved"></i> موثّق من الإدارة</div>' : ''}
      ${renderSmartBadge(worker)}
      ${renderDemandBadge(worker)}
      ${renderRatingBadge(id)}
      <div class="worker-meta">
        <span><i class="fa-solid fa-location-dot"></i> ${escapeHtml(area)}</span>
      </div>
      <p class="worker-desc">${escapeHtml(desc)}</p>
      <div class="worker-actions">
        <a href="#" class="call-btn ${!callNum ? 'disabled' : ''}" data-gate-action="call"><i class="fa-solid fa-phone"></i> اتصال</a>
        <a href="#" class="whatsapp-btn ${!waNum ? 'disabled' : ''}" data-gate-action="whatsapp"><i class="fa-brands fa-whatsapp"></i> واتساب</a>
      </div>
    </div>
  `;

  // الاتصال وواتساب من الكارت محتاجين نفس بوابة التسجيل البسيطة اللي في
  // صفحة بروفايل الصنايعي - منعمل الفعل الحقيقي إلا بعد التسجيل
  const callLink = card.querySelector('[data-gate-action="call"]');
  const waLink = card.querySelector('[data-gate-action="whatsapp"]');
  function gatedCardAction(e, hasNumber, eventType, url, external) {
    e.preventDefault();
    e.stopPropagation();
    if (!hasNumber) return;
    withCustomerGate((gate) => {
      gate.ensureIdentified(function () {
        gate.trackEvent(eventType, { worker_id: String(id), source: "home_card" });
        if (external) window.open(url, "_blank");
        else window.location.href = url;
      });
    });
  }
  if (callLink) callLink.addEventListener("click", (e) => gatedCardAction(e, !!callNum, "call_click", "tel:" + callNum, false));
  if (waLink) waLink.addEventListener("click", (e) => gatedCardAction(e, !!waNum, "whatsapp_click", "https://wa.me/2" + waNum, true));

  return card;
}

function createTradeGroupElement(trade, workers, isExpanded) {
  const wrapper = document.createElement("div");
  wrapper.className = "trade-group" + (isExpanded ? " expanded" : "");

  const header = document.createElement("button");
  header.type = "button";
  header.className = "trade-group-header";
  header.innerHTML = `
    <span class="trade-group-icon"><i class="fa-solid ${tradeIconClass(trade)}"></i></span>
    <span class="trade-group-title">
      <strong>${escapeHtml(trade)}</strong>
      <small>${workers.length} صنايعي</small>
    </span>
    <i class="fa-solid fa-chevron-down trade-group-chevron"></i>
  `;
  header.addEventListener("click", () => {
    const key = normalizeText(trade);
    const opening = expandedTradeKey !== key;
    expandedTradeKey = opening ? key : "";
    renderTradeGroups();
    if (expandedTradeKey) wrapper.scrollIntoView({ behavior: "smooth", block: "start" });
    if (opening && window.CustomerGate) CustomerGate.trackEvent("category_view", { category_id: trade, source: "home_page" });
  });
  wrapper.appendChild(header);

  if (isExpanded) {
    const body = document.createElement("div");
    body.className = "trade-group-body";
    const grid = document.createElement("div");
    grid.className = "workers-grid";
    sortWorkers(workers).forEach(worker => grid.appendChild(createWorkerCardElement(worker)));
    body.appendChild(grid);
    wrapper.appendChild(body);
  }

  return wrapper;
}

function getFilteredWorkers() {
  const search = document.getElementById("searchInput")?.value.trim().toLowerCase() || "";
  const area = normalizeText(document.getElementById("areaFilter")?.value || "");
  const featuredOnly = document.getElementById("featuredOnlyFilter")?.checked || false;
  const verifiedOnly = document.getElementById("verifiedOnlyFilter")?.checked || false;

  return allWorkers.filter(w => {
    const matchSearch = getWorkerName(w).toLowerCase().includes(search) || getWorkerTrade(w).toLowerCase().includes(search) || getWorkerArea(w).toLowerCase().includes(search);
    const matchArea = !area || normalizeText(getWorkerArea(w)) === area;
    const matchFeatured = !featuredOnly || isFeatured(w);
    const matchVerified = !verifiedOnly || isVerified(w);
    return matchSearch && matchArea && matchFeatured && matchVerified;
  });
}

function renderTradeGroups() {
  const container = document.getElementById("tradeGroupsContainer");
  const emptyBox = document.getElementById("emptyBox");
  if (!container) return;

  const search = document.getElementById("searchInput")?.value.trim() || "";
  const tradeFilterValue = document.getElementById("tradeFilter")?.value || "";
  const hasActiveFilter = !!(search || tradeFilterValue || document.getElementById("areaFilter")?.value || document.getElementById("featuredOnlyFilter")?.checked || document.getElementById("verifiedOnlyFilter")?.checked);

  const groupsByKey = {};
  getFilteredWorkers().forEach(worker => {
    const trade = getWorkerTrade(worker);
    const key = normalizeText(trade);
    if (!key) return;
    if (!groupsByKey[key]) groupsByKey[key] = { trade, workers: [] };
    groupsByKey[key].workers.push(worker);
  });

  let groups = Object.values(groupsByKey);
  if (tradeFilterValue) {
    const targetKey = normalizeText(tradeFilterValue);
    groups = groups.filter(g => normalizeText(g.trade) === targetKey);
  }
  groups.sort((a, b) => b.workers.length - a.workers.length);

  container.innerHTML = "";

  if (!groups.length) {
    if (emptyBox) emptyBox.style.display = "block";
    return;
  }
  if (emptyBox) emptyBox.style.display = "none";

  groups.forEach(group => {
    const key = normalizeText(group.trade);
    const isExpanded = hasActiveFilter || key === expandedTradeKey;
    container.appendChild(createTradeGroupElement(group.trade, group.workers, isExpanded));
  });
}

function clearFilters() {
  if(document.getElementById("searchInput")) document.getElementById("searchInput").value = "";
  if(document.getElementById("tradeFilter")) document.getElementById("tradeFilter").value = "";
  if(document.getElementById("areaFilter")) document.getElementById("areaFilter").value = "";
  if(document.getElementById("sortFilter")) document.getElementById("sortFilter").value = "default";
  if(document.getElementById("featuredOnlyFilter")) document.getElementById("featuredOnlyFilter").checked = false;
  if(document.getElementById("verifiedOnlyFilter")) document.getElementById("verifiedOnlyFilter").checked = false;
  expandedTradeKey = "";
  renderTradeGroups();
}

function setFooterYear() {
  const el = document.getElementById("footerYear");
  if (el) el.textContent = new Date().getFullYear();
}

async function initPage() {
  setFooterYear();
  // هذه البيانات مستقلة؛ تحميلها بالتوازي يوفر جولتي انتظار شبكي على الصفحة الرئيسية.
  const [tradesData, areasData, workersData] = await Promise.all([
    fetchJson("/api/trades"),
    fetchJson("/api/areas"),
    fetchJson("/api/workers?limit=1200")
  ]);
  await loadTrades(tradesData);
  await loadAreas(areasData);
  await loadWorkers(workersData);
  applyFilterFromUrl();
}

initPage();
