let allWorkers = [];
let allTrades = [];
let allAreas = [];
let ratingsByWorker = {};
let expandedTradeKey = "";
let renderDebounceTimer = null;
let favoriteWorkerIds = new Set();

// ===============================
// Hero Slider - بيانات من قاعدة البيانات عبر /api/hero-slides (لوحة الإدارة:
// تبويب "محتوى الرئيسية"). كان قبل كده HERO_CAMPAIGNS ثابت في الملف ده بمنطق
// "months" موسمي؛ استُبدل بالكامل بجدولة start_at/end_at حقيقية على مستوى
// الـBackend - آلية واحدة فقط، مفيش تعارض بين نظامين جدولة قديم/جديد.
// ===============================
async function fetchHeroSlides() {
  try {
    const res = await fetch("/api/hero-slides");
    if (!res.ok) return [];
    const data = await res.json().catch(() => []);
    return Array.isArray(data) ? data : [];
  } catch (e) {
    return [];
  }
}

function renderHeroSlides(track, slides) {
  if (!track) return;
  track.innerHTML = slides.map(c => `
    <div class="hero-slide" style="background-image:url('${escapeHtml(c.image)}')">
      <div class="hero-slide-overlay"></div>
      <div class="hero-slide-content">
        <h2>${escapeHtml(c.title)}</h2>
        ${c.description ? `<p>${escapeHtml(c.description)}</p>` : ""}
        ${c.button_text ? `
        <button type="button" class="hero-slide-cta" data-cta-target="${escapeHtml(c.button_link || "")}">
          ${escapeHtml(c.button_text)} <i class="fa-solid fa-arrow-left"></i>
        </button>` : ""}
      </div>
    </div>
  `).join("");
}

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

// نظام المفضلة (بند 15) - بنجيب معرّفات المفضلة بس لو العميل مسجّل دخول
// بالفعل (توكن موجود)؛ مفيش أي إجبار لتسجيل الدخول لمجرد تحميل الرئيسية
async function loadFavoriteIds() {
  const token = localStorage.getItem("sanay3i_customer_token");
  if (!token) return;
  try {
    const r = await fetch("/api/favorites", { headers: { Authorization: "Bearer " + token } });
    const d = await r.json().catch(() => ({}));
    if (r.ok && d.success) favoriteWorkerIds = new Set((d.worker_ids || []).map(String));
  } catch (e) {}
}

