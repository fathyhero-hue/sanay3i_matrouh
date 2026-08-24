// عنصر "تفعيل إشعارات الجهاز" قابل لإعادة الاستخدام - عميل/صنايعي/إدارة.
// لا يطلب Notification.requestPermission() تلقائيًا أبدًا؛ فقط عند ضغط
// المستخدم صراحة على الزر. هذا ملف إضافي بحت فوق نظام الإشعارات الداخلي
// الحالي (notifications-widget.js) ولا يمسّه.
//
// فرع iOS Native (APNs عبر @capacitor/push-notifications) - إضافي بحت،
// موازٍ تمامًا لمسار Web Push الحالي (Android TWA/سطح المكتب/متصفح الويب)
// اللي يفضل يشتغل بالظبط زي ما هو من غير أي تغيير. الفرع ده بيتفعّل بس
// جوه تطبيق iOS الأصلي (Capacitor.getPlatform() === 'ios')، ونفس مبدأ
// "بلا طلب إذن تلقائي" منطبق هنا كمان - التسجيل بيحصل فقط عند ضغط المستخدم.
(function () {
  function isIosNativeShell() {
    try {
      return !!(window.Capacitor && typeof window.Capacitor.getPlatform === 'function' && window.Capacitor.getPlatform() === 'ios');
    } catch (e) { return false; }
  }

  function iosRegisterUrl(role) {
    if (role === 'admin') return { url: '/api/push/ios/register/admin', headers: {} };
    var customerToken = localStorage.getItem('sanay3i_customer_token');
    if (customerToken) return { url: '/api/push/ios/register/customer', headers: { Authorization: 'Bearer ' + customerToken } };
    var workerToken = localStorage.getItem('sanay3i_worker_token');
    var workerId = localStorage.getItem('sanay3i_current_worker_id');
    if (workerToken && workerId) return { url: '/api/push/ios/register/worker/' + workerId, headers: { Authorization: 'Bearer ' + workerToken } };
    return null;
  }

  // تسجيل فعلي عبر Capacitor PushNotifications - بيرجع true فقط لما التوكن
  // يوصل فعليًا ويتحفظ على السيرفر بنجاح (نفس مبدأ "اعتماد على دليل فعلي"
  // المستخدم في مسار الويب: مفيش markEnabled() إلا بعد تأكيد نجاح المزامنة)
  function registerIosPush(role, diag) {
    if (!diag) diag = function () {};
    return new Promise(function (resolve, reject) {
      var Push = window.Capacitor && window.Capacitor.Plugins && window.Capacitor.Plugins.PushNotifications;
      if (!Push) { diag('plugin', 'مكوّن الإشعارات', 'fail', 'PushNotifications plugin غير متاح'); return reject(new Error('مكوّن الإشعارات غير متاح')); }

      var ctx = iosRegisterUrl(role);
      diag('role', 'الدور/المسار المستخدم', ctx ? 'ok' : 'fail', ctx ? ctx.url : 'لا يوجد حساب مسجّل دخول');
      if (!ctx) { return reject(new Error('يجب تسجيل الدخول أولاً')); }

      var settled = false;
      var registrationHandle, errorHandle;

      function cleanup() {
        try { registrationHandle && registrationHandle.remove(); } catch (e) {}
        try { errorHandle && errorHandle.remove(); } catch (e) {}
      }

      registrationHandle = Push.addListener('registration', function (token) {
        if (settled) return;
        settled = true;
        diag('token', 'توكن الجهاز', 'ok', 'تم الاستلام');
        fetch(ctx.url, {
          method: 'POST',
          headers: Object.assign({ 'Content-Type': 'application/json' }, ctx.headers),
          body: JSON.stringify({ device_token: token.value })
        }).then(function (res) {
          return res.json().catch(function () { return {}; }).then(function (out) {
            var ok = res.ok && out.success === true;
            diag('sync', 'مزامنة السيرفر', ok ? 'ok' : 'fail', 'HTTP ' + res.status + ' | success=' + (out.success === true));
            cleanup();
            if (ok) resolve(true); else reject(new Error(out.error || 'تعذر تفعيل الإشعارات'));
          });
        }).catch(function () {
          diag('sync', 'مزامنة السيرفر', 'fail', 'تعذّر الوصول للسيرفر (شبكة)');
          cleanup();
          reject(new Error('تعذّر الوصول للسيرفر'));
        });
      });

      errorHandle = Push.addListener('registrationError', function (err) {
        if (settled) return;
        settled = true;
        diag('token', 'توكن الجهاز', 'fail', (err && err.error) || 'registration failed');
        cleanup();
        reject(new Error('تعذّر تسجيل الجهاز لدى Apple'));
      });

      Push.checkPermissions().then(function (perm) {
        diag('permission', 'إذن الإشعارات', perm.receive === 'granted' ? 'ok' : 'checking', perm.receive);
        if (perm.receive === 'granted') return Push.register();
        if (perm.receive === 'denied') {
          settled = true;
          cleanup();
          return reject(Object.assign(new Error('DENIED'), { denied: true }));
        }
        return Push.requestPermissions().then(function (req) {
          diag('permission', 'إذن الإشعارات', req.receive === 'granted' ? 'ok' : 'fail', req.receive);
          if (req.receive !== 'granted') {
            settled = true;
            cleanup();
            return reject(Object.assign(new Error('DENIED'), { denied: true }));
          }
          return Push.register();
        });
      }).catch(function (e) {
        if (settled) return;
        settled = true;
        cleanup();
        reject(e);
      });
    });
  }

  // pushNotificationActionPerformed (ضغط المستخدم على إشعار نظام التشغيل) -
  // نفس منطق تحديد رابط الوجهة المستخدم في service-worker.js (notificationclick)،
  // بيتنقل داخل الـ WebView مباشرة لنفس المسار
  function wireIosForegroundListeners() {
    var Push = window.Capacitor && window.Capacitor.Plugins && window.Capacitor.Plugins.PushNotifications;
    if (!Push || Push.__sanay3iWired) return;
    Push.__sanay3iWired = true;

    // pushNotificationReceived (foreground): مفيش أي toast/صوت إضافي هنا -
    // ودجت الإشعارات الداخلي (notifications-widget.js) أصلًا بيعرض نفس
    // الحدث عبر الـ polling الدوري بتاعه، فمفيش داعي لعرض مضاعف لنفس الحدث
    Push.addListener('pushNotificationReceived', function () { /* لا شيء عمدًا - تجنّب الازدواج مع notifications-widget.js */ });

    Push.addListener('pushNotificationActionPerformed', function (action) {
      try {
        var data = action && action.notification && action.notification.data;
        var url = data && data.url;
        if (url && window.location.pathname + window.location.search !== url) {
          window.location.href = url;
        }
      } catch (e) { /* تجاهل */ }
    });
  }

  if (isIosNativeShell()) wireIosForegroundListeners();

  window.__sanay3iIosPush = { isIosNativeShell: isIosNativeShell, registerIosPush: registerIosPush };
})();

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

  // Promise.race مع Timeout آمن - أي await على serviceWorker.ready ممنوع
  // يفضل معلّق للأبد؛ لو محصلش activation خلال المهلة، نرمي خطأ واضح
  // بدل ما نسيب الزر معلّق بدون رد
  function withTimeout(promise, ms, timeoutMessage) {
    return new Promise(function (resolve, reject) {
      var timer = setTimeout(function () { reject(new Error(timeoutMessage)); }, ms);
      promise.then(function (v) { clearTimeout(timer); resolve(v); }, function (e) { clearTimeout(timer); reject(e); });
    });
  }

  // diag: دالة اختيارية (key, label, status, detail) بتحدّث UI التشخيص -
  // ممنوع تمامًا تمرير أي endpoint/p256dh/auth/token لها، فقط نصوص آمنة
  async function subscribeToPush(ctx, diag) {
    if (!diag) diag = function () {};

    // فحص فعلي قبل انتظار .ready أصلًا - يوضّح فورًا هل فيه Registration
    // موجود، حالته، وهل الصفحة الحالية تحت سيطرة Worker فعلي (controller)
    // أم لسه لأ (حالة معروفة أول تسجيل على صفحة معينة قبل أي reload)
    var controllerYes = !!navigator.serviceWorker.controller;
    var existingReg = await navigator.serviceWorker.getRegistration();
    var allRegs = await navigator.serviceWorker.getRegistrations();
    var swState = 'none';
    if (existingReg) {
      if (existingReg.installing) swState = 'installing';
      else if (existingReg.waiting) swState = 'waiting';
      else if (existingReg.active) swState = 'active';
    }
    diag('sw-controller', 'SW controller', controllerYes ? 'ok' : 'fail', controllerYes ? 'yes' : 'no');
    diag('sw-registration', 'SW registration', existingReg ? 'ok' : 'fail',
      (existingReg ? 'found' : 'none') + ' (كل التسجيلات: ' + allRegs.length + ')');
    diag('sw-state', 'SW state/scope', existingReg ? 'ok' : 'fail',
      swState + (existingReg ? ' | scope=' + existingReg.scope : ''));

    // بعض الصفحات (حسابي/لوحة الصنايعي/لوحة الإدارة) ما بتسجّلش الـ Service
    // Worker بنفسها (بيتسجل من index.html/status.html/worker.html بس) -
    // بنسجّله هنا بنفس الملف "/service-worker.js" ونفس scope "/" الافتراضي
    // (مفيش Service Worker جديد ولا architecture مختلفة) لو مفيش Registration
    // أصلًا، قبل ما نستنى .ready
    if (!existingReg) {
      try {
        var newReg = await navigator.serviceWorker.register('/service-worker.js');
        diag('sw-register', 'تسجيل Service Worker', 'ok', 'scope=' + newReg.scope);
        // statechange مؤقت - بيوضّح فعليًا لو الـWorker وصل لـinstalling/
        // installed/activating/activated أو سقط في redundant (فشل التثبيت)
        var trackedWorker = newReg.installing || newReg.waiting || newReg.active;
        if (trackedWorker) {
          diag('sw-statechange', 'حالة Worker', 'ok', trackedWorker.state);
          trackedWorker.addEventListener('statechange', function () {
            diag('sw-statechange', 'حالة Worker', trackedWorker.state === 'redundant' ? 'fail' : 'ok', trackedWorker.state);
          });
        }
      } catch (e) {
        diag('sw-register', 'تسجيل Service Worker', 'fail', (e && e.name) || 'register failed');
        throw new Error('تعذّر تسجيل Service Worker');
      }
    }

    var reg;
    try {
      // مهلة آمنة 5 ثوانٍ - ممنوع يفضل معلّق للأبد
      reg = await withTimeout(navigator.serviceWorker.ready, 5000, 'Service Worker غير جاهز');
      console.log('[PUSH] sw-ready');
      diag('sw', 'Service Worker', 'ok', 'ready (state=' + (reg.active ? 'active' : 'unknown') + ')');
    } catch (e) {
      diag('sw', 'Service Worker', 'fail', (e && e.message) || 'Service Worker غير جاهز');
      throw new Error('Service Worker غير جاهز');
    }

    // لو الـRegistration بقى Active لكن مفيش controller على الصفحة الحالية،
    // ده معروف في أول تسجيل قبل أي reload - reg.pushManager هنا لسه شغال
    // بشكل مستقل عن الـcontroller (مش محتاجين نجبر reload)، فبنكمل عادي،
    // بس بنوضّح الحالة في التشخيص فقط
    if (!navigator.serviceWorker.controller) {
      diag('sw-controller', 'SW controller', 'fail', 'لسه no (Active لكن لم يتحكم في الصفحة الحالية بعد - عادي، هنكمل)');
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

  // نسخة iOS Native من نفس عنصر "تفعيل إشعارات الجهاز" - نفس الشكل/النصوص
  // العامة، لكن التسجيل عبر Capacitor PushNotifications بدل Web Push API
  function initIosPushToggle(container, role) {
    container.innerHTML =
      '<div class="push-toggle-section">' +
      '<h3 class="push-toggle-title"><i class="fa-solid fa-bell"></i> الإشعارات</h3>' +
      '<p class="push-toggle-desc">استقبل تحديثات الطلبات والرسائل حتى لو التطبيق في الخلفية.</p>' +
      '<button type="button" id="pushEnableBtnIos" class="push-toggle-btn" ' +
      'style="pointer-events:auto;touch-action:manipulation;position:relative;z-index:1;">' +
      '<i class="fa-solid fa-bell" style="pointer-events:none;"></i> ' +
      '<span style="pointer-events:none;">تفعيل إشعارات الجهاز</span></button>' +
      '<p class="push-toggle-note" id="pushToggleNoteIos" style="display:none;"></p>' +
      '<ol class="push-diag-list" id="pushDiagListIos" style="display:none;"></ol>' +
      '</div>';

    var btn = document.getElementById('pushEnableBtnIos');
    var note = document.getElementById('pushToggleNoteIos');
    var diagList = document.getElementById('pushDiagListIos');
    var diagItems = {};

    function diagInit() { diagList.innerHTML = ''; diagList.style.display = 'block'; diagItems = {}; }
    function diagStep(key, label, status, detail) {
      var li = diagItems[key];
      if (!li) { li = document.createElement('li'); diagList.appendChild(li); diagItems[key] = li; }
      li.className = 'push-diag-item push-diag-' + status;
      li.textContent = label + ': ' + detail;
    }
    function showNote(text) { note.textContent = text; note.style.display = 'block'; }
    function markEnabled() {
      btn.innerHTML = '<i class="fa-solid fa-circle-check"></i> الإشعارات مفعّلة ✓';
      btn.classList.add('push-toggle-btn-active');
      btn.disabled = true;
    }
    function markDenied() {
      btn.disabled = true;
      showNote('الإشعارات محظورة من إعدادات iPhone');
    }

    // فحص أولي بلا أي طلب إذن - لو فيه تسجيل ناجح وتوكن متزامن مع السيرفر
    // بالفعل من قبل، نعرض الحالة الصحيحة فورًا (نفس مبدأ التحقق بدليل فعلي
    // المستخدم في مسار الويب أعلاه). لو الإذن مرفوض من قبل من إعدادات
    // النظام، نعرض ذلك فورًا بدل الزر الافتراضي
    var Push = window.Capacitor && window.Capacitor.Plugins && window.Capacitor.Plugins.PushNotifications;
    if (Push) {
      Push.checkPermissions().then(function (perm) {
        if (perm.receive === 'denied') markDenied();
      }).catch(function () {});
    }

    var running = false;
    btn.addEventListener('click', function () {
      if (running) return;
      running = true;
      diagInit();
      diagStep('tap', 'الضغط', 'ok', 'تم التقاط الضغط ✓');
      btn.disabled = true;
      window.__sanay3iIosPush.registerIosPush(role, diagStep).then(function () {
        markEnabled();
        showNote('تم تفعيل إشعارات الجهاز بنجاح');
      }).catch(function (e) {
        if (e && e.denied) {
          markDenied();
        } else {
          showNote('تعذر تفعيل الإشعارات، حاول مرة أخرى. (' + ((e && e.message) || 'خطأ غير معروف') + ')');
          btn.disabled = false;
        }
      }).finally(function () { running = false; });
    });
  }

  // ينشئ زر "تفعيل إشعارات الجهاز" داخل العنصر المحدد بـ containerId.
  // role: 'customer' | 'worker' | 'admin' (اختياري - يُكتشف تلقائيًا لو
  // اتسيب فاضي لعميل/صنايعي)
  function initPushToggle(containerId, role) {
    var container = document.getElementById(containerId);
    if (!container) return;
    console.log('[PUSH] push module loaded = yes');

    // فرع iOS Native منفصل بالكامل - لا يمر أبدًا على منطق Web Push
    // (Service Worker/PushManager) تحت، وميعرضش رسالة "غير مدعومة على هذا
    // المتصفح" اللي المفروض تفضل مقصورة على متصفحات الويب الفعلية غير
    // الداعمة فقط
    if (window.__sanay3iIosPush && window.__sanay3iIosPush.isIosNativeShell()) {
      return initIosPushToggle(container, role);
    }

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

    // data-push-toggle بدل الاعتماد على id بس - الـclick handler بتاعه
    // مربوط بـ Event Delegation على document (تحت)، مش بـaddEventListener
    // مباشر هنا، عشان يفضل شغال حتى لو الزر اتعمله render تاني لاحقًا أو
    // كان فيه أكتر من نسخة من الحاوية في نفس الصفحة
    container.innerHTML =
      '<div class="push-toggle-section">' +
      '<h3 class="push-toggle-title"><i class="fa-solid fa-bell"></i> الإشعارات</h3>' +
      '<p class="push-toggle-desc">استقبل تحديثات الطلبات والرسائل حتى لو التطبيق في الخلفية.</p>' +
      '<button type="button" id="pushEnableBtn" class="push-toggle-btn" data-push-toggle data-push-role="' + (role || '') + '" ' +
      'style="pointer-events:auto;touch-action:manipulation;position:relative;z-index:1;">' +
      '<i class="fa-solid fa-bell" style="pointer-events:none;"></i> ' +
      '<span style="pointer-events:none;">تفعيل إشعارات الجهاز</span></button>' +
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

    // منطق الضغط نفسه بقى Function مستقلة معلّقة على العنصر مباشرة، مش
    // addEventListener هنا - الـEvent الفعلي بيتلقطه Event Delegation واحد
    // على document (تحت آخر الملف) بحث عن [data-push-toggle] وينده الدالة
    // دي، عشان يفضل شغال حتى لو الزر اتعمله render تاني أو كان فيه أكتر
    // من نسخة من نفس الحاوية
    var running = false;
    btn.__runPushFlow = async function () {
      if (running) return; // منع Double-tap أثناء التنفيذ فعليًا
      running = true;

      diagInit();
      // أول سطر تشخيص فوري، قبل أي async operation نهائيًا - لو ده ظهر
      // يبقى الضغط اتلقط فعليًا، ولو مش ظهر تبقى المشكلة Event binding
      diagStep('tap', 'الضغط', 'ok', 'تم التقاط الضغط ✓');
      diagStep('flow', 'التنفيذ', 'ok', 'بدء تفعيل الإشعارات...');

      diagStep('runtime', 'بيئة التشغيل', 'ok',
        'secureContext=' + window.isSecureContext + ', SW=' + supportsSW + ', PushManager=' + supportsPush +
        ', permission=' + (('Notification' in window) ? Notification.permission : 'unsupported'));

      var ctx = resolveContext(role);
      diagStep('role', 'الدور/المسار المستخدم', ctx ? 'ok' : 'fail', ctx ? ctx.subscribeUrl : 'لا يوجد حساب مسجّل دخول');
      if (!ctx) { showNote('يجب تسجيل الدخول أولاً لتفعيل إشعارات الجهاز.'); running = false; return; }

      if (!('Notification' in window)) { showNote('هذا المتصفح لا يدعم إشعارات الجهاز.'); running = false; return; }

      btn.disabled = true;
      try {
        var permission = await Notification.requestPermission();
        console.log('[PUSH] permission:', permission);
        diagStep('permission', 'إذن الإشعارات', permission === 'granted' ? 'ok' : 'fail', permission);
        if (permission !== 'granted') {
          showNote('تم رفض الإذن. يمكنك تفعيله لاحقًا من إعدادات المتصفح/الجهاز.');
          btn.disabled = false;
          running = false;
          return;
        }
        await subscribeToPush(ctx, diagStep);
        markEnabled();
        showNote('تم تفعيل إشعارات الجهاز بنجاح');
      } catch (e) {
        showNote('تعذر تفعيل الإشعارات، حاول مرة أخرى. (' + ((e && e.message) || 'خطأ غير معروف') + ')');
        btn.disabled = false;
      } finally {
        running = false;
      }
    };
  }

  // Event Delegation واحد فقط على document لكل أزرار [data-push-toggle] -
  // بيتربط مرة واحدة عند تحميل الملف، مش مرتبط بلحظة إنشاء زر معيّن، فيفضل
  // شغال حتى لو container اتعمله render تاني بعدين. pointerup كـfallback
  // إضافي لبعض أجهزة Android/TWA اللي أحيانًا مابتبعتش click event بشكل
  // موثوق لعناصر معينة، من غير ما نعمل الفعل مرتين (running guard فوق).
  function delegatedPushToggleHandler(event) {
    var target = event.target && event.target.closest && event.target.closest('[data-push-toggle]');
    if (!target || target.disabled) return;
    if (typeof target.__runPushFlow === 'function') target.__runPushFlow();
  }
  document.addEventListener('click', delegatedPushToggleHandler);
  document.addEventListener('pointerup', delegatedPushToggleHandler);

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
