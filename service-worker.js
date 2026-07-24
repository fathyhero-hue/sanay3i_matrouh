const CACHE_NAME = 'sanay3i-matrouh-v2';

const ASSETS_TO_CACHE = [
  '/',
  '/register',
  '/status',
  '/css/global.css',
  '/css/support.css',
  '/css/cards.css',
  '/css/worker.css',
  '/css/status.css',
  '/css/register.css',
  '/icons/default-worker-avatar.png',
  '/icons/icon-192.png',
  '/manifest.json',
  'https://fonts.googleapis.com/css2?family=Cairo:wght@300;400;500;600;700;800;900&display=swap',
  'https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.5.2/css/all.min.css'
];

// تثبيت الـ Service Worker وحفظ الملفات في الكاش
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      return cache.addAll(ASSETS_TO_CACHE);
    })
  );
  self.skipWaiting();
});

// تنظيف الكاش القديم عند التحديث
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) => {
      return Promise.all(
        keys.map((key) => {
          if (key !== CACHE_NAME) {
            return caches.delete(key);
          }
        })
      );
    })
  );
  self.clients.claim();
});

// التعامل مع طلبات الشبكة (Fetch)
self.addEventListener('fetch', (event) => {
  // استثناء طلبات الـ API لكي يتم جلبها دائماً من السيرفر مباشرة
  if (event.request.url.includes('/api/')) {
    return;
  }

  event.respondWith(
    caches.match(event.request).then((cachedResponse) => {
      if (cachedResponse) {
        return cachedResponse;
      }
      return fetch(event.request).catch(() => {
        // صفحة بديلة في حالة انقطاع الإنترنت تماماً
        if (event.request.mode === 'navigate') {
          return caches.match('/offline.html');
        }
      });
    })
  );
});