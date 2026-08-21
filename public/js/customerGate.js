// بوابة تسجيل بسيطة (اسم + رقم بس) قبل إظهار رقم صنايعي أو أي وسيلة تواصل
// مباشرة - مشتركة بين index.html وworker.html عشان منكررش نفس المنطق.
// بتستخدم نفس نظام حساب العميل الموجود بالفعل (customer JWT في localStorage)
// اللي نظام "اطلب خدمة"/"طلباتي" شغال بيه، فمين ما سجّل من هنا يقدر يستخدمهم كمان.
(function () {
  const TOKEN_KEY = "sanay3i_customer_token";
  const NAME_KEY = "sanay3i_customer_name";
  const ID_KEY = "sanay3i_customer_id";
  const APP_OPEN_FLAG = "sanay3i_app_open_tracked";

  function getCustomerToken() { return localStorage.getItem(TOKEN_KEY) || ""; }
  function getCustomerName() { return localStorage.getItem(NAME_KEY) || ""; }
  function isIdentified() { return !!getCustomerToken(); }

  function saveCustomerSession(customer, token) {
    localStorage.setItem(TOKEN_KEY, token);
    localStorage.setItem(ID_KEY, customer.id);
    localStorage.setItem(NAME_KEY, customer.name);
  }

  function clearCustomerSession() {
    localStorage.removeItem(TOKEN_KEY);
    localStorage.removeItem(ID_KEY);
    localStorage.removeItem(NAME_KEY);
  }

  // تتبع حدث عام - customer_id بيتحدد من التوكن على السيرفر لو موجود، من غير
  // ما نبعته إحنا من هنا؛ الاستدعاء آمن حتى لو مفيش توكن (زائر غير مسجل)
  function trackEvent(eventType, extra) {
    try {
      const token = getCustomerToken();
      const payload = Object.assign({ event_type: eventType, page_path: location.pathname }, extra || {});
      const headers = { "Content-Type": "application/json" };
      if (token) headers["Authorization"] = "Bearer " + token;
      fetch("/api/analytics/track", { method: "POST", headers, body: JSON.stringify(payload), keepalive: true }).catch(() => { /* تتبع أفضل جهد بس - تجاهل الفشل */ });
    } catch (e) { /* تجاهل */ }
  }

  let modalEl = null;
  let pendingCallback = null;

  function buildModal() {
    if (modalEl) return modalEl;
    modalEl = document.createElement("div");
    modalEl.className = "gate-modal-overlay";
    modalEl.innerHTML = `
      <div class="gate-modal-box">
        <div class="gate-modal-icon"><i class="fa-solid fa-user-check"></i></div>
        <h3>سجّل بياناتك للمتابعة</h3>
        <p>اسمك ورقم هاتفك عشان تقدر تشوف رقم الصنايعي وتتواصل معاه مباشرة.</p>
        <form id="gateModalForm">
          <input type="text" id="gateModalName" placeholder="اسمك بالكامل" required maxlength="100">
          <input type="tel" id="gateModalPhone" placeholder="01xxxxxxxxx" required maxlength="20">
          <button type="submit" id="gateModalSubmitBtn"><i class="fa-solid fa-arrow-left"></i> متابعة</button>
          <div class="gate-modal-message" id="gateModalMessage"></div>
        </form>
        <button type="button" class="gate-modal-cancel" id="gateModalCancelBtn">إلغاء</button>
      </div>`;
    document.body.appendChild(modalEl);

    modalEl.addEventListener("click", (e) => { if (e.target === modalEl) closeGateModal(); });
    modalEl.querySelector(".gate-modal-box").addEventListener("click", (e) => e.stopPropagation());
    modalEl.querySelector("#gateModalCancelBtn").addEventListener("click", closeGateModal);
    modalEl.querySelector("#gateModalForm").addEventListener("submit", onGateSubmit);
    return modalEl;
  }

  async function onGateSubmit(e) {
    e.preventDefault();
    const el = modalEl;
    const msg = el.querySelector("#gateModalMessage");
    const name = el.querySelector("#gateModalName").value.trim();
    const phone = el.querySelector("#gateModalPhone").value.trim();
    if (!name || !phone) return;

    const btn = el.querySelector("#gateModalSubmitBtn");
    btn.disabled = true;
    btn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> جاري التسجيل...';
    msg.className = "gate-modal-message";
    msg.innerHTML = "";

    try {
      const r = await fetch("/api/customers/identify", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, phone })
      });
      const d = await r.json().catch(() => ({}));

      if (!r.ok || !d.success) {
        msg.className = "gate-modal-message error";
        msg.innerHTML = d.requires_login
          ? 'هذا الرقم مسجل بحساب بالفعل - <a href="/customer-auth">سجّل دخولك من هنا</a>'
          : (d.error || "تعذر إتمام التسجيل");
        return;
      }

      saveCustomerSession(d.customer, d.token);
      const callback = pendingCallback;
      closeGateModal();
      if (callback) callback();
    } catch (err) {
      msg.className = "gate-modal-message error";
      msg.textContent = "تعذر الاتصال بالسيرفر، حاول تاني";
    } finally {
      btn.disabled = false;
      btn.innerHTML = '<i class="fa-solid fa-arrow-left"></i> متابعة';
    }
  }

  function openGateModal(onSuccess) {
    const el = buildModal();
    pendingCallback = onSuccess;
    el.querySelector("#gateModalForm").reset();
    el.querySelector("#gateModalMessage").className = "gate-modal-message";
    el.querySelector("#gateModalMessage").innerHTML = "";
    el.classList.add("show");
  }

  function closeGateModal() {
    if (modalEl) modalEl.classList.remove("show");
    pendingCallback = null;
  }

  // البوابة الأساسية: لو العميل متسجل يكمل على طول، غير كده يفتح نموذج
  // التسجيل البسيط وبعد نجاحه يكمل نفس الإجراء المطلوب تلقائيًا
  function ensureIdentified(onSuccess) {
    if (isIdentified()) { onSuccess(); return; }
    openGateModal(onSuccess);
  }

  // app_open مرة واحدة بس لكل تبويب/جلسة متصفح، مش مع كل تنقل بين الصفحات
  try {
    if (!sessionStorage.getItem(APP_OPEN_FLAG)) {
      sessionStorage.setItem(APP_OPEN_FLAG, "1");
      trackEvent("app_open", { source: "app_shell" });
    }
  } catch (e) { /* تجاهل - sessionStorage ممكن يبقى محظور في بعض المتصفحات */ }

  window.CustomerGate = {
    getCustomerToken,
    getCustomerName,
    isIdentified,
    saveCustomerSession,
    clearCustomerSession,
    trackEvent,
    ensureIdentified
  };
})();
