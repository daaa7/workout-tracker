// GROOVE service worker — caches the app shell so it opens offline.
// Supabase API calls (cross-origin) are never cached; the app's own
// offline queue handles writes while you're disconnected.
const CACHE = "groove-v13";
const SHELL = ["./", "./index.html", "./styles.css", "./app.js", "./config.js", "./manifest.json", "./icon.svg"];

self.addEventListener("install", (e) => {
  // do NOT skipWaiting here — wait until the user taps "Update" so we never
  // swap assets mid-workout. The page asks us to activate via postMessage.
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(SHELL)));
});
self.addEventListener("message", (e) => { if (e.data && e.data.type === "SKIP_WAITING") self.skipWaiting(); });
self.addEventListener("activate", (e) => {
  e.waitUntil(caches.keys().then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)))).then(() => self.clients.claim()));
});
self.addEventListener("fetch", (e) => {
  const url = new URL(e.request.url);
  if (url.origin !== location.origin || e.request.method !== "GET") return; // let Supabase/CDN pass through
  // network-first for our own shell, fall back to cache when offline
  e.respondWith(
    fetch(e.request).then((res) => {
      const copy = res.clone();
      caches.open(CACHE).then((c) => c.put(e.request, copy));
      return res;
    }).catch(() => caches.match(e.request).then((r) => r || caches.match("./index.html")))
  );
});
