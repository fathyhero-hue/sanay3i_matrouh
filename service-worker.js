// Service Worker - no-cache admin fix V8 + navy splash + registration required actions + whatsapp inbox webhook + professional home header + Matrouh hero image patch + admin full worker control + owner phone verified chat + customer support floating chat + mobile UI hotfix + websocket support chat + realtime fallback
const CACHE_NAME = 'sanay3i-support-chat-realtime-fallback-hotfix-20260623';

self.addEventListener('install', event => { 
  self.skipWaiting(); 
});

self.addEventListener('activate', event => { 
  event.waitUntil(self.clients.claim()); 
});

self.addEventListener('fetch', event => {
  const url = new URL(event.request.url);
  
  // التعامل مع مسارات الإدارة والـ API وتوفير حماية لمنع انهيار الـ Promise عند انقطاع الشبكة
  if (url.pathname.startsWith('/admin') || url.pathname.endsWith('/admin.html') || url.pathname.startsWith('/api/')) {
    event.respondWith(
      fetch(event.request).catch(err => {
        if (url.pathname.startsWith('/api/')) {
          return new Response(JSON.stringify({ success: false, error: 'Network connection error' }), {
            status: 503,
            headers: { 'Content-Type': 'application/json' }
          });
        }
        throw err;
      })
    );
    return;
  }

  event.respondWith(
    fetch(event.request).catch(() => caches.match(event.request))
  );
});

// SUPPORT_NAVY_ICON_HOTFIX 20260623