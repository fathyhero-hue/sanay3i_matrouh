let allWorkers = [];
let allTrades = [];
let allAreas = [];
let ratingsByWorker = {};
let currentWorkersForRender = [];
let visibleWorkersLimit = 24;
const WORKERS_PAGE_SIZE = 24;

function toggleMobileMenu() {
  const nav = document.getElementById("mobileNav");
  if(nav) nav.classList.toggle("show");
}

function ok(v) {
  return v === 1 || v === true || v === "1" || v === "true" || v === "approved" || v === "active";
}

async function fetchJsonWithFallback(urls) {
  for (const url of urls) {
    try {
      const response = await fetch(url);
      if (response.ok) {
        return await response.json();
      }
    } catch (error) {}
  }
  return [];
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

// ---------------------------------------------------------
// FIX: ensure options exist and select them correctly
// ---------------------------------------------------------
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
// ---------------------------------------------------------

function applyFilterFromUrl() {
  const tradeName = getTradeFromUrl();
  const areaName = getAreaFromUrl();
  if (!tradeName && !areaName) return false;
  setTradeFilterValue(tradeName);
  setAreaFilterValue(areaName);
  filterWorkers();
  return true;
}

function onTradeFilterChanged() { filterWorkers(); }
function onAreaFilterChanged() { filterWorkers(); }

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

function createTradeIconCard(tradeName, count, isAll) {
  const button = document.createElement("button");
  button.type = "button"; button.className = "trade-icon-card";
  button.dataset.trade = tradeName || "";
  const icon = isAll ? "fa-layer-group" : tradeIconClass(tradeName);
  const label = isAll ? "كل الحرف" : tradeName;
  button.innerHTML = `<span class="trade-icon-bubble"><i class="fa-solid ${icon}"></i></span><strong>${escapeHtml(label)}</strong><small>${count} صنايعي</small>`;
  
  // FIX: Make sure clicking icon scrolls to workers
  button.addEventListener("click", () => { 
    setTradeFilterValue(tradeName); 
    filterWorkers(); 
    const workersSection = document.getElementById("workers");
    if (workersSection) workersSection.scrollIntoView({ behavior: "smooth", block: "start" });
  });
  
  return button;
}

function renderTradeIcons() {
  const grid = document.getElementById("tradeIconsGrid"); if (!grid) return;
  const trades = getUniqueTradeNames(); grid.innerHTML = "";
  if (!trades.length) { grid.innerHTML = '<div class="trade-icons-empty">لا توجد حرف.</div>'; return; }
  grid.appendChild(createTradeIconCard("", allWorkers.length, true));
  trades.forEach(t => grid.appendChild(createTradeIconCard(t, countWorkersForTrade(t), false)));
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
  allBtn.type = "button"; allBtn.className = "area-icon-card";
  allBtn.innerHTML = `<span class="area-icon-bubble"><i class="fa-solid fa-map"></i></span><strong>كل المناطق</strong><small>${allWorkers.length} صنايعي</small>`;
  allBtn.onclick = () => { 
      setAreaFilterValue(""); 
      filterWorkers(); 
      const workersSection = document.getElementById("workers");
      if (workersSection) workersSection.scrollIntoView({ behavior: "smooth", block: "start" });
  };
  grid.appendChild(allBtn);

  areas.forEach(a => {
    const count = allWorkers.filter(w => normalizeText(getWorkerArea(w)) === normalizeText(a)).length;
    const btn = document.createElement("button");
    btn.type = "button"; btn.className = "area-icon-card";
    btn.innerHTML = `<span class="area-icon-bubble"><i class="fa-solid fa-location-dot"></i></span><strong>${escapeHtml(a)}</strong><small>${count} صنايعي</small>`;
    btn.onclick = () => { 
        setAreaFilterValue(a); 
        filterWorkers(); 
        const workersSection = document.getElementById("workers");
        if (workersSection) workersSection.scrollIntoView({ behavior: "smooth", block: "start" });
    };
    grid.appendChild(btn);
  });
}

async function loadTrades() {
  const data = await fetchJsonWithFallback(["/api/trades", "/api/crafts", "/trades", "/crafts"]);
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
  renderTradeIcons();
}

async function loadAreas() {
  const data = await fetchJsonWithFallback(["/api/areas", "/api/locations", "/areas", "/locations"]);
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

async function loadWorkers() {
  const loadingBox = document.getElementById("loadingBox");
  const emptyBox = document.getElementById("emptyBox");
  if(loadingBox) loadingBox.style.display = "flex";
  if(emptyBox) emptyBox.style.display = "none";

  const data = await fetchJsonWithFallback(["/api/workers?limit=1200", "/api/sanaieya", "/workers"]);
  const workers = normalizeArray(data);

  allWorkers = workers.filter(worker => {
    const approved = worker.approved ?? worker.is_approved ?? 1;
    const active = worker.active ?? worker.is_active ?? 1;
    return ok(approved) && ok(active) && isSubscriptionOk(worker);
  });

  await loadRatingsForWorkers();
  if(loadingBox) loadingBox.style.display = "none";
  filterWorkers();
  updateStats();
  renderTradeIcons();
  renderAreaIcons();
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

function renderWorkers(workers) {
  const grid = document.getElementById("workersGrid");
  const emptyBox = document.getElementById("emptyBox");
  if(!grid) return;
  currentWorkersForRender = Array.isArray(workers) ? workers : [];
  grid.innerHTML = "";

  if (!currentWorkersForRender.length) {
    if(emptyBox) emptyBox.style.display = "block";
    return;
  }
  if(emptyBox) emptyBox.style.display = "none";

  const fragment = document.createDocumentFragment();
  currentWorkersForRender.slice(0, visibleWorkersLimit).forEach(worker => {
    const name = getWorkerName(worker);
    const trade = getWorkerTrade(worker);
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
    card.onclick = () => { if(id) location.href = "/worker/" + id; };

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
          <span><i class="fa-solid fa-screwdriver-wrench"></i> ${escapeHtml(trade)}</span>
          <span><i class="fa-solid fa-location-dot"></i> ${escapeHtml(area)}</span>
        </div>
        <p class="worker-desc">${escapeHtml(desc)}</p>
        <div class="worker-actions">
          <a href="tel:${callNum}" onclick="event.stopPropagation()" class="call-btn ${!callNum ? 'disabled' : ''}"><i class="fa-solid fa-phone"></i> اتصال</a>
          <a href="https://wa.me/2${waNum}" target="_blank" onclick="event.stopPropagation()" class="whatsapp-btn ${!waNum ? 'disabled' : ''}"><i class="fa-brands fa-whatsapp"></i> واتساب</a>
        </div>
      </div>
    `;
    fragment.appendChild(card);
  });
  grid.appendChild(fragment);
}

// ---------------------------------------------------------
// FIX: ensure quick trade button scrolls to workers section
// ---------------------------------------------------------
function setQuickTrade(tradeName, btn) {
  setTradeFilterValue(tradeName);
  document.querySelectorAll(".quick-trade-btn").forEach(b => b.classList.remove("active"));
  if(btn) btn.classList.add("active");
  filterWorkers();
  const workersSection = document.getElementById("workers");
  if (workersSection) {
    workersSection.scrollIntoView({ behavior: "smooth", block: "start" });
  }
}

function filterWorkers() {
  const search = document.getElementById("searchInput")?.value.trim().toLowerCase() || "";
  const trade = normalizeText(document.getElementById("tradeFilter")?.value || "");
  const area = normalizeText(document.getElementById("areaFilter")?.value || "");
  const featuredOnly = document.getElementById("featuredOnlyFilter")?.checked || false;
  const verifiedOnly = document.getElementById("verifiedOnlyFilter")?.checked || false;

  const filtered = allWorkers.filter(w => {
    const matchSearch = getWorkerName(w).toLowerCase().includes(search) || getWorkerTrade(w).toLowerCase().includes(search) || getWorkerArea(w).toLowerCase().includes(search);
    const matchTrade = !trade || normalizeText(getWorkerTrade(w)) === trade;
    const matchArea = !area || normalizeText(getWorkerArea(w)) === area;
    const matchFeatured = !featuredOnly || isFeatured(w);
    const matchVerified = !verifiedOnly || isVerified(w);
    return matchSearch && matchTrade && matchArea && matchFeatured && matchVerified;
  });

  renderWorkers(sortWorkers(filtered));
}

function clearFilters() {
  if(document.getElementById("searchInput")) document.getElementById("searchInput").value = "";
  if(document.getElementById("tradeFilter")) document.getElementById("tradeFilter").value = "";
  if(document.getElementById("areaFilter")) document.getElementById("areaFilter").value = "";
  if(document.getElementById("sortFilter")) document.getElementById("sortFilter").value = "default";
  if(document.getElementById("featuredOnlyFilter")) document.getElementById("featuredOnlyFilter").checked = false;
  if(document.getElementById("verifiedOnlyFilter")) document.getElementById("verifiedOnlyFilter").checked = false;
  filterWorkers();
}

async function initPage() {
  await loadTrades();
  await loadAreas();
  await loadWorkers();
  applyFilterFromUrl();
}

initPage();