// إضافة/حذف فورية - غير المسجل بيستخدم نفس تدفق تسجيل العميل الحالي
// (CustomerGate) قبل ما ينفّذ الفعل الحقيقي
function toggleFavorite(workerId, btnEl) {
  withCustomerGate((gate) => {
    gate.ensureIdentified(async () => {
      const token = localStorage.getItem("sanay3i_customer_token");
      if (!token) return;
      const isFav = favoriteWorkerIds.has(String(workerId));
      try {
        const r = await fetch("/api/favorites" + (isFav ? "/" + workerId : ""), {
          method: isFav ? "DELETE" : "POST",
          headers: Object.assign({ Authorization: "Bearer " + token }, isFav ? {} : { "Content-Type": "application/json" }),
          body: isFav ? undefined : JSON.stringify({ worker_id: workerId })
        });
        const d = await r.json().catch(() => ({}));
        if (!r.ok || !d.success) return;
        if (isFav) favoriteWorkerIds.delete(String(workerId));
        else favoriteWorkerIds.add(String(workerId));
        if (btnEl) {
          btnEl.classList.toggle("svc-fav-active", !isFav);
          btnEl.classList.remove("fav-pop");
          void btnEl.offsetWidth;
          btnEl.classList.add("fav-pop");
        }
      } catch (e) {}
    });
  });
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

// عنصر التوست (#copyToast) موجود بالفعل في index.html - بنعيد استخدامه هنا
// بدل ما نخترع آلية toast جديدة
function showToast(message) {
  const toast = document.getElementById("copyToast");
  if (!toast) return;
  toast.innerHTML = `<i class="fa-solid fa-circle-check"></i> ${message}`;
  toast.classList.add("show");
  setTimeout(() => toast.classList.remove("show"), 2200);
}

// موقع/جرس إشعارات/Avatar في الهيدر - بيانات حقيقية متاحة فقط (اسم العميل من
// نفس localStorage المستخدم في باقي الموقع). مفيش نظام إشعارات فعلي للعملاء
// حاليًا في المشروع، فالجرس عنصر بصري بس بيوضح إن مفيش إشعارات بدل ما يدّعي
// وجود نظام مش موجود فعليًا
function initHeaderUtility() {
  const avatarInitial = document.getElementById("avatarInitial");
  const customerName = (localStorage.getItem("sanay3i_customer_name") || "").trim();
  const hasSession = !!(localStorage.getItem("sanay3i_customer_token") || localStorage.getItem("sanay3i_worker_token"));
  if (avatarInitial && hasSession && customerName) {
    avatarInitial.textContent = customerName.charAt(0);
  }

}

// Hero Slider بصور مطروح الحقيقية - JS خفيف بدون مكتبة (نفس أسلوب باقي
// السلايدرات في المشروع): Autoplay هادئ + Pagination + أسهم Prev/Next + سحب
// طبيعي بالموبايل عبر scroll-snap + إيقاف مؤقت عند أي تفاعل يدوي أو Hover
// على الديسكتوب. إضافة شريحة جديدة لاحقًا = إضافة عنصر .hero-slide واحد فقط
// في index.html، الكود هنا بيتعامل تلقائيًا مع أي عدد شرائح.
async function initHeroSlider() {
  const section = document.querySelector(".hero-slider-section");
  const slider = document.getElementById("heroSlider");
  const track = document.getElementById("heroSlideTrack");
  const dotsBox = document.getElementById("heroSliderDots");
  const prevBtn = document.getElementById("heroSliderPrev");
  const nextBtn = document.getElementById("heroSliderNext");
  if (!slider || !track || !dotsBox) return;

  const heroSlides = await fetchHeroSlides();
  // مفيش شرائح فعالة الآن (أو فشل الجلب) -> نخفي القسم بالكامل بدل ما نعرض
  // سلايدر فاضي أو نكسر الصفحة
  if (!heroSlides.length) {
    if (section) section.style.display = "none";
    return;
  }
  if (section) section.style.display = "";

  renderHeroSlides(track, heroSlides);
  const slides = Array.from(track.children);
  if (!slides.length) {
    if (section) section.style.display = "none";
    return;
  }

  dotsBox.innerHTML = "";
  const dots = slides.map((_, i) => {
    const dot = document.createElement("button");
    dot.type = "button";
    dot.className = "hero-slider-dot" + (i === 0 ? " active" : "");
    dot.setAttribute("aria-label", "الشريحة " + (i + 1));
    dot.addEventListener("click", () => goToSlide(i, true));
    dotsBox.appendChild(dot);
    return dot;
  });

  slides.forEach(slide => {
    const cta = slide.querySelector("[data-cta-target]");
    if (cta) {
      cta.addEventListener("click", () => {
        const dest = cta.getAttribute("data-cta-target") || "";
        if (!dest) return;
        if (dest.startsWith("#")) {
          const target = document.querySelector(dest);
          if (target) target.scrollIntoView({ behavior: "smooth", block: "start" });
        } else {
          window.location.href = dest;
        }
      });
    }
  });

  wireSimpleSlider({ slider, track, dotsBox, dots, slides, prevBtn, nextBtn });
}

// آلية Carousel عامة (Autoplay هادئ + Pagination + أسهم Prev/Next + سحب طبيعي
// بالموبايل عبر scroll-snap + إيقاف مؤقت عند أي تفاعل يدوي/Hover) - نفس
// المنطق اللي كان جوه initHeroSlider بالظبط، استُخرج هنا عشان سلايدر
// الإحصائيات الجديد يعيد استخدامه من غير ما يتكرر الكود
function wireSimpleSlider({ slider, track, dotsBox, dots, slides, prevBtn, nextBtn }) {
  let current = 0;
  let pausedUntil = 0;
  const isRtl = getComputedStyle(document.documentElement).direction === "rtl";
  const dir = isRtl ? -1 : 1;

  function goToSlide(index, userInitiated) {
    current = (index + slides.length) % slides.length;
    track.scrollTo({ left: track.offsetWidth * current * dir, behavior: "smooth" });
    dots.forEach((d, i) => d.classList.toggle("active", i === current));
    if (userInitiated) pausedUntil = Date.now() + 6000;
  }

  function autoplayStep() {
    if (Date.now() < pausedUntil) return;
    goToSlide(current + 1, false);
  }

  window.setInterval(autoplayStep, 5000);

  if (prevBtn) prevBtn.addEventListener("click", () => goToSlide(current - 1, true));
  if (nextBtn) nextBtn.addEventListener("click", () => goToSlide(current + 1, true));

  function pauseAwhile() { pausedUntil = Date.now() + 6000; }
  track.addEventListener("touchstart", pauseAwhile, { passive: true });
  track.addEventListener("mousedown", pauseAwhile);
  track.addEventListener("wheel", pauseAwhile, { passive: true });
  slider.addEventListener("mouseenter", () => { pausedUntil = Date.now() + 100000; });
  slider.addEventListener("mouseleave", () => { pausedUntil = 0; });

  // Sync الـ Pagination لما المستخدم يسحب بإيده (scroll-snap) من غير ما يضغط
  // على الأسهم/الـ Dots
  let scrollSyncTimer = null;
  track.addEventListener("scroll", () => {
    window.clearTimeout(scrollSyncTimer);
    scrollSyncTimer = window.setTimeout(() => {
      const width = track.offsetWidth || 1;
      const index = Math.round(Math.abs(track.scrollLeft) / width);
      current = Math.max(0, Math.min(slides.length - 1, index));
      dots.forEach((d, i) => d.classList.toggle("active", i === current));
    }, 120);
  }, { passive: true });
}

// ===============================
// Stats Slider - بديل بطاقتي "صنايعي متاح"/"حرفة مختلفة" الثابتتين، بيانات من
// /api/stats-slider (مقاييس محسوبة لحظيًا من قاعدة البيانات + عناصر مخصصة من
// الإدارة). نفس آلية الـCarousel المستخدمة في الـHero Slider (wireSimpleSlider)
// ===============================
async function fetchStatsSlider() {
  try {
    const res = await fetch("/api/stats-slider");
    if (!res.ok) return [];
    const data = await res.json().catch(() => []);
    return Array.isArray(data) ? data : [];
  } catch (e) {
    return [];
  }
}

function renderStatsSlides(track, items) {
  if (!track) return;
  track.innerHTML = items.map(item => `
    <div class="stats-slide">
      <div class="stat-box stat-theme-${escapeHtml(item.color_theme || "blue")}">
        <div class="stat-icon"><i class="fa-solid ${escapeHtml(item.icon || "fa-chart-simple")}"></i></div>
        <div>
          <h3>${escapeHtml(item.value != null ? item.value : "0")}</h3>
          <p>${escapeHtml(item.title || "")}</p>
          ${item.subtitle ? `<span class="stat-subtitle">${escapeHtml(item.subtitle)}</span>` : ""}
        </div>
      </div>
    </div>
  `).join("");
}

async function initStatsSlider() {
  const section = document.querySelector(".stats-section");
  const slider = document.getElementById("statsSlider");
  const track = document.getElementById("statsSlideTrack");
  const dotsBox = document.getElementById("statsSliderDots");
  if (!slider || !track || !dotsBox) return;

  const items = await fetchStatsSlider();
  if (!items.length) {
    if (section) section.style.display = "none";
    return;
  }
  if (section) section.style.display = "";

  renderStatsSlides(track, items);
  const slides = Array.from(track.children);
  if (!slides.length) {
    if (section) section.style.display = "none";
    return;
  }

  dotsBox.innerHTML = "";
  const dots = slides.map((_, i) => {
    const dot = document.createElement("button");
    dot.type = "button";
    dot.className = "hero-slider-dot" + (i === 0 ? " active" : "");
    dot.setAttribute("aria-label", "الشريحة " + (i + 1));
    dotsBox.appendChild(dot);
    return dot;
  });
  dots.forEach((dot, i) => dot.addEventListener("click", () => {
    track.scrollTo({ left: track.offsetWidth * i, behavior: "smooth" });
    dots.forEach((d, idx) => d.classList.toggle("active", idx === i));
  }));

  wireSimpleSlider({ slider, track, dotsBox, dots, slides, prevBtn: null, nextBtn: null });
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

function buildSkeletonCard() {
  const div = document.createElement("div");
  div.className = "svc-card-skeleton";
  div.innerHTML = `
    <div class="svc-card-header">
      <div class="svc-card-avatar"></div>
      <div class="svc-card-identity">
        <h3 class="svc-card-name"></h3>
        <p class="svc-card-trade"></p>
        <div class="svc-card-info"></div>
      </div>
      <button class="svc-fav-btn" disabled></button>
    </div>
    <div class="svc-card-badges badge-row">
      <div class="badge"></div>
      <div class="badge"></div>
    </div>
    <div class="svc-card-footer">
      <button class="svc-btn-primary" disabled></button>
      <button class="svc-btn-call" disabled></button>
    </div>
  `;
  return div;
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
  openAdvancedFiltersPanel();
  return true;
}

// لوحة الفلاتر المتقدمة (حرفة/منطقة/ترتيب/مميز فقط/موثّق فقط) بقت اختيارية
// ومطوية افتراضيًا أسفل الصفحة - شريط البحث فوق بقى بسيط وبدون ازدحام
function toggleAdvancedFiltersPanel() {
  const panel = document.getElementById("advancedFiltersPanel");
  const toggle = document.getElementById("advancedFiltersToggle");
  if (!panel || !toggle) return;
  const opening = !panel.classList.contains("open");
  panel.classList.toggle("open", opening);
  toggle.classList.toggle("active", opening);
  toggle.setAttribute("aria-expanded", opening ? "true" : "false");
}

function openAdvancedFiltersPanel() {
  const panel = document.getElementById("advancedFiltersPanel");
  const toggle = document.getElementById("advancedFiltersToggle");
  if (!panel || !toggle) return;
  panel.classList.add("open");
  toggle.classList.add("active");
  toggle.setAttribute("aria-expanded", "true");
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

// قسم "الخدمات الأكثر طلبًا" - نفس بيانات allTrades/allWorkers المُحمَّلة
// بالفعل، من غير أي طلب API إضافي. الترتيب حسب مجموع نقاط الطلب الحقيقية
// (ضغطات اتصال/واتساب لكل صنايعية الحرفة) لو متوفرة، وإلا حسب عدد الصنايعية
// كبديل معقول - بدون اختراع أي رقم طلب وهمي.
// صور حقيقية للحرف (بند 13) - فاضي حاليًا لعدم وجود صور حرف فعلية في
// المشروع (public/icons وpublic/images فيهم بس أيقونات التطبيق وصور الـHero).
// المفتاح لازم يكون اسم الحرفة بعد normalizeText. إضافة صورة حقيقية لاحقًا =
// سطر واحد هنا بس، مثال: "سباك": "/images/trades/plumber.jpg"
const TRADE_IMAGES = {};

function renderTradesShowcase() {
  const grid = document.getElementById("tradesShowcaseGrid");
  if (!grid) return;

  const names = getUniqueTradeNames();
  grid.innerHTML = "";
  if (!names.length) {
    grid.innerHTML = '<div class="trades-showcase-empty">لا توجد حرف متاحة حاليًا.</div>';
    return;
  }

  names
    .map(name => ({
      name,
      count: countWorkersForTrade(name),
      demand: allWorkers.filter(w => normalizeText(getWorkerTrade(w)) === normalizeText(name)).reduce((sum, w) => sum + getWorkerDemandScore(w), 0)
    }))
    .sort((a, b) => (b.demand - a.demand) || (b.count - a.count))
    .slice(0, 8)
    .forEach(({ name, count }) => {
      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = "trade-showcase-card";
      // أولوية صورة حقيقية للحرفة لو موجودة في TRADE_IMAGES (فحصت public/icons
      // وpublic/images - مفيش صور حرف فعلية في المشروع حاليًا)، وإلا Placeholder
      // بصري موحد (تدرّج بهوية الموقع + أيقونة كبيرة) بدل اختراع صور من الإنترنت.
      // نفس نسبة ثابتة وobject-fit:cover جاهزين لو اتضافت صور حقيقية لاحقًا
      const tradeImage = TRADE_IMAGES[normalizeText(name)];
      const visualHtml = tradeImage
        ? `<img src="${escapeHtml(tradeImage)}" alt="${escapeHtml(name)}" loading="lazy">`
        : `<i class="fa-solid ${tradeIconClass(name)}"></i>`;
      btn.innerHTML = `
        <span class="trade-showcase-visual${tradeImage ? '' : ' trade-showcase-visual-placeholder'}">${visualHtml}</span>
        <span class="trade-showcase-name">${escapeHtml(name)}</span>
        <span class="trade-showcase-count">${count} صنايعي</span>
      `;
      btn.addEventListener("click", () => {
        setTradeFilterValue(name);
        expandedTradeKey = normalizeText(name);
        renderTradeGroups();
        scrollToWorkersSection();
        if (window.CustomerGate) CustomerGate.trackEvent("category_view", { category_id: name, source: "home_trades_showcase" });
      });
      grid.appendChild(btn);
    });
}

// اقتراحات بحث سريعة تحت شريط البحث - بتستخدم نفس فلترة الحرف الحالية
// (tradeFilter + renderTradeGroups)، ومش بتعرض غير الحرف الموجودة فعليًا في
// البيانات عشان محدش يضغط اقتراح يرجّع نتيجة فاضية
function renderSearchSuggestions() {
  const box = document.getElementById("searchSuggestions");
  if (!box) return;

  const preferredOrder = ["سباك", "كهربائي", "فني تكييف", "نجار"];
  const existingNames = getUniqueTradeNames();
  const matched = preferredOrder
    .map(preferred => existingNames.find(name => normalizeText(name).includes(normalizeText(preferred))))
    .filter(Boolean);

  box.innerHTML = "";
  if (!matched.length) { box.style.display = "none"; return; }
  box.style.display = "flex";

  matched.forEach(name => {
    const chip = document.createElement("button");
    chip.type = "button";
    chip.className = "search-suggestion-chip";
    chip.innerHTML = `<i class="fa-solid ${tradeIconClass(name)}"></i> ${escapeHtml(name)}`;
    chip.addEventListener("click", () => {
      setTradeFilterValue(name);
      expandedTradeKey = normalizeText(name);
      renderTradeGroups();
      scrollToWorkersSection();
    });
    box.appendChild(chip);
  });
}

// قسم "صنايعية بالقرب منك" - مفيش نظام إحداثيات/مسافة حقيقي حاليًا (لا عند
// العميل ولا عند الصنايعي في قاعدة البيانات)، فبدل ما نخترع مسافة وهمية زي
// "1.4 كم"، بنعرض أفضل الصنايعية المتاحين حسب بيانات حقيقية (مميز/موثّق/
// تقييم/طلب). التصميم والـ DOM جاهزين لإضافة المسافة الحقيقية لاحقًا بمجرد
// توفر إحداثيات العميل والصنايعي (يتطلب أعمدة/API جديدة - راجع التقرير).
// نظام "صنايعية بالقرب منك" الحقيقي (بند 11) - مسافة حقيقية بمعادلة
// Haversine الموحّدة/الموثوقة (نفس المعادلة المستخدمة عالميًا لحساب المسافة
// الجغرافية بين نقطتين)، بدون أي رقم مُخترع. موقع العميل بيتطلب بس عند
// استخدام القسم ده تحديدًا (مش عند فتح التطبيق) وبيفضل في الذاكرة بس، مش
// بيتخزن في قاعدة البيانات ولا localStorage
let nearbyCustomerCoords = null;
let nearbyActiveFilter = "best";

function haversineDistanceKm(lat1, lng1, lat2, lng2) {
  const R = 6371;
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLng = (lng2 - lng1) * Math.PI / 180;
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) * Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

function workerHasCoords(worker) {
  return typeof worker.latitude === "number" && typeof worker.longitude === "number";
}

function workerDistanceKm(worker) {
  if (!nearbyCustomerCoords || !workerHasCoords(worker)) return null;
  return haversineDistanceKm(nearbyCustomerCoords.lat, nearbyCustomerCoords.lng, worker.latitude, worker.longitude);
}

function requestCustomerLocationForNearby(onDone) {
  const hint = document.getElementById("nearbyLocationHint");
  if (!navigator.geolocation) {
    if (hint) { hint.style.display = "block"; hint.textContent = "المتصفح ده مش بيدعم تحديد الموقع."; }
    onDone(false);
    return;
  }
  navigator.geolocation.getCurrentPosition((pos) => {
    nearbyCustomerCoords = { lat: pos.coords.latitude, lng: pos.coords.longitude };
    const toggle = document.getElementById("nearbyMapToggle");
    if (toggle) toggle.style.display = "inline-flex";
    if (hint) hint.style.display = "none";
    onDone(true);
  }, () => {
    if (hint) { hint.style.display = "block"; hint.textContent = "تم رفض إذن الموقع - هنعرض أفضل الصنايعية المتاحين بدل الأقرب فعليًا."; }
    onDone(false);
  }, { enableHighAccuracy: true, timeout: 10000 });
}

function initNearbyFilters() {
  const box = document.getElementById("nearbyFilters");
  if (!box) return;
  box.addEventListener("click", (e) => {
    const btn = e.target.closest(".nearby-filter-chip");
    if (!btn) return;
    const filter = btn.dataset.nearbyFilter;
    box.querySelectorAll(".nearby-filter-chip").forEach(c => c.classList.remove("active"));
    btn.classList.add("active");
    nearbyActiveFilter = filter;
    if (filter === "nearest" && !nearbyCustomerCoords) {
      requestCustomerLocationForNearby(() => renderNearbyWorkers());
    } else {
      renderNearbyWorkers();
    }
  });
  const mapToggle = document.getElementById("nearbyMapToggle");
  if (mapToggle) mapToggle.addEventListener("click", toggleNearbyMap);
}

function toggleNearbyMap() {
  const wrap = document.getElementById("nearbyMapWrap");
  const frame = document.getElementById("nearbyMapFrame");
  if (!wrap || !nearbyCustomerCoords) return;
  const showing = wrap.style.display !== "none";
  if (showing) { wrap.style.display = "none"; return; }
  const { lat, lng } = nearbyCustomerCoords;
  const delta = 0.03;
  const bbox = [lng - delta, lat - delta, lng + delta, lat + delta].join("%2C");
  frame.src = `https://www.openstreetmap.org/export/embed.html?bbox=${bbox}&layer=mapnik&marker=${lat}%2C${lng}`;
  wrap.style.display = "block";
}

function rankNearbyWorkers(workers) {
  const scoreOf = (w) => (isFeatured(w) ? 100 : 0) + (isVerified(w) ? 20 : 0)
    + getRatingSummary(getWorkerId(w)).average * 10 + getWorkerDemandScore(w);

  if (nearbyActiveFilter === "nearest" && nearbyCustomerCoords) {
    // اللي معاهم إحداثيات فعليًا بيترتبوا بالمسافة الحقيقية أولًا - اللي
    // معندهمش إحداثيات بيفضلوا ظاهرين (مش مخفيين) بس آخر الترتيب هنا تحديدًا
    return [...workers].sort((a, b) => {
      const da = workerDistanceKm(a), db = workerDistanceKm(b);
      if (da !== null && db !== null) return da - db;
      if (da !== null) return -1;
      if (db !== null) return 1;
      return availabilityRank(a) - availabilityRank(b) || scoreOf(b) - scoreOf(a);
    });
  }
  if (nearbyActiveFilter === "rating") {
    return [...workers].sort((a, b) => getRatingSummary(getWorkerId(b)).average - getRatingSummary(getWorkerId(a)).average);
  }
  if (nearbyActiveFilter === "available") {
    return [...workers].sort((a, b) => availabilityRank(a) - availabilityRank(b) || scoreOf(b) - scoreOf(a));
  }
  return [...workers].sort((a, b) => availabilityRank(a) - availabilityRank(b) || scoreOf(b) - scoreOf(a));
}

function renderNearbyWorkers() {
  const section = document.getElementById("nearbySection");
  const row = document.getElementById("nearbyScrollRow");
  if (!section || !row) return;

  if (!allWorkers.length) { section.style.display = "none"; return; }

  const ranked = rankNearbyWorkers(allWorkers).slice(0, 8);

  row.innerHTML = "";
  if (!ranked.length) {
    row.innerHTML = '<div class="empty-state"><i class="fa-solid fa-location-dot"></i><h3>مفيش صنايعية بالقرب منك دلوقتي</h3><p>جرّب تحديث موقعك أو ابحث بحرفة أخرى.</p></div>';
    section.style.display = "block";
    return;
  }
  section.style.display = "block";

  ranked.forEach(worker => {
    row.appendChild(buildServiceCard(worker, { source: "home_nearby", showDistance: true, nearbyStyle: true }));
  });
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
  const container = document.getElementById("tradeGroupsContainer");
  const nearbyRow = document.getElementById("nearbyScrollRow");
  const emptyBox = document.getElementById("emptyBox");

  if(loadingBox) loadingBox.style.display = "none";
  if(emptyBox) emptyBox.style.display = "none";
  if(container) {
    container.innerHTML = "";
    for(let i = 0; i < 6; i++) container.appendChild(buildSkeletonCard());
  }
  if(nearbyRow) {
    nearbyRow.innerHTML = "";
    for(let i = 0; i < 4; i++) nearbyRow.appendChild(buildSkeletonCard());
  }

  data = data || await fetchJson("/api/workers?limit=1200");
  const workers = normalizeArray(data);

  allWorkers = workers.filter(worker => {
    const approved = worker.approved ?? worker.is_approved ?? 1;
    const active = worker.active ?? worker.is_active ?? 1;
    return ok(approved) && ok(active) && isSubscriptionOk(worker);
  });

  loadRatingsForWorkers();
  renderTradeGroups();
  updateStats();
  renderAreaIcons();
  renderTradesShowcase();
  renderTopDemandTrades();
  renderTopDemandWorkers();
  renderSearchSuggestions();
  renderNearbyWorkers();
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

function sortWorkers(workers) {
  const sortValue = document.getElementById("sortFilter")?.value || "default";
  const sorted = [...workers];
  // الترتيب حسب حالة التوفر (متاح ثم مشغول ثم غير متاح) أولوية أساسية قبل أي
  // معيار تاني، من غير ما نخفي حد - كل المعايير التانية بتفضل شغالة كـTie-breaker
  if (sortValue === "featured") {
    sorted.sort((a, b) => availabilityRank(a) - availabilityRank(b) || (isFeatured(b) ? 1 : 0) - (isFeatured(a) ? 1 : 0));
  } else if (sortValue === "rating") {
    sorted.sort((a, b) => availabilityRank(a) - availabilityRank(b) || getRatingSummary(getWorkerId(b)).average - getRatingSummary(getWorkerId(a)).average);
  } else if (sortValue === "demand") {
    sorted.sort((a, b) => availabilityRank(a) - availabilityRank(b) || getWorkerDemandScore(b) - getWorkerDemandScore(a));
  } else {
    sorted.sort((a, b) => availabilityRank(a) - availabilityRank(b) || (isFeatured(b) ? 1 : 0) - (isFeatured(a) ? 1 : 0));
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
function getWorkerPhone(worker) { return worker.phone || ""; }
function getWorkerWhatsapp(worker) { return worker.whatsapp || getWorkerPhone(worker); }
function getWorkerId(worker) { return worker.id || worker._id; }
function isFeatured(worker) { return ok(worker.featured || worker.special); }
function isVerified(worker) { return ok(worker.identity_verified || worker.verified); }

// حالة توفر الصنايعي - available/busy/offline من عمود حقيقي في قاعدة
// البيانات (available هو الافتراضي الآمن لأي حساب قديم مفيهوش قيمة)
const AVAILABILITY_INFO = {
  available: { dotClass: "avail-dot-green", label: "متاح" },
  busy: { dotClass: "avail-dot-yellow", label: "مشغول" },
  offline: { dotClass: "avail-dot-red", label: "غير متاح" }
};
function getAvailabilityStatus(worker) {
  const s = worker.availability_status;
  return AVAILABILITY_INFO[s] ? s : "available";
}
function getAvailabilityInfo(worker) { return AVAILABILITY_INFO[getAvailabilityStatus(worker)]; }
function availabilityRank(worker) { return { available: 0, busy: 1, offline: 2 }[getAvailabilityStatus(worker)]; }
function renderAvailabilityBadgeHtml(worker) {
  const info = getAvailabilityInfo(worker);
  return `<span class="avail-badge"><span class="avail-dot ${info.dotClass}"></span> ${info.label}</span>`;
}

// نظام الشارات الموحّد (بند 5 من الـMaster Plan) - كل شارة بتُشتق من بيانات
// حقيقية فقط ومفيش أي قيمة مُخترعة. "الأعلى تقييمًا" بحد أدنى متوسط 4.5 وحد
// أدنى 5 تقييمات معتمدة - الحدين مبنيين على تحليل فعلي لتوزيع التقييمات
// الحالية في قاعدة البيانات (43 تقييم معتمد على 19 صنايعي، وأقصى عدد
// تقييمات لصنايعي واحد هو 6 فقط) عشان الشارة تفضل نادرة وذات معنى ومتبقاش
// بتتاحق بعد أول تقييمين. شارة "سريع الاستجابة" و"رقم هاتف موثق" مش موجودين
// هنا لعدم كفاية/توفر بيانات حقيقية - راجع تقرير التنفيذ.
// ترتيب الأولوية عند وجود أكثر من شارتين (تصميم الكارت الموحّد الجديد):
// 1. هوية موثقة  2. صنايعي مميز  3. الأعلى تقييمًا
function getWorkerBadges(worker) {
  const badges = [];
  if (isVerified(worker)) badges.push({ type: "verified", icon: "fa-circle-check", text: "هوية موثقة", tooltip: "تم التحقق من هوية الصنايعي" });
  if (isFeatured(worker)) badges.push({ type: "featured", icon: "fa-star", text: "صنايعي مميز", tooltip: "من الصنايعية المميزين على المنصة" });
  const summary = getRatingSummary(getWorkerId(worker));
  if (summary.average >= 4.5 && summary.count >= 5) {
    badges.push({ type: "top-rated", icon: "fa-trophy", text: "الأعلى تقييمًا", tooltip: "من الصنايعية الأعلى تقييمًا على المنصة" });
  }
  return badges;
}

// cap = أقصى عدد شارات تتعرض (مثلًا 2 على الكارت) - null/0 يعني عرض الكل
// (مناسب لبروفايل الصنايعي)
function renderBadgeRowHtml(badges, cap) {
  const list = cap ? badges.slice(0, cap) : badges;
  if (!list.length) return "";
  const items = list.map(b => `<span class="badge badge-${b.type}" title="${escapeHtml(b.tooltip)}"><i class="fa-solid ${b.icon}"></i> ${escapeHtml(b.text)}</span>`).join("");
  return `<div class="badge-row">${items}</div>`;
}

// الكارت الموحّد الجديد (إعادة تصميم من الصفر) - مولّد واحد بيُستخدم لكل
// سياقات عرض الصنايعي كـ"كارت" في الرئيسية (index.html/home.js): القائمة
// الرئيسية و"بالقرب منك" سوا. نفس البنية (Header بصورة+هوية+قلب، شارات
// بحد أقصى 2، Footer بسيط بزرارين) بمكوّن CSS واحد (.svc-card في
// global.css)، مع فروق بسيطة فقط حسب opts (المسافة، عرض ثابت في صف أفقي).
// opts: { source: مصدر تتبّع الحدث, showDistance: تفعيل المسافة الحقيقية لو
// متاحة, nearbyStyle: عرض ثابت مناسب لصف "بالقرب منك" الأفقي }
// وسم صغير (أيقونة بس) لمستوى الصنايعي (بند 17) على زاوية صورة الكارت -
// بيتحسب السيرفر ديناميكيًا (worker.level/level_icon/level_label) وبيظهر
// هنا بس من "محترف" فما فوق عشان معندهوش زحمة على أغلب الكروت (لسه "جديد")
function renderLevelTagHtml(worker) {
  const level = worker.level;
  const icon = worker.level_icon;
  if (!level || level === "new" || !icon) return "";
  return `<span class="svc-level-tag svc-level-${level}" title="${escapeHtml(worker.level_label || '')}"><i class="fa-solid ${icon}"></i></span>`;
}

function buildServiceCard(worker, opts) {
  opts = opts || {};
  const name = getWorkerName(worker);
  const trade = getWorkerTrade(worker);
  const area = getWorkerArea(worker);
  const phone = getWorkerPhone(worker);
  const id = getWorkerId(worker);
  const image = getWorkerImage(worker);
  const featured = isFeatured(worker);
  const verified = isVerified(worker);
  const callNum = phone.replace(/[^\d]/g, "");
  const availInfo = getAvailabilityInfo(worker);
  const isFav = favoriteWorkerIds.has(String(id));
  const ratingSummary = getRatingSummary(id);
  const distanceKm = opts.showDistance ? workerDistanceKm(worker) : null;
  const badgesHtml = renderBadgeRowHtml(getWorkerBadges(worker), 2);

  // سطرين خفيفين منفصلين تحت الحرفة: (1) المنطقة/المسافة الحقيقية لو متاحة،
  // (2) التقييم (لو موجود) + حالة التوفر جنب بعض - بيستغل الفراغ الفاضي
  // من غير ما ياخد وزن بصري أكبر من الاسم، ولا يتصادما مع بعض
  const locationLine = distanceKm !== null
    ? `<i class="fa-solid fa-route"></i> ${distanceKm < 1 ? Math.round(distanceKm * 1000) + ' م' : distanceKm.toFixed(1) + ' كم'}`
    : `<i class="fa-solid fa-location-dot"></i> ${escapeHtml(area)}`;
  const availChip = `<span class="svc-avail-chip"><span class="avail-dot ${availInfo.dotClass}"></span>${escapeHtml(availInfo.label)}</span>`;
  const secondaryLine = ratingSummary.count
    ? `<i class="fa-solid fa-star"></i> ${ratingSummary.average}<span class="svc-dot">·</span>${availChip}`
    : availChip;

  const card = document.createElement("article");
  card.className = "svc-card" + (opts.nearbyStyle ? " svc-card-nearby" : "") + (featured ? " featured-card" : "") + (verified ? " verified-card" : "");
  // فتح بروفايل الصنايعي الكامل محتاج تسجيل عميل الأول (اسم + رقم) - الكارت
  // نفسه (اسم/صورة/منطقة/تقييم) يفضل ظاهر لأي زائر بدون حساب
  card.addEventListener("click", () => {
    if (!id) return;
    withCustomerGate((gate) => gate.ensureIdentified(() => { location.href = "/worker/" + id; }));
  });

  card.innerHTML = `
    <button type="button" class="svc-fav-btn${isFav ? ' svc-fav-active' : ''}" data-fav-toggle title="${isFav ? 'إزالة من المفضلة' : 'إضافة للمفضلة'}" aria-label="المفضلة"><i class="fa-solid fa-heart"></i></button>
    <div class="svc-card-header">
      <div class="svc-card-avatar">
        <img loading="lazy" src="${escapeHtml(image)}" alt="${escapeHtml(name)}" onerror="this.onerror=null;this.src='/icons/default-worker-avatar.png'">
      </div>
      <div class="svc-card-identity">
        <h3 class="svc-card-name" title="${escapeHtml(name)}"><span>${escapeHtml(name)}</span>${renderLevelTagHtml(worker)}</h3>
        <span class="svc-card-trade" title="${escapeHtml(trade)}">${escapeHtml(trade)}</span>
        <div class="svc-card-info">${locationLine}</div>
        <div class="svc-card-info svc-card-info-light">${secondaryLine}</div>
      </div>
    </div>
    ${badgesHtml ? `<div class="svc-card-badges badge-row">${badgesHtml}</div>` : ''}
    <div class="svc-card-footer">
      <button type="button" class="svc-btn-primary">عرض الملف</button>
      <a href="#" class="svc-btn-call ${!callNum ? 'disabled' : ''}" data-gate-action="call" aria-label="اتصال"><i class="fa-solid fa-phone"></i> اتصال</a>
    </div>
  `;

  card.querySelector(".svc-btn-primary").addEventListener("click", (e) => {
    e.stopPropagation();
    if (!id) return;
    withCustomerGate((gate) => gate.ensureIdentified(() => { location.href = "/worker/" + id; }));
  });

  // الاتصال من الكارت محتاج نفس بوابة التسجيل البسيطة اللي في صفحة بروفايل
  // الصنايعي - منعمل الفعل الحقيقي إلا بعد التسجيل
  const callLink = card.querySelector('[data-gate-action="call"]');
  if (callLink) {
    callLink.addEventListener("click", (e) => {
      e.preventDefault();
      e.stopPropagation();
      if (!callNum) return;
      withCustomerGate((gate) => {
        gate.ensureIdentified(function () {
          gate.trackEvent("call_click", { worker_id: String(id), source: opts.source || "home_card" });
          window.location.href = "tel:" + callNum;
        });
      });
    });
  }

  const favBtn = card.querySelector("[data-fav-toggle]");
  if (favBtn) {
    favBtn.addEventListener("click", (e) => {
      e.preventDefault();
      e.stopPropagation();
      toggleFavorite(id, favBtn);
    });
  }

  return card;
}

function createWorkerCardElement(worker) {
  return buildServiceCard(worker, { source: "home_card" });
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
  initHeaderUtility();
  initHeroSlider();
  initStatsSlider();
  initNearbyFilters();
  document.getElementById("advancedFiltersToggle")?.addEventListener("click", toggleAdvancedFiltersPanel);
  // هذه البيانات مستقلة؛ تحميلها بالتوازي يوفر جولتي انتظار شبكي على الصفحة الرئيسية.
  const [tradesData, areasData, workersData] = await Promise.all([
    fetchJson("/api/trades"),
    fetchJson("/api/areas"),
    fetchJson("/api/workers?limit=1200"),
    loadFavoriteIds()
  ]);
  await loadTrades(tradesData);
  await loadAreas(areasData);
  await loadWorkers(workersData);
  applyFilterFromUrl();
}

initPage();
