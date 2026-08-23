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

  // diag: دالة اختيارية (key, label, status, detail) بتحدّث UI التشخيص -
  // ممنوع تمامًا تمرير أي endpoint/p256dh/auth/token لها، فقط نصوص آمنة
  async function subscribeToPush(ctx, diag) {
    if (!diag) diag = function () {};

    // بعض الصفحات (حسابي/لوحة الصنايعي/لوحة الإدارة) ما بتسجّلش الـ Service
    // Worker بنفسها (بيتسجل من index.html/status.html/worker.html بس) -
    // بنتأكد هنا إنه مسجّل قبل ما نستنى .ready، عشان معلقش لو المستخدم دخل
    // الصفحة دي مباشرة من غير ما يمر بصفحة بتسجله
    var existingReg = await navigator.serviceWorker.getRegistration();
    if (!existingReg) await navigator.serviceWorker.register('/service-worker.js');
    var reg;
    try {
      reg = await navigator.serviceWorker.ready;
      console.log('[PUSH] sw-ready');
      diag('sw', 'Service Worker', 'ok', 'ready');
    } catch (e) {
      diag('sw', 'Service Worker', 'fail', 'failed');
      throw new Error('تعذّر تجهيز Service Worker');
    }

    var keyRes = await fetch('/api/push/public-key');
    var keyData = await keyRes.json().catch(function () { return {}; });
    if (!keyData.publicKey) {
      diag('key', 'المفتاح العام', 'fail', 'غير متاح (HTTP ' + keyRes.status + ')');
      throw new Error('لا يوجد مفتاح عام متاح');
    }
    var currentKeyBytes = base64UrlToUint8Array(keyData.publicKey);

    var existing = await reg.pushManager.getSubscription();
    diag('existing', 'اشتراك سابق على الجهاز', 'ok', existing ? 'existing' : 'none');
    var sub = existing;

    try {
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
      diag('subscribe', 'PushManager.subscribe()', 'ok', 'success');
    } catch (e) {
      // رسالة آمنة ومختصرة بس - اسم الخطأ فقط، من غير أي تفاصيل حساسة
      var safeMsg = (e && e.name) ? e.name : 'subscribe failed';
      diag('subscribe', 'PushManager.subscribe()', 'fail', safeMsg);
      throw new Error('تعذّر إنشاء اشتراك الإشعارات');
    }

    // مهم: وجود subscription في المتصفح لا يعني وجوده في قاعدة البيانات
    // (ممكن يكون اتحذف من السيرفر لأي سبب بينما المتصفح لسه محتفظ بيه) -
    // فبنعمل POST/Upsert دايمًا هنا، حتى لو الاشتراك الحالي كان صالح أصلًا
    var subJson = sub.toJSON();
    if (!subJson.endpoint || !subJson.keys || !subJson.keys.p256dh || !subJson.keys.auth) {
      // فحص دفاعي قبل الإرسال أصلًا - لو الـ subscription اللي رجعه المتصفح
      // ناقص (حالة نادرة لكن ممكنة على بعض الأجهزة)، منبعتوش لسيرفر بشكل
      // غير مكتمل، ومنسمحش لرسالة النجاح تظهر أصلًا
      diag('sync', 'مزامنة السيرفر', 'fail', 'بيانات الاشتراك من المتصفح غير مكتملة');
      throw new Error('بيانات الاشتراك من المتصفح غير مكتملة');
    }

    console.log('[PUSH] subscribe-url:', ctx.subscribeUrl);
    var res;
    try {
      res = await fetch(ctx.subscribeUrl, {
        method: 'POST',
        headers: Object.assign({ 'Content-Type': 'application/json' }, ctx.headers),
        body: JSON.stringify({
          endpoint: subJson.endpoint,
          keys: subJson.keys,
          user_agent: navigator.userAgent
        })
      });
    } catch (e) {
      diag('sync', 'مزامنة السيرفر', 'fail', 'تعذّر الوصول للسيرفر (شبكة)');
      throw new Error('تعذّر الوصول للسيرفر');
    }
    console.log('[PUSH] subscribe-status:', res.status);
    var out = await res.json().catch(function () { return {}; });
    console.log('[PUSH] subscribe-response-success:', out.success === true);

    var authOk = res.status !== 401 && res.status !== 403;
    var syncDetail = 'URL: ' + ctx.subscribeUrl + ' | HTTP ' + res.status +
      ' | authenticated=' + (authOk ? 'yes' : 'no') + ' | success=' + (out.success === true);

    if (!res.ok || !out.success) {
      console.log('[PUSH] server-sync fail');
      diag('sync', 'مزامنة السيرفر', 'fail', syncDetail);
      throw new Error(out.error || 'تعذر تفعيل الإشعارات');
    }
    console.log('[PUSH] server-sync success');
    diag('sync', 'مزامنة السيرفر', 'ok', syncDetail);
    return true;
  }

  // ينشئ زر "تفعيل إشعارات الجهاز" داخل العنصر المحدد بـ containerId.
  // role: 'customer' | 'worker' | 'admin' (اختياري - يُكتشف تلقائيًا لو
  // اتسيب فاضي لعميل/صنايعي)
  function initPushToggle(containerId, role) {
    var container = document.getElementById(containerId);
    if (!container) return;
    console.log('[PUSH] push module loaded = yes');

    var supportsSW = 'serviceWorker' in navigator;
    var supportsPush = 'PushManager' in window;

    if (!supportsSW || !supportsPush) {
      container.innerHTML =
        '<div class="push-toggle-section">' +
        '<h3 class="push-toggle-title"><i class="fa-solid fa-bell"></i> الإشعارات</h3>' +
        '<p class="push-toggle-desc">استقبل تحديثات الطلبات والرسائل حتى لو التطبيق في الخلفية.</p>' +
        '<p class="push-toggle-note">إشعارات الجهاز غير مدعومة على هذا المتصفح.</p>' +
        '<ol class="push-diag-list" style="display:block;">' +
        '<li class="push-diag-item push-diag-fail">بيئة التشغيل: secureContext=' + window.isSecureContext +
        ', serviceWorker=' + supportsSW + ', PushManager=' + supportsPush + '</li>' +
        '</ol>' +
        '</div>';
      return;
    }

    container.innerHTML =
      '<div class="push-toggle-section">' +
      '<h3 class="push-toggle-title"><i class="fa-solid fa-bell"></i> الإشعارات</h3>' +
      '<p class="push-toggle-desc">استقبل تحديثات الطلبات والرسائل حتى لو التطبيق في الخلفية.</p>' +
      '<button type="button" id="pushEnableBtn" class="push-toggle-btn">' +
      '<i class="fa-solid fa-bell"></i> تفعيل إشعارات الجهاز</button>' +
      '<p class="push-toggle-note" id="pushToggleNote" style="display:none;"></p>' +
      '<ol class="push-diag-list" id="pushDiagList" style="display:none;"></ol>' +
      '</div>';

    var btn = document.getElementById('pushEnableBtn');
    var note = document.getElementById('pushToggleNote');
    var diagList = document.getElementById('pushDiagList');
    var diagItems = {};

    function diagInit() {
      diagList.innerHTML = '';
      diagList.style.display = 'block';
      diagItems = {};
    }
    // آمن تمامًا: detail هنا نصوص وصفية قصيرة فقط (حالة/status code/اسم دور) -
    // ممنوع تمريره أي endpoint/p256dh/auth/token من أي نقطة استدعاء
    function diagStep(key, label, status, detail) {
      var li = diagItems[key];
      if (!li) {
        li = document.createElement('li');
        diagList.appendChild(li);
        diagItems[key] = li;
      }
      li.className = 'push-diag-item push-diag-' + status;
      li.textContent = label + ': ' + detail;
    }

    function showNote(text) {
      note.textContent = text;
      note.style.display = 'block';
    }

    function markEnabled() {
      btn.innerHTML = '<i class="fa-solid fa-circle-check"></i> الإشعارات مفعّلة ✓';
      btn.classList.add('push-toggle-btn-active');
      btn.disabled = true;
    }

    // ممنوع اعتبار Notification.permission==='granted' وحده يعني إن الإشعارات
    // مفعّلة فعليًا - ده إذن نظام التشغيل بس، مش دليل على وجود Subscription
    // حقيقي متزامن مع السيرفر. الزر يبقى في حالته الافتراضية (قابل للضغط)
    // لحد ما نتحقق فعليًا: sw.ready → getSubscription → إعادة مزامنة مع
    // السيرفر وترجع 2xx+success:true - ساعتها بس نستدعي markEnabled().
    // لو مفيش Subscription أصلًا، منعملش subscribe() تلقائي هنا (حتى لو
    // الإذن ممنوح بالفعل) - لازم المستخدم يضغط الزر صراحة.
    if (Notification && Notification.permission === 'denied') {
      btn.disabled = true;
      showNote('الإشعارات محظورة من إعدادات الجهاز');
    } else if (Notification && Notification.permission === 'granted') {
      (async function verifyExistingSubscription() {
        diagInit();
        diagStep('runtime', 'بيئة التشغيل', 'ok',
          'secureContext=' + window.isSecureContext + ', SW=' + supportsSW + ', PushManager=' + supportsPush +
          ', permission=' + Notification.permission);
        try {
          var reg = await navigator.serviceWorker.ready;
          diagStep('sw', 'Service Worker', 'ok', 'ready');

          var sub = await reg.pushManager.getSubscription();
          diagStep('existing', 'اشتراك سابق على الجهاز', sub ? 'ok' : 'fail', sub ? 'existing' : 'none');
          if (!sub) return; // يفضل الزر في حالته الافتراضية - مفيش subscribe() تلقائي

          var ctx = resolveContext(role);
          diagStep('role', 'الدور/المسار المستخدم', ctx ? 'ok' : 'fail', ctx ? ctx.subscribeUrl : 'لا يوجد حساب مسجّل دخول');
          if (!ctx) return;

          var subJson = sub.toJSON();
          if (!subJson.endpoint || !subJson.keys || !subJson.keys.p256dh || !subJson.keys.auth) {
            diagStep('sync', 'مزامنة السيرفر', 'fail', 'بيانات الاشتراك من المتصفح غير مكتملة');
            return;
          }

          var res = await fetch(ctx.subscribeUrl, {
            method: 'POST',
            headers: Object.assign({ 'Content-Type': 'application/json' }, ctx.headers),
            body: JSON.stringify({ endpoint: subJson.endpoint, keys: subJson.keys, user_agent: navigator.userAgent })
          });
          var out = await res.json().catch(function () { return {}; });
          var authOk = res.status !== 401 && res.status !== 403;
          var syncDetail = 'HTTP ' + res.status + ' | authenticated=' + (authOk ? 'yes' : 'no') + ' | success=' + (out.success === true);

          if (res.ok && out.success) {
            diagStep('sync', 'مزامنة السيرفر', 'ok', syncDetail);
            markEnabled();
          } else {
            diagStep('sync', 'مزامنة السيرفر', 'fail', syncDetail);
          }
        } catch (e) {
          diagStep('sw', 'Service Worker', 'fail', (e && e.name) || 'failed');
        }
      })();
    }

    btn.addEventListener('click', async function () {
      diagInit();
      diagStep('runtime', 'بيئة التشغيل', 'ok',
        'secureContext=' + window.isSecureContext + ', SW=' + supportsSW + ', PushManager=' + supportsPush +
        ', permission=' + (('Notification' in window) ? Notification.permission : 'unsupported'));

      var ctx = resolveContext(role);
      diagStep('role', 'الدور/المسار المستخدم', ctx ? 'ok' : 'fail', ctx ? ctx.subscribeUrl : 'لا يوجد حساب مسجّل دخول');
      if (!ctx) { showNote('يجب تسجيل الدخول أولاً لتفعيل إشعارات الجهاز.'); return; }

      if (!('Notification' in window)) { showNote('هذا المتصفح لا يدعم إشعارات الجهاز.'); return; }

      btn.disabled = true;
      try {
        var permission = await Notification.requestPermission();
        console.log('[PUSH] permission:', permission);
        diagStep('permission', 'إذن الإشعارات', permission === 'granted' ? 'ok' : 'fail', permission);
        if (permission !== 'granted') {
          showNote('تم رفض الإذن. يمكنك تفعيله لاحقًا من إعدادات المتصفح/الجهاز.');
          btn.disabled = false;
          return;
        }
        await subscribeToPush(ctx, diagStep);
        markEnabled();
        showNote('تم تفعيل إشعارات الجهاز بنجاح');
      } catch (e) {
        showNote('تعذر تفعيل الإشعارات، حاول مرة أخرى. (' + ((e && e.message) || 'خطأ غير معروف') + ')');
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
