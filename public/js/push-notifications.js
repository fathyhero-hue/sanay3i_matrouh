// عنصر "تفعيل إشعارات الجهاز" قابل لإعادة الاستخدام - عميل/صنايعي/إدارة.
// لا يطلب Notification.requestPermission() تلقائيًا أبدًا؛ فقط عند ضغط
// المستخدم صراحة على الزر. هذا ملف إضافي بحت فوق نظام الإشعارات الداخلي
// الحالي (notifications-widget.js) ولا يمسّه.
(function () {
  function base64UrlToUint8Array(base64String) {
    var padding = '='.repeat((4 - (base64String.length % 4)) % 4);
    var base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
    var rawData = atob(base64);
    var outputArray = new Uint8Array(rawData.length);
    for (var i = 0; i < rawData.length; ++i) outputArray[i] = rawData.charCodeAt(i);
    return outputArray;
  }

  // يحدد سياق الاشتراك (نوع المستخدم + مسار API + هيدر التوثيق) حسب الجلسة
  // الحالية - إما تلقائي من localStorage (عميل/صنايعي) أو صريح (إدارة، لأن
  // توثيقها بكوكي فقط بدون Authorization header)
  function resolveContext(explicitRole) {
    if (explicitRole === 'admin') {
      return { subscribeUrl: '/api/push/subscribe/admin', unsubscribeUrl: '/api/push/unsubscribe/admin', headers: {} };
    }
    var customerToken = localStorage.getItem('sanay3i_customer_token');
    if (customerToken) {
      return {
        subscribeUrl: '/api/push/subscribe/customer',
        unsubscribeUrl: '/api/push/unsubscribe/customer',
        headers: { Authorization: 'Bearer ' + customerToken }
      };
    }
    var workerToken = localStorage.getItem('sanay3i_worker_token');
    var workerId = localStorage.getItem('sanay3i_current_worker_id');
    if (workerToken && workerId) {
      return {
        subscribeUrl: '/api/push/subscribe/worker/' + workerId,
        unsubscribeUrl: '/api/push/unsubscribe/worker/' + workerId,
        headers: { Authorization: 'Bearer ' + workerToken }
      };
    }
    return null;
  }

  // مقارنة Byte-for-byte بين مفتاحين (ArrayBuffer/Uint8Array) - بنستخدمها
  // للتأكد إن الـ subscription الموجود في المتصفح لسه مرتبط فعليًا بمفتاح
  // VAPID الحالي، مش بمفتاح قديم اتغيّر من على السيرفر
  function sameKey(a, b) {
    if (!a || !b) return false;
    var ua = a instanceof ArrayBuffer ? new Uint8Array(a) : new Uint8Array(a.buffer || a);
    var ub = b instanceof ArrayBuffer ? new Uint8Array(b) : new Uint8Array(b.buffer || b);
    if (ua.length !== ub.length) return false;
    for (var i = 0; i < ua.length; i++) {
      if (ua[i] !== ub[i]) return false;
    }
    return true;
  }

  async function subscribeToPush(ctx) {
    // بعض الصفحات (حسابي/لوحة الصنايعي/لوحة الإدارة) ما بتسجّلش الـ Service
    // Worker بنفسها (بيتسجل من index.html/status.html/worker.html بس) -
    // بنتأكد هنا إنه مسجّل قبل ما نستنى .ready، عشان معلقش لو المستخدم دخل
    // الصفحة دي مباشرة من غير ما يمر بصفحة بتسجله
    var existingReg = await navigator.serviceWorker.getRegistration();
    if (!existingReg) await navigator.serviceWorker.register('/service-worker.js');
    var reg = await navigator.serviceWorker.ready;
    console.log('[PUSH] sw-ready');

    var keyRes = await fetch('/api/push/public-key');
    var keyData = await keyRes.json();
    if (!keyData.publicKey) throw new Error('لا يوجد مفتاح عام متاح');
    var currentKeyBytes = base64UrlToUint8Array(keyData.publicKey);

    var existing = await reg.pushManager.getSubscription();
    var sub = existing;

    if (existing) {
      // لازم نتأكد إن الـ subscription الموجود لسه مرتبط بنفس المفتاح
      // الحالي - لو المفتاح اتغيّر على السيرفر (VAPID rotation) أو تعذّر
      // التحقق أصلًا، الاشتراك القديم بقى عديم الفائدة ولازم نستبدله
      var existingKey = null;
      try { existingKey = existing.options && existing.options.applicationServerKey; } catch (e) { existingKey = null; }
      var matches = existingKey ? sameKey(existingKey, currentKeyBytes) : false;

      if (!matches) {
        console.log('[PUSH] existing/new: stale key, resubscribing');
        try { await existing.unsubscribe(); } catch (e) { /* تجاهل - هنعمل subscribe جديد بغض النظر */ }
        sub = await reg.pushManager.subscribe({
          userVisibleOnly: true,
          applicationServerKey: currentKeyBytes
        });
      } else {
        console.log('[PUSH] existing/new: existing subscription valid');
      }
    } else {
      console.log('[PUSH] existing/new: creating new subscription');
      sub = await reg.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: currentKeyBytes
      });
    }

    // مهم: وجود subscription في المتصفح لا يعني وجوده في قاعدة البيانات
    // (ممكن يكون اتحذف من السيرفر لأي سبب بينما المتصفح لسه محتفظ بيه) -
    // فبنعمل POST/Upsert دايمًا هنا، حتى لو الاشتراك الحالي كان صالح أصلًا
    var subJson = sub.toJSON();
    var res = await fetch(ctx.subscribeUrl, {
      method: 'POST',
      headers: Object.assign({ 'Content-Type': 'application/json' }, ctx.headers),
      body: JSON.stringify({
        endpoint: subJson.endpoint,
        keys: subJson.keys,
        user_agent: navigator.userAgent
      })
    });
    var out = await res.json().catch(function () { return {}; });
    if (!res.ok || !out.success) {
      console.log('[PUSH] server-sync fail');
      throw new Error(out.error || 'تعذر تفعيل الإشعارات');
    }
    console.log('[PUSH] server-sync success');
    return true;
  }

  // ينشئ زر "تفعيل إشعارات الجهاز" داخل العنصر المحدد بـ containerId.
  // role: 'customer' | 'worker' | 'admin' (اختياري - يُكتشف تلقائيًا لو
  // اتسيب فاضي لعميل/صنايعي)
  function initPushToggle(containerId, role) {
    var container = document.getElementById(containerId);
    if (!container) return;

    if (!('serviceWorker' in navigator) || !('PushManager' in window)) {
      container.innerHTML = '<p class="push-toggle-note">إشعارات الجهاز غير مدعومة على هذا المتصفح.</p>';
      return;
    }

    container.innerHTML =
      '<button type="button" id="pushEnableBtn" class="push-toggle-btn">' +
      '<i class="fa-solid fa-bell"></i> تفعيل إشعارات الجهاز</button>' +
      '<p class="push-toggle-note" id="pushToggleNote" style="display:none;"></p>';

    var btn = document.getElementById('pushEnableBtn');
    var note = document.getElementById('pushToggleNote');

    function showNote(text) {
      note.textContent = text;
      note.style.display = 'block';
    }

    if (Notification && Notification.permission === 'granted') {
      btn.textContent = 'إشعارات الجهاز مفعّلة';
      btn.disabled = true;
    }

    btn.addEventListener('click', async function () {
      var ctx = resolveContext(role);
      if (!ctx) { showNote('يجب تسجيل الدخول أولاً لتفعيل إشعارات الجهاز.'); return; }

      if (!('Notification' in window)) { showNote('هذا المتصفح لا يدعم إشعارات الجهاز.'); return; }

      btn.disabled = true;
      try {
        var permission = await Notification.requestPermission();
        console.log('[PUSH] permission:', permission);
        if (permission !== 'granted') {
          showNote('تم رفض الإذن. يمكنك تفعيله لاحقًا من إعدادات المتصفح/الجهاز.');
          btn.disabled = false;
          return;
        }
        await subscribeToPush(ctx);
        btn.textContent = 'إشعارات الجهاز مفعّلة';
        showNote('تم تفعيل إشعارات الجهاز بنجاح');
      } catch (e) {
        showNote('تعذر تفعيل الإشعارات، حاول مرة أخرى.');
        btn.disabled = false;
      }
    });
  }

  // لو الصفحة كانت مفتوحة بالفعل والـ Service Worker ركّز عليها بدل ما يفتح
  // تاب جديد (نفس origin)، بيبعتلها الرابط المستهدف عشان تتنقل جوّها بنفسها
  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.addEventListener('message', function (event) {
      if (event.data && event.data.type === 'push-notification-click' && event.data.url) {
        if (window.location.pathname + window.location.search !== event.data.url) {
          window.location.href = event.data.url;
        }
      }
    });
  }

  window.initPushToggle = initPushToggle;
})();
