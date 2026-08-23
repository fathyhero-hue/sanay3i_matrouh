// مركز خدمة العملاء والدعم (بند 22.8) - أيقونة سماعة بجانب جرس الإشعارات،
// بتفتح Bottom Sheet فيه محادثاتي/فتح محادثة جديدة (مفيش رقم اتصال/واتساب
// حقيقي متاح في المشروع حاليًا، فمفيش أي رقم مُخترع - لو اتضاف رقم رسمي
// لاحقًا يتحط في SUPPORT_PHONE/SUPPORT_WHATSAPP تحت وهيظهر تلقائيًا).
// نفس السياق (عميل/صنايعي) بيتحدد تلقائيًا من جلسة localStorage الحالية.
(function () {
  var supportChannels = { phone: "", whatsapp: "", working_hours: "" };
  var TICKET_TYPES = { technical: "مشكلة تقنية", account: "الحساب", worker_issue: "مشكلة مع صنايعي", payment: "الدفع والاشتراك", other: "أخرى" };
  var STATUS_LABELS = { new: "مفتوحة", in_progress: "قيد المتابعة", resolved: "تم الحل", closed: "مغلقة" };
  var badgePollTimer = null;

  async function fetchSupportChannels() {
    try {
      var r = await fetch("/api/support-chat/channels");
      var d = await r.json().catch(function () { return {}; });
      if (d.success && d.channels) supportChannels = d.channels;
    } catch (e) {}
  }

  function getContext() {
    var customerToken = localStorage.getItem("sanay3i_customer_token");
    if (customerToken) return { type: "customer", token: customerToken, base: "/api/support-chat/tickets" };
    var workerToken = localStorage.getItem("sanay3i_worker_token");
    var workerId = localStorage.getItem("sanay3i_current_worker_id");
    if (workerToken && workerId) return { type: "worker", token: workerToken, base: "/api/support-chat/worker/" + workerId + "/tickets" };
    return null;
  }
  function authHeaders(ctx) { return { Authorization: "Bearer " + ctx.token }; }
  function escapeHtml(v) { return String(v || "").replace(/[&<>"']/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]; }); }
  function timeLabel(iso) { try { return new Date(iso).toLocaleString("ar-EG", { hour: "2-digit", minute: "2-digit", day: "numeric", month: "short" }); } catch (e) { return ""; } }

  function ensureSheetMarkup() {
    if (document.getElementById("supportSheet")) return;
    var wrap = document.createElement("div");
    wrap.innerHTML =
      '<div class="support-overlay" id="supportSheetOverlay">' +
      '  <div class="support-modal" id="supportSheet" role="dialog" aria-modal="true" aria-labelledby="supportSheetHeaderTitle">' +
      '    <div class="support-modal-header">' +
      '      <button type="button" class="support-modal-back-btn" id="supportSheetBackBtn" style="display:none;" aria-label="رجوع"><i class="fa-solid fa-arrow-right"></i></button>' +
      '      <h3 class="support-modal-header-title" id="supportSheetHeaderTitle"><i class="fa-solid fa-headset"></i> <span>مركز المساعدة</span></h3>' +
      '      <button type="button" class="support-modal-close-btn" id="supportSheetCloseBtn" aria-label="إغلاق"><i class="fa-solid fa-xmark"></i></button>' +
      "    </div>" +
      '    <div class="support-modal-body" id="supportSheetBody"></div>' +
      "  </div>" +
      "</div>";
    document.body.appendChild(wrap);
    document.getElementById("supportSheetOverlay").addEventListener("click", function (e) {
      if (e.target === e.currentTarget) closeSheet();
    });
    document.getElementById("supportSheetCloseBtn").addEventListener("click", closeSheet);
  }

  // بيحدّث عنوان الهيدر الثابت وزرار الرجوع (بدل ما كل شاشة كانت بترسم
  // عنوانها جوه المحتوى القابل للسكرول - العنوان دلوقتي ثابت مش بيتحرك)
  function setHeader(titleHtml, onBack) {
    var titleEl = document.getElementById("supportSheetHeaderTitle");
    var backBtn = document.getElementById("supportSheetBackBtn");
    if (titleEl) titleEl.innerHTML = '<i class="fa-solid fa-headset"></i> <span>' + titleHtml + "</span>";
    if (backBtn) {
      if (onBack) {
        backBtn.style.display = "";
        backBtn.onclick = onBack;
      } else {
        backBtn.style.display = "none";
        backBtn.onclick = null;
      }
    }
  }

  function openSheet(ctx) {
    ensureSheetMarkup();
    document.getElementById("supportSheetOverlay").classList.add("show");
    document.getElementById("supportSheet").classList.add("show");
    document.body.style.overflow = "hidden";
    renderMenu(ctx);
  }
  function closeSheet() {
    var ov = document.getElementById("supportSheetOverlay"), sh = document.getElementById("supportSheet");
    if (ov) ov.classList.remove("show");
    if (sh) sh.classList.remove("show");
    document.body.style.overflow = "";
    stopConvPolling();
  }

  var convPollTimer = null;
  var convLastHash = "";
  function stopConvPolling() { clearInterval(convPollTimer); convPollTimer = null; }
  function startConvPolling(ctx, id) {
    stopConvPolling();
    convPollTimer = setInterval(function () {
      if (document.visibilityState !== "visible") return;
      renderTicketDetail(ctx, id, true);
    }, 5000);
  }

  function supportCard(opts) {
    // opts: { id, href, target, icon, title, subtitle }
    var tag = opts.href ? "a" : "button";
    var attrs = opts.id ? ' id="' + opts.id + '"' : "";
    attrs += opts.href ? ' href="' + opts.href + '"' : ' type="button"';
    if (opts.target) attrs += ' target="' + opts.target + '"';
    return "<" + tag + ' class="support-modal-item"' + attrs + ">" +
      '<span class="support-modal-item-icon"><i class="' + opts.icon + '"></i></span>' +
      '<span class="support-modal-item-text"><strong>' + opts.title + "</strong><small>" + opts.subtitle + "</small></span>" +
      '<span class="support-modal-item-arrow"><i class="fa-solid fa-chevron-left"></i></span>' +
      "</" + tag + ">";
  }

  function renderMenu(ctx) {
    var body = document.getElementById("supportSheetBody");
    setHeader("مركز المساعدة", null);
    var rows = [];
    rows.push('<div class="support-modal-intro"><h4>كيف نقدر نساعدك؟</h4><p>تواصل مع فريق الدعم أو تابع محادثاتك السابقة.</p></div>');
    rows.push(supportCard({ id: "supportMyTicketsBtn", icon: "fa-solid fa-message", title: "محادثاتي", subtitle: "تابع ردود فريق الدعم" }));
    rows.push(supportCard({ id: "supportOpenTicketBtn", icon: "fa-solid fa-plus", title: "فتح محادثة جديدة", subtitle: "ابدأ طلب مساعدة جديد" }));
    if (supportChannels.phone) {
      rows.push(supportCard({
        href: "tel:" + escapeHtml(supportChannels.phone), icon: "fa-solid fa-phone",
        title: "اتصال بخدمة العملاء",
        subtitle: supportChannels.working_hours ? escapeHtml(supportChannels.working_hours) : "تواصل مباشر هاتفيًا"
      }));
    }
    if (supportChannels.whatsapp) {
      rows.push(supportCard({
        href: "https://wa.me/" + encodeURIComponent(supportChannels.whatsapp), target: "_blank",
        icon: "fa-brands fa-whatsapp", title: "تواصل عبر واتساب", subtitle: "رد سريع عبر واتساب"
      }));
    }
    body.innerHTML = rows.join("");
    var openBtn = document.getElementById("supportOpenTicketBtn");
    if (openBtn) openBtn.addEventListener("click", function () { renderNewTicketForm(ctx); });
    var myBtn = document.getElementById("supportMyTicketsBtn");
    if (myBtn) myBtn.addEventListener("click", function () { renderMyTickets(ctx); });
  }

  function renderNewTicketForm(ctx) {
    if (!ctx) { renderLoginNeeded(); return; }
    var body = document.getElementById("supportSheetBody");
    setHeader("محادثة دعم جديدة", function () { renderMenu(ctx); });
    body.innerHTML =
      '<form id="supportTicketForm" class="support-ticket-form">' +
      '  <label>نوع المشكلة<select id="supportTicketType">' + Object.keys(TICKET_TYPES).map(function (k) { return '<option value="' + k + '">' + TICKET_TYPES[k] + "</option>"; }).join("") + "</select></label>" +
      '  <label>العنوان<input id="supportTicketTitle" type="text" maxlength="150" placeholder="عنوان مختصر للمشكلة" required></label>' +
      '  <label>الوصف<textarea id="supportTicketDesc" maxlength="1000" placeholder="اشرح المشكلة بالتفصيل" required></textarea></label>' +
      '  <label>مرفق صورة (اختياري)<input id="supportTicketFile" type="file" accept="image/jpeg,image/png,image/webp"></label>' +
      '  <button type="submit" class="support-modal-submit">إرسال</button>' +
      '  <div id="supportTicketMsg" class="support-ticket-msg"></div>' +
      "</form>";
    document.getElementById("supportTicketForm").addEventListener("submit", function (e) { submitTicket(e, ctx); });
  }

  async function submitTicket(e, ctx) {
    e.preventDefault();
    var msgEl = document.getElementById("supportTicketMsg");
    var btn = e.target.querySelector("button[type=submit]");
    var fd = new FormData();
    fd.append("ticket_type", document.getElementById("supportTicketType").value);
    fd.append("title", document.getElementById("supportTicketTitle").value.trim());
    fd.append("description", document.getElementById("supportTicketDesc").value.trim());
    var file = document.getElementById("supportTicketFile").files[0];
    if (file) fd.append("attachment", file);

    btn.disabled = true; btn.textContent = "جاري الإرسال...";
    try {
      var r = await fetch(ctx.base, { method: "POST", headers: authHeaders(ctx), body: fd });
      var d = await r.json().catch(function () { return {}; });
      if (!r.ok || !d.success) throw new Error(d.error || "تعذر الإرسال");
      msgEl.textContent = "تم إرسال رسالتك بنجاح، هنراجعها ونرد عليك قريبًا.";
      msgEl.className = "support-ticket-msg success";
      setTimeout(function () { renderMyTickets(ctx); }, 900);
    } catch (err) {
      msgEl.textContent = err.message || "تعذر الإرسال";
      msgEl.className = "support-ticket-msg error";
    } finally {
      btn.disabled = false; btn.textContent = "إرسال";
    }
  }

  function renderLoginNeeded() {
    var body = document.getElementById("supportSheetBody");
    setHeader("مركز المساعدة", function () { renderMenu(null); });
    body.innerHTML =
      '<div class="support-empty"><i class="fa-solid fa-lock"></i><p>سجّل دخولك الأول عشان تقدر تفتح محادثة دعم أو تتابع محادثاتك.</p><a href="/account" class="support-modal-submit" style="text-decoration:none;display:block;text-align:center;">تسجيل الدخول</a></div>';
  }

  async function renderMyTickets(ctx) {
    if (!ctx) { renderLoginNeeded(); return; }
    var body = document.getElementById("supportSheetBody");
    setHeader("محادثاتي", function () { renderMenu(ctx); });
    body.innerHTML =
      '<div id="supportTicketsList" class="support-empty"><i class="fa-solid fa-spinner fa-spin"></i> جاري التحميل...</div>';
    try {
      var listUrl = ctx.type === "worker" ? ctx.base : ctx.base + "/mine";
      var r = await fetch(listUrl, { headers: authHeaders(ctx) });
      var d = await r.json().catch(function () { return {}; });
      var listEl = document.getElementById("supportTicketsList");
      if (!r.ok || !d.success) throw new Error(d.error || "تعذر التحميل");
      var tickets = (d.tickets || []).sort(function (a, b) { return new Date(b.last_message_at) - new Date(a.last_message_at); });
      if (!tickets.length) { listEl.innerHTML = "لا توجد محادثات دعم حتى الآن."; listEl.className = "support-empty"; return; }
      listEl.className = "support-tickets-list";
      listEl.innerHTML = tickets.map(function (t) {
        var dimmed = (t.status === "resolved" || t.status === "closed") && !(t.unread_count > 0);
        return '<div class="support-ticket-item' + (t.unread_count > 0 ? " unread" : "") + (dimmed ? " is-closed" : "") + '" data-id="' + t.id + '">' +
          '<div class="support-ticket-item-top"><strong>' + escapeHtml(t.title) + '</strong><span class="support-status-badge status-' + t.status + '">' + STATUS_LABELS[t.status] + "</span></div>" +
          '<div class="support-ticket-item-bottom"><span class="support-ticket-item-meta">' + escapeHtml(t.ticket_type_label) + "</span><span class=\"support-ticket-item-time\">" + timeLabel(t.last_message_at) + "</span></div>" +
          (t.unread_count > 0 ? '<span class="support-unread-dot"></span>' : "") +
          "</div>";
      }).join("");
      listEl.querySelectorAll(".support-ticket-item").forEach(function (el) {
        el.addEventListener("click", function () { renderTicketDetail(ctx, el.getAttribute("data-id")); });
      });
    } catch (err) {
      var listEl2 = document.getElementById("supportTicketsList");
      if (listEl2) { listEl2.textContent = err.message; listEl2.className = "support-empty"; }
    }
  }

  async function renderTicketDetail(ctx, id, silent) {
    var body = document.getElementById("supportSheetBody");
    if (!silent) {
      setHeader("محادثة الدعم", function () { stopConvPolling(); renderMyTickets(ctx); });
      body.innerHTML = '<div id="supportTicketDetail" class="support-empty"><i class="fa-solid fa-spinner fa-spin"></i> جاري التحميل...</div>';
    }
    try {
      var detailUrl = ctx.type === "worker" ? ctx.base + "/" + id : ctx.base + "/" + id;
      var r = await fetch(detailUrl, { headers: authHeaders(ctx) });
      var d = await r.json().catch(function () { return {}; });
      if (!r.ok || !d.success) throw new Error(d.error || "تعذر التحميل");
      var t = d.ticket, msgs = d.messages || [];
      var hash = JSON.stringify(msgs.map(function (m) { return m.id; })) + "|" + t.status;
      if (silent && hash === convLastHash) return;
      convLastHash = hash;
      var msgsBoxOld = document.getElementById("supportTicketMsgs");
      var wasAtBottom = msgsBoxOld ? (msgsBoxOld.scrollHeight - msgsBoxOld.scrollTop - msgsBoxOld.clientHeight < 40) : true;

      if (!silent) setHeader(escapeHtml(t.title), function () { stopConvPolling(); renderMyTickets(ctx); });
      var html = '<span class="support-status-badge status-' + t.status + '">' + STATUS_LABELS[t.status] + "</span>";
      if (t.has_attachment) html += '<button type="button" id="supportAttachBtn" class="support-modal-item" style="margin-top:10px;"><i class="fa-solid fa-paperclip"></i> عرض المرفق</button>';
      html += '<div class="support-ticket-msgs" id="supportTicketMsgs">' + msgs.map(function (m) {
        if (m.is_system) return '<div class="support-msg-system">' + escapeHtml(m.message_text) + "</div>";
        var mine = m.sender_type === ctx.type;
        return '<div class="support-msg ' + (mine ? "mine" : "them") + '"><p>' + escapeHtml(m.message_text) + '</p><span class="support-msg-time">' + timeLabel(m.created_at) + "</span></div>";
      }).join("") + "</div>";
      html += '<form id="supportReplyForm" class="support-reply-form"><input id="supportReplyInput" type="text" placeholder="اكتب ردًا..." required autocomplete="off"><button type="submit"><i class="fa-solid fa-paper-plane"></i></button></form>';
      document.getElementById("supportTicketDetail").outerHTML = '<div id="supportTicketDetail">' + html + "</div>";
      var msgsBox = document.getElementById("supportTicketMsgs");
      if (msgsBox && (!silent || wasAtBottom)) msgsBox.scrollTop = msgsBox.scrollHeight;
      var attachBtn = document.getElementById("supportAttachBtn");
      if (attachBtn) attachBtn.addEventListener("click", async function () {
        try {
          var ar = await fetch(detailUrl + "/attachment", { headers: authHeaders(ctx) });
          var ad = await ar.json().catch(function () { return {}; });
          if (ad.success && ad.url) window.open(ad.url, "_blank");
        } catch (e) {}
      });
      document.getElementById("supportReplyForm").addEventListener("submit", async function (e) {
        e.preventDefault();
        var input = document.getElementById("supportReplyInput");
        var message = input.value.trim();
        if (!message) return;
        input.disabled = true;
        try {
          await fetch(detailUrl + "/reply", { method: "POST", headers: Object.assign({ "Content-Type": "application/json" }, authHeaders(ctx)), body: JSON.stringify({ message: message }) });
          renderTicketDetail(ctx, id);
        } catch (err) { input.disabled = false; }
      });
      if (!silent) startConvPolling(ctx, id);
    } catch (err) {
      var el = document.getElementById("supportTicketDetail");
      if (el) el.textContent = err.message;
    }
  }

  async function refreshSupportBadge(ctx) {
    var badge = document.getElementById("supportBellBadge");
    if (!badge || !ctx) return;
    try {
      var listUrl = ctx.type === "worker" ? ctx.base : ctx.base + "/mine";
      var r = await fetch(listUrl, { headers: authHeaders(ctx) });
      var d = await r.json().catch(function () { return {}; });
      var total = (d.tickets || []).reduce(function (sum, t) { return sum + (t.unread_count || 0); }, 0);
      if (total > 0) { badge.textContent = total > 9 ? "9+" : total; badge.style.display = "flex"; }
      else badge.style.display = "none";
    } catch (e) {}
  }

  var currentCtx = null;
  function openSupportSheet() { openSheet(currentCtx); }

  // زرار الدعم بيتحدد بـ data-support-trigger (مش id بس) عشان أي زرار تاني
  // بنفس الوظيفة في أي صفحة يشتغل تلقائيًا من غير ما يتكرر أي event listener.
  // البايندنج ده Delegated على document ومربوط مرة واحدة بس لكل تحميل صفحة،
  // فمفيش احتمال إن الكليك يفتح الشيت مرتين (double-open bug).
  var triggerListenerBound = false;
  function bindDelegatedTrigger() {
    if (triggerListenerBound) return;
    triggerListenerBound = true;
    document.addEventListener("click", function (event) {
      var trigger = event.target.closest && event.target.closest("[data-support-trigger]");
      if (!trigger) return;
      event.preventDefault();
      openSupportSheet();
    });
  }

  function init() {
    var ctx = getContext();
    currentCtx = ctx;
    bindDelegatedTrigger();
    var slot = document.getElementById("supportBellSlot");
    if (!slot) return;
    fetchSupportChannels();
    // Badge unread للدعم منفصل تمامًا عن notif-bell-badge (جرس الإشعارات
    // العام) - عنصر خاص بيه id مختلف رغم استخدام نفس تنسيق .notif-bell-badge
    slot.innerHTML = '<button type="button" id="supportBellBtn" class="notif-bell-btn support-bell-btn" data-support-trigger aria-label="خدمة العملاء"><i class="fa-solid fa-headset"></i><span id="supportBellBadge" class="notif-bell-badge" style="display:none;pointer-events:none;"></span></button>';

    if (ctx) {
      refreshSupportBadge(ctx);
      badgePollTimer = setInterval(function () {
        if (document.visibilityState !== "visible") return;
        refreshSupportBadge(ctx);
      }, 15000);
    }

    // فتح محادثة معيّنة تلقائيًا لو جاي من رابط إشعار رد الدعم (?support_conversation=id)
    var openId = new URLSearchParams(location.search).get("support_conversation");
    if (openId && ctx) { ensureSheetMarkup(); openSheet(ctx); renderTicketDetail(ctx, openId); }
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init);
  else init();
})();
