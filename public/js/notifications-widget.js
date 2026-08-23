// جرس الإشعارات الفعلي (بند 22.7) - عنصر واحد قابل لإعادة الاستخدام في كل
// صفحات العميل ولوحة الصنايعي. يكتشف نوع المستخدم تلقائيًا من localStorage
// الحالي (نفس مفاتيح الجلسة المستخدمة بالفعل في باقي الموقع) بدون أي نظام
// مصادقة موازٍ، ويعتمد على /api/notifications/* الجديد فقط.
(function () {
  function getContext() {
    var customerToken = localStorage.getItem("sanay3i_customer_token");
    if (customerToken) return { type: "customer", base: "/api/notifications/customer", token: customerToken };
    var workerToken = localStorage.getItem("sanay3i_worker_token");
    var workerId = localStorage.getItem("sanay3i_current_worker_id");
    if (workerToken && workerId) return { type: "worker", base: "/api/notifications/worker/" + workerId, token: workerToken };
    return null;
  }

  function authHeaders(ctx) {
    return { Authorization: "Bearer " + ctx.token };
  }

  function escapeHtml(v) {
    return String(v || "").replace(/[&<>"']/g, function (c) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c];
    });
  }

  function timeAgo(iso) {
    try {
      var diff = Date.now() - new Date(iso).getTime();
      var mins = Math.floor(diff / 60000);
      if (mins < 1) return "الآن";
      if (mins < 60) return mins + " دقيقة";
      var hrs = Math.floor(mins / 60);
      if (hrs < 24) return hrs + " ساعة";
      return Math.floor(hrs / 24) + " يوم";
    } catch (e) { return ""; }
  }

  async function fetchUnreadCount(ctx) {
    try {
      var r = await fetch(ctx.base + "/unread-count", { headers: authHeaders(ctx) });
      var d = await r.json().catch(function () { return {}; });
      return d.unread_count || 0;
    } catch (e) { return 0; }
  }

  async function fetchList(ctx) {
    try {
      var r = await fetch(ctx.base + "/list", { headers: authHeaders(ctx) });
      var d = await r.json().catch(function () { return {}; });
      return d.items || [];
    } catch (e) { return []; }
  }

  function updateBadge(count) {
    var badge = document.getElementById("notifBellBadge");
    if (!badge) return;
    if (count > 0) { badge.textContent = count > 99 ? "99+" : count; badge.style.display = "flex"; }
    else { badge.style.display = "none"; }
  }

  async function openPanel(ctx) {
    var panel = document.getElementById("notifPanel");
    if (!panel) return;
    panel.classList.add("show");
    panel.innerHTML = '<div class="notif-panel-head"><strong>الإشعارات</strong><button type="button" id="notifMarkAllBtn">تعليم الكل كمقروء</button></div><div class="notif-panel-list"><div class="empty-admin" style="padding:16px;">جاري التحميل...</div></div>';
    var items = await fetchList(ctx);
    var listEl = panel.querySelector(".notif-panel-list");
    if (!items.length) {
      listEl.innerHTML = '<div class="empty-admin" style="padding:16px;">لا توجد إشعارات حتى الآن.</div>';
    } else {
      listEl.innerHTML = items.map(function (n) {
        return '<div class="notif-item' + (n.is_read ? "" : " unread") + '" data-id="' + n.id + '" data-link="' + escapeHtml(n.link || "") + '">' +
          '<div class="notif-item-title">' + escapeHtml(n.title) + "</div>" +
          (n.body ? '<div class="notif-item-body">' + escapeHtml(n.body) + "</div>" : "") +
          '<div class="notif-item-time">' + timeAgo(n.created_at) + "</div>" +
          "</div>";
      }).join("");
    }
    listEl.querySelectorAll(".notif-item").forEach(function (el) {
      el.addEventListener("click", async function () {
        var id = el.getAttribute("data-id");
        var link = el.getAttribute("data-link");
        try { await fetch(ctx.base + "/" + id + "/read", { method: "PATCH", headers: authHeaders(ctx) }); } catch (e) {}
        if (link) window.location.href = link;
        else { el.classList.remove("unread"); refreshBadge(ctx); }
      });
    });
    var markAllBtn = document.getElementById("notifMarkAllBtn");
    if (markAllBtn) markAllBtn.addEventListener("click", async function () {
      try { await fetch(ctx.base + "/read-all", { method: "PATCH", headers: authHeaders(ctx) }); } catch (e) {}
      listEl.querySelectorAll(".notif-item.unread").forEach(function (el) { el.classList.remove("unread"); });
      updateBadge(0);
    });
  }

  function closePanel() {
    var panel = document.getElementById("notifPanel");
    if (panel) panel.classList.remove("show");
  }

  async function refreshBadge(ctx) {
    updateBadge(await fetchUnreadCount(ctx));
  }

  function init() {
    var ctx = getContext();
    if (!ctx) return;

    // لو الصفحة فيها زرار جرس جاهز أصلًا (#notificationBtn في الرئيسية
    // مثلًا) بنستخدمه هو نفسه بدل ما نضيف زرار جديد - نضيف بس الـBadge
    // والـPanel اللي كانوا ناقصين
    var existingBtn = document.getElementById("notificationBtn");
    var slot = document.getElementById("notifBellSlot");
    var bellBtn;
    if (existingBtn) {
      existingBtn.id = "notifBellBtn";
      existingBtn.classList.add("notif-bell-btn");
      if (!existingBtn.querySelector("#notifBellBadge")) {
        existingBtn.insertAdjacentHTML("beforeend", '<span id="notifBellBadge" class="notif-bell-badge" style="display:none;"></span>');
      }
      if (!document.getElementById("notifPanel")) {
        existingBtn.insertAdjacentHTML("afterend", '<div id="notifPanel" class="notif-panel"></div>');
      }
      bellBtn = document.getElementById("notifBellBtn");
    } else if (slot) {
      slot.innerHTML = '<button type="button" id="notifBellBtn" class="notif-bell-btn" aria-label="الإشعارات"><i class="fa-solid fa-bell"></i><span id="notifBellBadge" class="notif-bell-badge" style="display:none;"></span></button><div id="notifPanel" class="notif-panel"></div>';
      bellBtn = document.getElementById("notifBellBtn");
    } else {
      return;
    }

    refreshBadge(ctx);
    setInterval(function () { refreshBadge(ctx); }, 60000);
    document.getElementById("notifBellBtn").addEventListener("click", function (e) {
      e.stopPropagation();
      var panel = document.getElementById("notifPanel");
      if (panel.classList.contains("show")) closePanel();
      else openPanel(ctx);
    });
    document.addEventListener("click", function (e) {
      var panel = document.getElementById("notifPanel");
      if (panel && panel.classList.contains("show") && !panel.contains(e.target) && e.target.id !== "notifBellBtn" && !e.target.closest("#notifBellBtn")) closePanel();
    });
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init);
  else init();
})();
