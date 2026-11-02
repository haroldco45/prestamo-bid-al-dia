// Service worker — Préstamo BID al Día
// Noticias y página: primero la red (siempre lo más nuevo). Lo demás: caché.
const CACHE = "bid-al-dia-v1";
const BASE = ["./", "index.html", "manifest.json", "icon-192.png", "icon-512.png", "data/noticias.json"];

self.addEventListener("install", (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(BASE)).then(() => self.skipWaiting()));
});
self.addEventListener("activate", (e) => {
  e.waitUntil(caches.keys().then((ks) => Promise.all(ks.filter((k) => k !== CACHE).map((k) => caches.delete(k)))).then(() => self.clients.claim()));
});
self.addEventListener("fetch", (e) => {
  const url = new URL(e.request.url);
  if (e.request.method !== "GET" || url.origin !== location.origin) return;
  const fresco = url.pathname.endsWith("/") || url.pathname.endsWith(".html") || url.pathname.includes("/data/");
  if (fresco) {
    e.respondWith(
      fetch(e.request).then((r) => {
        const copia = r.clone();
        caches.open(CACHE).then((c) => c.put(e.request.url.split("?")[0], copia));
        return r;
      }).catch(() => caches.match(e.request.url.split("?")[0]).then((r) => r || caches.match("index.html")))
    );
  } else {
    e.respondWith(caches.match(e.request).then((r) => r || fetch(e.request)));
  }
});
