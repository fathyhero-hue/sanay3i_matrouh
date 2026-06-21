// Service Worker - no-cache admin fix V8 + navy splash + registration required actions + whatsapp inbox webhook + professional home header + Matrouh hero image patch + admin full worker control
const CACHE_NAME = 'sanay3i-no-admin-cache-v8-admin-full-control';
self.addEventListener('install', event => { self.skipWaiting(); });
self.addEventListener('activate', event => { event.waitUntil(self.clients.claim()); });
self.addEventListener('fetch', event => {
  const url = new URL(event.request.url);
  if (url.pathname.startsWith('/admin') || url.pathname.endsWith('/admin.html') || url.pathname.startsWith('/api/')) {
    event.respondWith(fetch(event.request));
    return;
  }
  event.respondWith(fetch(event.request).catch(() => caches.match(event.request)));
});
