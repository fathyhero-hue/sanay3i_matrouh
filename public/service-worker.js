const CACHE_NAME = 'sanay3i-matrouh-v9';

// ملفات JS حرجة وظيفيًا لازم تتحدث فورًا مع أي نشر جديد (Network First) - لو
// اتخزنت نسخة قديمة منها في كاش زائر قديم ماينفعش يفضل عالق عليها. باقي
// أصول JS/CSS/الصور بتفضل على Stale-While-Revalidate تحت.
const CRITICAL_JS_PATHS = ['/js/support-widget.js', '/js/notifications-widget.js', '/js/home.js'];

// أصول ثابتة بس (CSS/أيقونات/خطوط) - مش صفحات HTML. صفحات HTML بتتعامل معاها
// استراتيجية Network First تحت، فمش محتاجة تتخزن هنا مسبقًا؛ offline.html هي
// الوحيدة المخزّنة مسبقًا من صفحات HTML عشان تشتغل كـ fallback عند انقطاع
// النت تمامًا وما فيش أي نسخة تانية متخزنة بعد.
const STATIC_ASSETS_TO_CACHE = [
  '/css/global.css',
  '/css/cards.css',
  '/css/worker.css',
  '/css/status.css',
  '/css/register.css',
  '/icons/default-worker-avatar.png',
  '/icons/icon-192.png',
  '/manifest.json',
  '/offline.html',
  'https://fonts.googleapis.com/css2?family=Cairo:wght@300;400;500;600;700;800;900&display=swap',
  'https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.5.2/css/all.min.css'
];

// تثبيت الـ Service Worker: تخزين الأصول الثابتة + تفعيل فوري بدون انتظار
// إغلاق كل التابات القديمة
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(STATIC_ASSETS_TO_CACHE))
  );
  self.skipWaiting();
});

// تفعيل النسخة الجديدة: حذف أي كاش قديم غير النسخة الحالية + الاستيلاء على
// التحكم في كل الصفحات المفتوحة فورًا (من غير ما تستنى إعادة تحميل يدوي)
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.map((key) => {
        if (key !== CACHE_NAME) return caches.delete(key);
      })))
      .then(() => self.clients.claim())
  );
});

// أي طلب تنقل حقيقي بين الصفحات (فتح رابط، location.href) بيبقى mode:'navigate'
// بغض النظر عن شكل الـ URL (/, /worker/123, /register...) - ده أدق وأشمل من
// فحص امتداد .html بس
function isNavigationRequest(request) {
  if (request.mode === 'navigate') return true;
  const url = new URL(request.url);
  return url.pathname === '/' || url.pathname.endsWith('.html');
}

// Network First لصفحات HTML/التنقل: أي نشر جديد يوصل فورًا لأي زائر عنده نت،
// ونحدّث الكاش بالنسخة الجديدة كل مرة كمان. لو الشبكة فشلت (مفيش نت) نرجع
// لآخر نسخة اتخزنت من نفس الصفحة، وأخيرًا offline.html
async function networkFirst(request) {
  try {
    const freshResponse = await fetch(request);
    if (freshResponse && freshResponse.ok) {
      const cache = await caches.open(CACHE_NAME);
      cache.put(request, freshResponse.clone());
    }
    return freshResponse;
  } catch {
    const cached = await caches.match(request);
    if (cached) return cached;
    return caches.match('/offline.html');
  }
}

// Stale-While-Revalidate لباقي الأصول (JS/CSS/صور): نرجع النسخة المخزنة فورًا
// لو موجودة عشان السرعة، وفي نفس الوقت نجيب نسخة جديدة من الشبكة ونحدّث بيها
// الكاش للمرة الجاية - عشان ملفات زي home.js/customerGate.js ماتفضلش عالقة
// على نسخة قديمة للأبد زي ما كان بيحصل قبل كده
async function staleWhileRevalidate(request) {
  const cached = await caches.match(request);
  const networkFetch = fetch(request).then((freshResponse) => {
    if (freshResponse && freshResponse.ok) {
      caches.open(CACHE_NAME).then((cache) => cache.put(request, freshResponse.clone()));
    }
    return freshResponse;
  }).catch(() => null);

  if (cached) return cached;
  const fresh = await networkFetch;
  return fresh || new Response('', { status: 408, statusText: 'Offline' });
}

// التعامل مع طلبات الشبكة (Fetch)
self.addEventListener('fetch', (event) => {
  const { request } = event;

  // استثناء طلبات الـ API ولوحة الإدارة والطلبات التي ليست GET لتعمل من السيرفر مباشرة
  if (
    request.method !== 'GET' ||
    request.url.includes('/api/') ||
    request.url.includes('/admin')
  ) {
    return; // ترك المتصفح يتعامل معها بشكل طبيعي دون تدخل الكاش
  }

  if (isNavigationRequest(request)) {
    event.respondWith(networkFirst(request));
    return;
  }

  const url = new URL(request.url);
  const isCriticalJs = CRITICAL_JS_PATHS.some((p) => url.pathname === p);
  if (isCriticalJs) {
    event.respondWith(networkFirst(request));
    return;
  }

  event.respondWith(staleWhileRevalidate(request));
});

// ===============================
// Web Push - طبقة توصيل إضافية فوق نظام الإشعارات الداخلي الحالي (لا تلمس
// أي من منطق الكاش فوق). الصوت عند وصول push بيتحكم فيه نظام التشغيل/
// المتصفح نفسه حسب إعدادات الجهاز، مفيش أي تشغيل صوت من هنا.
// ===============================
self.addEventListener('push', (event) => {
  let payload = {};
  try {
    payload = event.data ? event.data.json() : {};
  } catch (e) {
    payload = { title: 'إشعار جديد', body: event.data ? event.data.text() : '' };
  }

  const title = payload.title || 'صنايعي مطروح';
  const options = {
    body: payload.body || '',
    icon: payload.icon || '/icons/icon-192.png',
    badge: payload.badge || '/icons/icon-192.png',
    data: {
      url: payload.url || '/',
      notification_id: payload.notification_id || null,
      type: payload.type || 'general'
    },
    // نفس notification_id كـ tag - بيمنع ظهور نفس الإشعار مرتين لو وصل الـ
    // push بالخطأ أكتر من مرة لنفس الحدث
    tag: payload.notification_id ? String(payload.notification_id) : undefined
  };

  event.waitUntil(self.registration.showNotification(title, options));
});

self.addEventListener('notificationclick', (event) => {
  const targetUrl = (event.notification.data && event.notification.data.url) || '/';
  event.notification.close();

  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clientsList) => {
      for (const client of clientsList) {
        try {
          const clientUrl = new URL(client.url);
          const target = new URL(targetUrl, self.location.origin);
          if (clientUrl.origin === target.origin) {
            client.postMessage({ type: 'push-notification-click', url: targetUrl });
            if ('focus' in client) return client.focus();
          }
        } catch (e) { /* تجاهل روابط غير صالحة */ }
      }
      if (self.clients.openWindow) return self.clients.openWindow(targetUrl);
    })
  );
});
