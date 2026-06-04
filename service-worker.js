const CACHE_NAME = "sanay3i-matrouh-v1";
const OFFLINE_URL = "/offline.html";
const STATIC_ASSETS = ["/", "/index.html", "/register", "/register.html", "/offline.html", "/style.css", "/manifest.json", "/icons/icon-192.png", "/icons/icon-512.png"];

self.addEventListener("install", event => {
  event.waitUntil(caches.open(CACHE_NAME).then(cache => cache.addAll(STATIC_ASSETS)).then(() => self.skipWaiting()));
});

self.addEventListener("activate", event => {
  event.waitUntil(caches.keys().then(keys => Promise.all(keys.map(key => key !== CACHE_NAME ? caches.delete(key) : null))).then(() => self.clients.claim()));
});

self.addEventListener("fetch", event => {
  const request = event.request;
  if (request.method !== "GET") return;
  const url = new URL(request.url);

  if (url.pathname.startsWith("/api/")) {
    event.respondWith(fetch(request).catch(() => new Response(JSON.stringify({success:false,error:"لا يوجد اتصال بالإنترنت حاليًا"}), {headers: {"Content-Type": "application/json"}, status: 503})));
    return;
  }

  if (request.mode === "navigate") {
    event.respondWith(fetch(request).catch(() => caches.match(OFFLINE_URL)));
    return;
  }

  event.respondWith(caches.match(request).then(cached => cached || fetch(request).then(response => {
    return caches.open(CACHE_NAME).then(cache => {
      cache.put(request, response.clone());
      return response;
    });
  }).catch(() => cached)));
});
