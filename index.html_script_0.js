
    let allWorkers = [];
    let allTrades = [];
    let allAreas = [];
    let ratingsByWorker = {};

    function toggleMobileMenu() {
      const nav = document.getElementById("mobileNav");
      nav.classList.toggle("show");
    }

    async function fetchJsonWithFallback(urls) {
      for (const url of urls) {
        try {
          const response = await fetch(url);

          if (response.ok) {
            return await response.json();
          }
        } catch (error) {
          console.log("Failed:", url);
        }
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

    function getTradeFromUrl() {
      const params = new URLSearchParams(window.location.search);
      const queryTrade = params.get("trade") || params.get("craft") || "";

      if (queryTrade) {
        return decodeURIComponent(queryTrade).trim();
      }

      const parts = window.location.pathname.split("/").filter(Boolean);
      if (parts[0] === "trade" && parts[1]) {
        return decodeURIComponent(parts.slice(1).join("/")).trim();
      }

      return "";
    }

    function getAreaFromUrl() {
      const params = new URLSearchParams(window.location.search);
      const queryArea = params.get("area") || params.get("location") || "";

      if (queryArea) {
        return decodeURIComponent(queryArea).trim();
      }

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

      if (tradeName) {
        ensureTradeOption(tradeName);
      }

      const normalized = normalizeText(tradeName);
      const matchingOption = Array.from(select.options).find(option => normalizeText(option.value) === normalized);
      select.value = matchingOption ? matchingOption.value : "";
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

      if (areaName) {
        ensureAreaOption(areaName);
      }

      const normalized = normalizeText(areaName);
      const matchingOption = Array.from(select.options).find(option => normalizeText(option.value) === normalized);
      select.value = matchingOption ? matchingOption.value : "";
    }

    function updateListingUrl(tradeName, areaName, replaceState) {
      let nextUrl = "/";

      if (tradeName) {
        nextUrl = "/trade/" + encodeURIComponent(tradeName);
      } else if (areaName) {
        nextUrl = "/area/" + encodeURIComponent(areaName);
      }

      if (window.location.pathname + window.location.search === nextUrl) {
        return;
      }

      const method = replaceState ? "replaceState" : "pushState";
      window.history[method]({ trade: tradeName || "", area: areaName || "" }, "", nextUrl);
    }

    function updateTradeUrl(tradeName, replaceState) {
      updateListingUrl(tradeName, "", replaceState);
    }

    function updateAreaUrl(areaName, replaceState) {
      updateListingUrl("", areaName, replaceState);
    }

    function updateWorkersHeading(selectedTrade, selectedArea, count) {
      const title = document.getElementById("workersSectionTitle");
      const subtitle = document.getElementById("workersSectionSubtitle");
      if (!title || !subtitle) return;

      if (selectedTrade) {
        title.textContent = "صنايعية " + selectedTrade;
        subtitle.textContent = count + " صنايعي متاح داخل هذه الحرفة. اختار المناسب واتواصل مباشرة.";
      } else if (selectedArea) {
        title.textContent = "صنايعية " + selectedArea;
        subtitle.textContent = count + " صنايعي متاح داخل هذه المنطقة. اختار المناسب واتواصل مباشرة.";
      } else {
        title.textContent = "اختار الصنايعي المناسب";
        subtitle.textContent = "ابحث بالاسم أو الحرفة أو المنطقة، واتواصل مباشرة مع الصنايعي.";
      }
    }

    function applyFilterFromUrl() {
      const tradeName = getTradeFromUrl();
      const areaName = tradeName ? "" : getAreaFromUrl();

      if (!tradeName && !areaName) return false;

      const searchInput = document.getElementById("searchInput");
      const sortFilter = document.getElementById("sortFilter");

      if (searchInput) searchInput.value = "";
      if (sortFilter) sortFilter.value = "default";
      const featuredOnlyFilter = document.getElementById("featuredOnlyFilter");
      const verifiedOnlyFilter = document.getElementById("verifiedOnlyFilter");
      if (featuredOnlyFilter) featuredOnlyFilter.checked = false;
      if (verifiedOnlyFilter) verifiedOnlyFilter.checked = false;

      setTradeFilterValue(tradeName);
      setAreaFilterValue(areaName);
      filterWorkers();
      updateListingUrl(tradeName, areaName, true);

      const workersSection = document.getElementById("workers");
      if (workersSection && (window.location.pathname.startsWith("/trade/") || window.location.pathname.startsWith("/area/"))) {
        setTimeout(function () {
          workersSection.scrollIntoView({ behavior: "smooth", block: "start" });
        }, 150);
      }

      return true;
    }

    function applyTradeFromUrl() {
      return applyFilterFromUrl();
    }

    function onTradeFilterChanged() {
      const selectedTrade = document.getElementById("tradeFilter").value.trim();
      const searchInput = document.getElementById("searchInput");
      if (searchInput) searchInput.value = "";
      setAreaFilterValue("");
      updateTradeUrl(selectedTrade, false);
      filterWorkers();
      const workersSection = document.getElementById("workers");
      if (workersSection) {
        workersSection.scrollIntoView({ behavior: "smooth", block: "start" });
      }
    }

    function onAreaFilterChanged() {
      const selectedArea = document.getElementById("areaFilter").value.trim();
      const searchInput = document.getElementById("searchInput");
      if (searchInput) searchInput.value = "";
      setTradeFilterValue("");
      updateAreaUrl(selectedArea, false);
      filterWorkers();
      const workersSection = document.getElementById("workers");
      if (workersSection) {
        workersSection.scrollIntoView({ behavior: "smooth", block: "start" });
      }
    }

    window.addEventListener("popstate", function () {
      const tradeName = getTradeFromUrl();
      const areaName = tradeName ? "" : getAreaFromUrl();
      setTradeFilterValue(tradeName);
      setAreaFilterValue(areaName);
      filterWorkers();
    });

    function tradeIconClass(tradeName) {
      const text = normalizeText(tradeName);

      const rules = [
        { keys: ["سباك", "سباكه", "صرف", "مواسير"], icon: "fa-faucet-drip" },
        { keys: ["كهرب", "كهربائي", "كهرباء"], icon: "fa-bolt" },
        { keys: ["نجار", "نجاره", "خشب", "موبيليا"], icon: "fa-hammer" },
        { keys: ["نقاش", "دهان", "دهانات", "بويا"], icon: "fa-paint-roller" },
        { keys: ["تكييف", "تبريد", "فريون"], icon: "fa-wind" },
        { keys: ["حداد", "حديد", "كريتال"], icon: "fa-industry" },
        { keys: ["محاره", "مبيض", "لياسه"], icon: "fa-trowel-bricks" },
        { keys: ["بناء", "مقاول", "طوب"], icon: "fa-person-digging" },
        { keys: ["سيراميك", "بلاط", "ارضيات", "رخام", "جرانيت"], icon: "fa-border-all" },
        { keys: ["الوميتال", "المنيوم", "شبابيك", "ابواب"], icon: "fa-window-restore" },
        { keys: ["زجاج", "مرايات"], icon: "fa-vector-square" },
        { keys: ["جبس", "ديكور", "جبسون"], icon: "fa-shapes" },
        { keys: ["كاميرا", "كاميرات", "مراقبه", "انذار"], icon: "fa-video" },
        { keys: ["دش", "ستالايت", "رسيفر"], icon: "fa-satellite-dish" },
        { keys: ["انترنت", "شبكات", "واي فاي"], icon: "fa-wifi" },
        { keys: ["موبايل", "هواتف"], icon: "fa-mobile-screen-button" },
        { keys: ["كمبيوتر", "لاب", "لابتوب"], icon: "fa-laptop" },
        { keys: ["غساله", "غسالات"], icon: "fa-soap" },
        { keys: ["ثلاجه", "ثلاجات", "ديب فريزر"], icon: "fa-snowflake" },
        { keys: ["بوتاجاز", "بوتاجازات", "غاز"], icon: "fa-fire-burner" },
        { keys: ["اجهزه", "صيانة اجهزه", "صيانة أجهزة"], icon: "fa-plug-circle-bolt" },
        { keys: ["تنظيف", "نظافه"], icon: "fa-broom" },
        { keys: ["مكافحه", "حشرات"], icon: "fa-bug" },
        { keys: ["نقل", "عفش", "ونش"], icon: "fa-truck-moving" },
        { keys: ["ميكانيكي", "سيارات", "عربيات"], icon: "fa-gears" },
        { keys: ["مفتاح", "كالون", "اقفال"], icon: "fa-key" }
      ];

      for (const rule of rules) {
        if (rule.keys.some(key => text.includes(normalizeText(key)))) {
          return rule.icon;
        }
      }

      return "fa-screwdriver-wrench";
    }

    function getUniqueTradeNames() {
      const seen = new Set();
      const names = [];

      allTrades.forEach(item => {
        const name = String(getTradeLabel(item) || "").trim();
        const key = normalizeText(name);

        if (name && !seen.has(key)) {
          seen.add(key);
          names.push(name);
        }
      });

      return names;
    }

    function countWorkersForTrade(tradeName) {
      const target = normalizeText(tradeName);
      if (!target) return allWorkers.length;
      return allWorkers.filter(worker => normalizeText(getWorkerTrade(worker)) === target).length;
    }

    function createTradeIconCard(tradeName, count, isAll) {
      const button = document.createElement("button");
      button.type = "button";
      button.className = "trade-icon-card";
      button.dataset.trade = tradeName || "";
      button.setAttribute("aria-label", isAll ? "عرض كل الحرف" : "عرض صنايعية " + tradeName);
      button.title = isAll ? "عرض كل الحرف" : "فتح صفحة صنايعية " + tradeName;

      const icon = isAll ? "fa-layer-group" : tradeIconClass(tradeName);
      const label = isAll ? "كل الحرف" : tradeName;
      const countText = count === 1 ? "صنايعي واحد" : count + " صنايعي";

      button.innerHTML = `
        <span class="trade-icon-bubble">
          <i class="fa-solid ${icon}"></i>
        </span>
        <strong>${escapeHtml(label)}</strong>
        <small>${countText}</small>
      `;

      button.addEventListener("click", function () {
        openTradeWorkers(tradeName || "", button);
      });

      return button;
    }

    function renderTradeIcons() {
      const grid = document.getElementById("tradeIconsGrid");
      if (!grid) return;

      const trades = getUniqueTradeNames();
      grid.innerHTML = "";

      if (!trades.length) {
        grid.innerHTML = '<div class="trade-icons-empty">لا توجد حرف مضافة حاليًا من لوحة الإدارة.</div>';
        return;
      }

      grid.appendChild(createTradeIconCard("", allWorkers.length, true));

      trades.forEach(tradeName => {
        grid.appendChild(createTradeIconCard(tradeName, countWorkersForTrade(tradeName), false));
      });

      updateTradeIconsActiveState();
    }

    function updateTradeIconsActiveState() {
      const select = document.getElementById("tradeFilter");
      const selectedTrade = select ? normalizeText(select.value) : "";

      document.querySelectorAll(".trade-icon-card").forEach(card => {
        const cardTrade = normalizeText(card.dataset.trade || "");
        const active = selectedTrade ? cardTrade === selectedTrade : cardTrade === "";
        card.classList.toggle("active", active);
      });
    }

    function openTradeWorkers(tradeName, clickedButton) {
      const searchInput = document.getElementById("searchInput");
      const areaFilter = document.getElementById("areaFilter");
      const sortFilter = document.getElementById("sortFilter");

      if (searchInput) searchInput.value = "";
      if (areaFilter) areaFilter.value = "";
      if (sortFilter) sortFilter.value = "default";
      const featuredOnlyFilter = document.getElementById("featuredOnlyFilter");
      const verifiedOnlyFilter = document.getElementById("verifiedOnlyFilter");
      if (featuredOnlyFilter) featuredOnlyFilter.checked = false;
      if (verifiedOnlyFilter) verifiedOnlyFilter.checked = false;

      setQuickTrade(tradeName, null);

      document.querySelectorAll(".trade-icon-card").forEach(card => card.classList.remove("active"));
      if (clickedButton) clickedButton.classList.add("active");
    }


    function areaIconClass(areaName) {
      const text = normalizeText(areaName);

      const rules = [
        { keys: ["وسط", "البلد", "السنتر", "المركز"], icon: "fa-city" },
        { keys: ["علم الروم", "علم", "الروم"], icon: "fa-location-dot" },
        { keys: ["عجيبه", "عجيبة", "شاطئ", "بحر"], icon: "fa-umbrella-beach" },
        { keys: ["روميل"], icon: "fa-water" },
        { keys: ["الكيلو", "طريق", "اسكندريه", "إسكندرية"], icon: "fa-road" },
        { keys: ["السلوم"], icon: "fa-mountain-sun" },
        { keys: ["الضبعه", "الضبعة"], icon: "fa-solar-panel" },
        { keys: ["سيدي", "براني", "عبدالرحمن"], icon: "fa-map-location-dot" },
        { keys: ["مطروح", "مرسى"], icon: "fa-map-pin" }
      ];

      for (const rule of rules) {
        if (rule.keys.some(key => text.includes(normalizeText(key)))) {
          return rule.icon;
        }
      }

      return "fa-location-dot";
    }

    function getUniqueAreaNames() {
      const seen = new Set();
      const names = [];

      allAreas.forEach(item => {
        const name = String(item.name || item.area || item.location || item.title || item || "").trim();
        const key = normalizeText(name);

        if (name && !seen.has(key)) {
          seen.add(key);
          names.push(name);
        }
      });

      return names;
    }

    function countWorkersForArea(areaName) {
      const target = normalizeText(areaName);
      if (!target) return allWorkers.length;
      return allWorkers.filter(worker => normalizeText(getWorkerArea(worker)) === target).length;
    }

    function createAreaIconCard(areaName, count, isAll) {
      const button = document.createElement("button");
      button.type = "button";
      button.className = "area-icon-card";
      button.dataset.area = areaName || "";
      button.setAttribute("aria-label", isAll ? "عرض كل المناطق" : "عرض صنايعية " + areaName);
      button.title = isAll ? "عرض كل المناطق" : "فتح صفحة صنايعية " + areaName;

      const icon = isAll ? "fa-map" : areaIconClass(areaName);
      const label = isAll ? "كل المناطق" : areaName;
      const countText = count === 1 ? "صنايعي واحد" : count + " صنايعي";

      button.innerHTML = `
        <span class="area-icon-bubble">
          <i class="fa-solid ${icon}"></i>
        </span>
        <strong>${escapeHtml(label)}</strong>
        <small>${countText}</small>
      `;

      button.addEventListener("click", function () {
        openAreaWorkers(areaName || "", button);
      });

      return button;
    }

    function renderAreaIcons() {
      const grid = document.getElementById("areaIconsGrid");
      if (!grid) return;

      const areas = getUniqueAreaNames();
      grid.innerHTML = "";

      if (!areas.length) {
        grid.innerHTML = '<div class="area-icons-empty">لا توجد مناطق مضافة حاليًا من لوحة الإدارة.</div>';
        return;
      }

      grid.appendChild(createAreaIconCard("", allWorkers.length, true));

      areas.forEach(areaName => {
        grid.appendChild(createAreaIconCard(areaName, countWorkersForArea(areaName), false));
      });

      updateAreaIconsActiveState();
    }

    function updateAreaIconsActiveState() {
      const select = document.getElementById("areaFilter");
      const selectedArea = select ? normalizeText(select.value) : "";

      document.querySelectorAll(".area-icon-card").forEach(card => {
        const cardArea = normalizeText(card.dataset.area || "");
        const active = selectedArea ? cardArea === selectedArea : cardArea === "";
        card.classList.toggle("active", active);
      });
    }

    function openAreaWorkers(areaName, clickedButton) {
      const searchInput = document.getElementById("searchInput");
      const sortFilter = document.getElementById("sortFilter");

      if (searchInput) searchInput.value = "";
      if (sortFilter) sortFilter.value = "default";
      const featuredOnlyFilter = document.getElementById("featuredOnlyFilter");
      const verifiedOnlyFilter = document.getElementById("verifiedOnlyFilter");
      if (featuredOnlyFilter) featuredOnlyFilter.checked = false;
      if (verifiedOnlyFilter) verifiedOnlyFilter.checked = false;
      setTradeFilterValue("");
      setAreaFilterValue(areaName);
      updateAreaUrl(areaName, false);
      filterWorkers();

      document.querySelectorAll(".area-icon-card").forEach(card => card.classList.remove("active"));
      if (clickedButton) clickedButton.classList.add("active");

      const workersSection = document.getElementById("workers");
      if (workersSection) {
        workersSection.scrollIntoView({ behavior: "smooth", block: "start" });
      }
    }

    async function loadTrades() {
      const data = await fetchJsonWithFallback([
        "/api/trades",
        "/api/crafts",
        "/api/jobs",
        "/trades",
        "/crafts"
      ]);

      allTrades = normalizeArray(data);

      const select = document.getElementById("tradeFilter");
      select.innerHTML = '<option value="">كل الحرف</option>';

      allTrades.forEach(item => {
        const tradeName = getTradeLabel(item);

        if (tradeName) {
          const option = document.createElement("option");
          option.value = tradeName;
          option.textContent = tradeName;
          select.appendChild(option);
        }
      });

      document.getElementById("tradesCount").textContent = allTrades.length;
      renderTradeIcons();
    }

    async function loadAreas() {
      const data = await fetchJsonWithFallback([
        "/api/areas",
        "/api/locations",
        "/areas",
        "/locations"
      ]);

      allAreas = normalizeArray(data);

      const select = document.getElementById("areaFilter");
      select.innerHTML = '<option value="">كل المناطق</option>';

      allAreas.forEach(item => {
        const areaName = item.name || item.area || item.location || item.title || item;

        if (areaName) {
          const option = document.createElement("option");
          option.value = areaName;
          option.textContent = areaName;
          select.appendChild(option);
        }
      });

      renderAreaIcons();
    }

    async function loadWorkers() {
      const loadingBox = document.getElementById("loadingBox");
      const emptyBox = document.getElementById("emptyBox");
      const workersGrid = document.getElementById("workersGrid");

      loadingBox.style.display = "flex";
      emptyBox.style.display = "none";
      workersGrid.innerHTML = "";

      const data = await fetchJsonWithFallback([
        "/api/workers",
        "/api/sanaieya",
        "/api/sanai3ya",
        "/api/craftsmen",
        "/workers",
        "/sanaieya"
      ]);

      const workers = normalizeArray(data);

      allWorkers = workers.filter(worker => {
        const approved = worker.approved ?? worker.is_approved ?? worker.visible ?? worker.isVisible ?? 1;
        const active = worker.active ?? worker.is_active ?? worker.status ?? 1;

        const isApproved =
          approved === 1 ||
          approved === true ||
          approved === "1" ||
          approved === "true" ||
          approved === "approved";

        const isActive =
          active === 1 ||
          active === true ||
          active === "1" ||
          active === "true" ||
          active === "active";

        const subscriptionOk = isSubscriptionOk(worker);

        return isApproved && isActive && subscriptionOk;
      });

      await loadRatingsForWorkers();

      loadingBox.style.display = "none";
      filterWorkers();
      updateStats();
      renderTradeIcons();
      renderAreaIcons();
    }

    async function loadRatingsForWorkers() {
      ratingsByWorker = {};

      const requests = allWorkers.map(async worker => {
        const id = getWorkerId(worker);

        if (!id) return;

        try {
          const response = await fetch("/api/workers/" + id + "/reviews/summary");

          if (!response.ok) {
            ratingsByWorker[id] = {
              average: 0,
              count: 0
            };
            return;
          }

          const summary = await response.json();

          ratingsByWorker[id] = {
            average: Number(summary.average) || 0,
            count: Number(summary.count) || 0
          };
        } catch (error) {
          ratingsByWorker[id] = {
            average: 0,
            count: 0
          };
        }
      });

      await Promise.all(requests);
    }

    function getRatingSummary(workerId) {
      return ratingsByWorker[workerId] || {
        average: 0,
        count: 0
      };
    }

    function renderRatingBadge(workerId) {
      const summary = getRatingSummary(workerId);

      if (!summary.count) {
        return `
          <div class="card-rating no-rating">
            <i class="fa-regular fa-star"></i>
            لا توجد تقييمات
          </div>
        `;
      }

      return `
        <div class="card-rating">
          <i class="fa-solid fa-star"></i>
          ${summary.average} من 5
          <span>(${summary.count})</span>
        </div>
      `;
    }

    function getCreatedTime(worker) {
      const rawDate =
        worker.created_at ||
        worker.createdAt ||
        worker.created ||
        worker.date ||
        worker.registered_at ||
        "";

      if (rawDate) {
        const time = new Date(rawDate).getTime();
        if (!isNaN(time)) return time;
      }

      return Number(getWorkerId(worker)) || 0;
    }

    function getSubscriptionPriority(worker) {
      return isSubscriptionOk(worker) ? 1 : 0;
    }

    function compareBooleanPriority(aValue, bValue) {
      return (bValue ? 1 : 0) - (aValue ? 1 : 0);
    }

    function compareRatingPriority(a, b) {
      const aRating = getRatingSummary(getWorkerId(a));
      const bRating = getRatingSummary(getWorkerId(b));

      if (bRating.average !== aRating.average) {
        return bRating.average - aRating.average;
      }

      if (bRating.count !== aRating.count) {
        return bRating.count - aRating.count;
      }

      return 0;
    }

    function compareNewestPriority(a, b) {
      return getCreatedTime(b) - getCreatedTime(a);
    }

    function compareDefaultPriority(a, b) {
      const featuredCompare = compareBooleanPriority(isFeatured(a), isFeatured(b));
      if (featuredCompare) return featuredCompare;

      const verifiedCompare = compareBooleanPriority(isVerified(a), isVerified(b));
      if (verifiedCompare) return verifiedCompare;

      const subscriptionCompare = getSubscriptionPriority(b) - getSubscriptionPriority(a);
      if (subscriptionCompare) return subscriptionCompare;

      const ratingCompare = compareRatingPriority(a, b);
      if (ratingCompare) return ratingCompare;

      return compareNewestPriority(a, b);
    }

    function sortWorkers(workers) {
      const sortValue = document.getElementById("sortFilter").value;
      const sorted = [...workers];

      if (sortValue === "featured") {
        sorted.sort((a, b) => {
          const featuredCompare = compareBooleanPriority(isFeatured(a), isFeatured(b));
          if (featuredCompare) return featuredCompare;

          const verifiedCompare = compareBooleanPriority(isVerified(a), isVerified(b));
          if (verifiedCompare) return verifiedCompare;

          const ratingCompare = compareRatingPriority(a, b);
          if (ratingCompare) return ratingCompare;

          return compareNewestPriority(a, b);
        });
        return sorted;
      }

      if (sortValue === "verified") {
        sorted.sort((a, b) => {
          const verifiedCompare = compareBooleanPriority(isVerified(a), isVerified(b));
          if (verifiedCompare) return verifiedCompare;

          const featuredCompare = compareBooleanPriority(isFeatured(a), isFeatured(b));
          if (featuredCompare) return featuredCompare;

          const ratingCompare = compareRatingPriority(a, b);
          if (ratingCompare) return ratingCompare;

          return compareNewestPriority(a, b);
        });
        return sorted;
      }

      if (sortValue === "rating") {
        sorted.sort((a, b) => {
          const ratingCompare = compareRatingPriority(a, b);
          if (ratingCompare) return ratingCompare;

          const featuredCompare = compareBooleanPriority(isFeatured(a), isFeatured(b));
          if (featuredCompare) return featuredCompare;

          const verifiedCompare = compareBooleanPriority(isVerified(a), isVerified(b));
          if (verifiedCompare) return verifiedCompare;

          return compareNewestPriority(a, b);
        });
        return sorted;
      }

      if (sortValue === "newest") {
        sorted.sort((a, b) => {
          const newestCompare = compareNewestPriority(a, b);
          if (newestCompare) return newestCompare;

          const featuredCompare = compareBooleanPriority(isFeatured(a), isFeatured(b));
          if (featuredCompare) return featuredCompare;

          const verifiedCompare = compareBooleanPriority(isVerified(a), isVerified(b));
          if (verifiedCompare) return verifiedCompare;

          return compareRatingPriority(a, b);
        });
        return sorted;
      }

      sorted.sort(compareDefaultPriority);
      return sorted;
    }

    function updateStats() {
      document.getElementById("workersCount").textContent = allWorkers.length;
    }

    function isSubscriptionOk(worker) {
      const end =
        worker.subscription_end ||
        worker.subscriptionEnd ||
        worker.end_date ||
        "";

      if (!end) return true;

      const today = new Date();
      const endDate = new Date(end);

      today.setHours(0, 0, 0, 0);
      endDate.setHours(0, 0, 0, 0);

      if (isNaN(endDate.getTime())) return true;

      return endDate >= today;
    }

    function getWorkerImage(worker) {
      const image =
        worker.image ||
        worker.photo ||
        worker.image_url ||
        worker.photo_url ||
        worker.profile_image ||
        worker.avatar ||
        "";

      if (!image) {
        return "/icons/default-worker-avatar.png";
      }

      if (image.startsWith("http")) return image;
      if (image.startsWith("/uploads")) return image;
      if (image.startsWith("uploads")) return "/" + image;

      return "/uploads/" + image;
    }

    function getWorkerName(worker) {
      return worker.name || worker.full_name || worker.worker_name || "صنايعي";
    }

    function getWorkerTrade(worker) {
      return worker.trade || worker.craft || worker.job || worker.profession || worker.trade_name || "حرفة غير محددة";
    }

    function getWorkerArea(worker) {
      return worker.area || worker.location || worker.region || worker.area_name || "منطقة غير محددة";
    }

    function getWorkerDescription(worker) {
      return worker.description || worker.about || worker.notes || "لا يوجد وصف متاح حاليًا.";
    }

    function getWorkerPhone(worker) {
      return worker.phone || worker.mobile || worker.phone_number || "";
    }

    function getWorkerWhatsapp(worker) {
      return worker.whatsapp || worker.whatsapp_number || worker.whats || getWorkerPhone(worker);
    }

    function getWorkerId(worker) {
      return worker.id || worker._id || worker.worker_id;
    }

    function isFeatured(worker) {
      const featured = worker.featured ?? worker.is_featured ?? worker.special ?? 0;
      return featured === 1 || featured === true || featured === "1" || featured === "true";
    }

    function isVerified(worker) {
      const verified = worker.identity_verified ?? worker.identityVerified ?? worker.is_verified ?? worker.verified ?? false;
      return verified === 1 || verified === true || verified === "1" || verified === "true";
    }

    function renderVerifiedTrustLine(worker) {
      if (!isVerified(worker)) return "";
      return `
        <div class="worker-trust-line">
          <i class="fa-solid fa-shield-halved"></i>
          موثّق من الإدارة
        </div>
      `;
    }

    function convertArabicNumbers(value) {
      const arabicNumbers = {
        "٠": "0",
        "١": "1",
        "٢": "2",
        "٣": "3",
        "٤": "4",
        "٥": "5",
        "٦": "6",
        "٧": "7",
        "٨": "8",
        "٩": "9",
        "۰": "0",
        "۱": "1",
        "۲": "2",
        "۳": "3",
        "۴": "4",
        "۵": "5",
        "۶": "6",
        "۷": "7",
        "۸": "8",
        "۹": "9"
      };

      return value.toString().replace(/[٠-٩۰-۹]/g, function (number) {
        return arabicNumbers[number];
      });
    }

    function normalizeWhatsAppNumber(phone) {
      if (!phone) return "";

      let digits = convertArabicNumbers(phone);
      digits = digits.replace(/[^\d]/g, "");

      if (digits.startsWith("00")) {
        digits = digits.slice(2);
      }

      if (digits.startsWith("0") && digits.length === 11) {
        digits = "20" + digits.slice(1);
      }

      if (
        !digits.startsWith("20") &&
        digits.length === 10 &&
        (
          digits.startsWith("10") ||
          digits.startsWith("11") ||
          digits.startsWith("12") ||
          digits.startsWith("15")
        )
      ) {
        digits = "20" + digits;
      }

      return digits;
    }

    function normalizeCallNumber(phone) {
      if (!phone) return "";

      let digits = convertArabicNumbers(phone);
      digits = digits.replace(/[^\d]/g, "");

      if (digits.startsWith("20") && digits.length === 12) {
        return "0" + digits.slice(2);
      }

      if (digits.startsWith("0020")) {
        return "0" + digits.slice(4);
      }

      if (digits.startsWith("0")) {
        return digits;
      }

      if (
        digits.length === 10 &&
        (
          digits.startsWith("10") ||
          digits.startsWith("11") ||
          digits.startsWith("12") ||
          digits.startsWith("15")
        )
      ) {
        return "0" + digits;
      }

      return digits;
    }


    function showCopyToast(message) {
      const toast = document.getElementById("copyToast");
      if (!toast) return;

      toast.innerHTML = `
        <i class="fa-solid fa-circle-check"></i>
        ${message}
      `;

      toast.classList.add("show");

      setTimeout(() => {
        toast.classList.remove("show");
      }, 2200);
    }

    async function shareWorker(event, workerId, workerName) {
      event.stopPropagation();

      if (!workerId) return;

      const workerUrl = window.location.origin + "/worker/" + workerId;
      const shareText = "شوف بيانات " + workerName + " على تطبيق صنايعي مطروح";

      if (navigator.share) {
        try {
          await navigator.share({
            title: workerName + " | صنايعي مطروح",
            text: shareText,
            url: workerUrl
          });
          return;
        } catch (error) {}
      }

      try {
        await navigator.clipboard.writeText(workerUrl);
        showCopyToast("تم نسخ رابط الصنايعي");
      } catch (error) {
        const tempInput = document.createElement("input");
        tempInput.value = workerUrl;
        document.body.appendChild(tempInput);
        tempInput.select();
        document.execCommand("copy");
        document.body.removeChild(tempInput);
        showCopyToast("تم نسخ رابط الصنايعي");
      }
    }

    function renderWorkers(workers) {
      const workersGrid = document.getElementById("workersGrid");
      const emptyBox = document.getElementById("emptyBox");

      workersGrid.innerHTML = "";

      if (!workers.length) {
        emptyBox.style.display = "block";
        return;
      }

      emptyBox.style.display = "none";

      workers.forEach(worker => {
        const name = getWorkerName(worker);
        const trade = getWorkerTrade(worker);
        const area = getWorkerArea(worker);
        const description = getWorkerDescription(worker);
        const phone = getWorkerPhone(worker);
        const whatsappPhone = getWorkerWhatsapp(worker);
        const image = getWorkerImage(worker);
        const featured = isFeatured(worker);
        const verified = isVerified(worker);
        const workerId = getWorkerId(worker);

        const whatsappNumber = normalizeWhatsAppNumber(whatsappPhone);
        const callNumber = normalizeCallNumber(phone);

        const whatsappText = encodeURIComponent("السلام عليكم، شوفت بياناتك على تطبيق صنايعي مطروح وعايز أستفسر عن شغلك.");
        const whatsappLink = whatsappNumber ? `https://wa.me/${whatsappNumber}?text=${whatsappText}` : "#";
        const phoneLink = callNumber ? `tel:${callNumber}` : "#";

        const card = document.createElement("article");
        card.className = "worker-card" + (featured ? " featured-card" : "") + (verified ? " verified-card" : "");
        card.style.cursor = "pointer";

        card.addEventListener("click", function () {
          if (workerId) {
            window.location.href = "/worker/" + workerId;
          }
        });

        card.innerHTML = `
          <div class="worker-image-wrap">
            <img src="${image}" alt="${name}" class="worker-image" onerror="this.onerror=null;this.src='/icons/default-worker-avatar.png'">

            ${featured ? `
              <div class="featured-badge">
                <i class="fa-solid fa-star"></i>
                مميز
              </div>
            ` : ""}

            ${verified ? `
              <div class="verified-badge">
                <i class="fa-solid fa-shield-halved"></i>
                موثّق
              </div>
            ` : ""}
          </div>

          <div class="worker-content">
            <h3>${name}</h3>

            ${renderVerifiedTrustLine(worker)}

            ${renderRatingBadge(workerId)}

            <div class="worker-meta">
              <span>
                <i class="fa-solid fa-screwdriver-wrench"></i>
                ${trade}
              </span>

              <span>
                <i class="fa-solid fa-location-dot"></i>
                ${area}
              </span>
            </div>

            <p class="worker-desc">${description}</p>

            <div class="worker-actions">
              <a href="${phoneLink}" onclick="event.stopPropagation()" class="call-btn ${!callNumber ? "disabled" : ""}">
                <i class="fa-solid fa-phone"></i>
                اتصال
              </a>

              <a href="${whatsappLink}" target="_blank" onclick="event.stopPropagation()" class="whatsapp-btn ${!whatsappNumber ? "disabled" : ""}">
                <i class="fa-brands fa-whatsapp"></i>
                واتساب
              </a>
            </div>
          </div>
        `;

        workersGrid.appendChild(card);
      });
    }


    function setQuickTrade(tradeName, clickedButton, options) {
      const opts = options || {};
      const select = document.getElementById("tradeFilter");

      setTradeFilterValue(tradeName);
      setAreaFilterValue("");

      document.querySelectorAll(".quick-trade-btn").forEach(btn => {
        btn.classList.remove("active");
      });

      if (clickedButton) {
        clickedButton.classList.add("active");
      }

      if (!opts.skipUrlUpdate) {
        updateTradeUrl(select.value.trim(), false);
      }

      filterWorkers();

      const workersSection = document.getElementById("workers");
      if (workersSection) {
        workersSection.scrollIntoView({
          behavior: "smooth",
          block: "start"
        });
      }
    }

    function updateQuickTradeActiveState() {
      const selectedTrade = document.getElementById("tradeFilter").value.trim();

      document.querySelectorAll(".quick-trade-btn").forEach(btn => {
        btn.classList.remove("active");

        const text = btn.textContent.trim();

        if (selectedTrade && text.includes(selectedTrade)) {
          btn.classList.add("active");
        }

        if (!selectedTrade && text === "الكل") {
          btn.classList.add("active");
        }
      });

      updateTradeIconsActiveState();
    }

    function filterWorkers() {
      const searchValue = document.getElementById("searchInput").value.trim().toLowerCase();
      const selectedTradeRaw = document.getElementById("tradeFilter").value.trim();
      const selectedTrade = normalizeText(selectedTradeRaw);
      const selectedAreaRaw = document.getElementById("areaFilter").value.trim();
      const selectedArea = normalizeText(selectedAreaRaw);
      const featuredOnly = document.getElementById("featuredOnlyFilter")?.checked || false;
      const verifiedOnly = document.getElementById("verifiedOnlyFilter")?.checked || false;

      const filtered = allWorkers.filter(worker => {
        const name = getWorkerName(worker).toLowerCase();
        const trade = getWorkerTrade(worker).toLowerCase();
        const tradeNormalized = normalizeText(getWorkerTrade(worker));
        const area = getWorkerArea(worker).toLowerCase();
        const areaNormalized = normalizeText(getWorkerArea(worker));
        const description = getWorkerDescription(worker).toLowerCase();

        const matchesSearch =
          name.includes(searchValue) ||
          trade.includes(searchValue) ||
          area.includes(searchValue) ||
          description.includes(searchValue);

        const matchesTrade =
          selectedTrade === "" || tradeNormalized === selectedTrade;

        const matchesArea =
          selectedArea === "" || areaNormalized === selectedArea;

        const matchesFeatured =
          !featuredOnly || isFeatured(worker);

        const matchesVerified =
          !verifiedOnly || isVerified(worker);

        return matchesSearch && matchesTrade && matchesArea && matchesFeatured && matchesVerified;
      });

      const sorted = sortWorkers(filtered);

      updateQuickTradeActiveState();
      updateTradeIconsActiveState();
      updateAreaIconsActiveState();
      updateWorkersHeading(selectedTradeRaw, selectedAreaRaw, sorted.length);
      renderWorkers(sorted);
    }

    function clearFilters() {
      document.getElementById("searchInput").value = "";
      document.getElementById("tradeFilter").value = "";
      document.getElementById("areaFilter").value = "";
      document.getElementById("sortFilter").value = "default";
      const featuredOnlyFilter = document.getElementById("featuredOnlyFilter");
      if (featuredOnlyFilter) featuredOnlyFilter.checked = false;
      const verifiedOnlyFilter = document.getElementById("verifiedOnlyFilter");
      if (verifiedOnlyFilter) verifiedOnlyFilter.checked = false;
      updateListingUrl("", "", false);
      updateQuickTradeActiveState();
      updateTradeIconsActiveState();
      updateAreaIconsActiveState();
      updateWorkersHeading("", "", allWorkers.length);
      renderWorkers(allWorkers);
    }

    async function initPage() {
      await loadTrades();
      await loadAreas();
      await loadWorkers();
      applyFilterFromUrl();
    }

    initPage();
  