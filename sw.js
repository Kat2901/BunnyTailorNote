/* Service worker — app shell cache + offline (PWA)
   - Navigation (HTML): network-first → luôn lấy bản mới khi online, fallback cache khi offline.
   - Static assets: stale-while-revalidate → phục vụ cache nhanh, cập nhật ngầm từ network.
   Khi đổi code HTML/CSS/JS: tăng CACHE version (v2 → v3...) để xoá cache cũ cho mọi người dùng. */
const CACHE = "bunnytailor-v2";
const ASSETS = [
  "./",
  "./index.html",
  "./styles.css",
  "./db.js",
  "./app.js",
  "./manifest.json",
  "./icon-192.png",
  "./icon-512.png",
  "./favicon.png"
];

self.addEventListener("install", (e) => {
  e.waitUntil(
    caches.open(CACHE).then((c) => c.addAll(ASSETS)).then(() => self.skipWaiting())
  );
});

self.addEventListener("activate", (e) => {
  e.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", (e) => {
  const req = e.request;
  if (req.method !== "GET") return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return; // bỏ qua cross-origin (Google Fonts...)

  // Navigation (tài liệu HTML): network-first để luôn có bản mới
  if (req.mode === "navigate") {
    e.respondWith(
      fetch(req).then((resp) => {
        const copy = resp.clone();
        caches.open(CACHE).then((c) => c.put("./index.html", copy));
        return resp;
      }).catch(() => caches.match("./index.html"))
    );
    return;
  }

  // Static assets: stale-while-revalidate (cache trước, cập nhật ngầm)
  e.respondWith(
    caches.match(req).then((cached) => {
      const network = fetch(req).then((resp) => {
        if (resp && resp.ok) {
          const copy = resp.clone();
          caches.open(CACHE).then((c) => c.put(req, copy));
        }
        return resp;
      }).catch(() => cached);
      return cached || network;
    })
  );
});