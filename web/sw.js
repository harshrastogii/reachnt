// ReachNT service worker: keeps the app, its data and the satellite tiles on the phone so a tradesperson
// can open their run sheet with no signal. Field updates are queued by the app and sent when back online.
const VERSION = "reachnt-v14";
const SHELL = ["./", "index.html", "privacy", "styles.css", "app.js", "data/app.js", "data/warnings_snapshot.json", "manifest.webmanifest",
  "vendor/maplibre-gl.js", "vendor/maplibre-gl.css", "vendor/h3-js.umd.js", "vendor/jspdf.umd.min.js?v=4.2.1",
  "tiles/dea_z5_8.js", "tiles/dea_z9.js", "tiles/dea_z10.js", "icons/icon-192.png"];
const TILE_HOSTS = ["server.arcgisonline.com", "ibasemaps-api.arcgis.com", "api.maptiler.com", "storage.googleapis.com"];

self.addEventListener("install", (e) => {
  e.waitUntil(caches.open(VERSION).then((c) => c.addAll(SHELL)).then(() => self.skipWaiting()));
});
self.addEventListener("activate", (e) => {
  e.waitUntil(caches.keys().then((ks) => Promise.all(ks.filter((k) => k !== VERSION && !k.startsWith("tiles-")).map((k) => caches.delete(k))))
    .then(() => self.clients.claim()));
});
self.addEventListener("fetch", (e) => {
  const url = new URL(e.request.url);
  if (e.request.method !== "GET" || url.pathname.startsWith("/api/")) return;
  if (TILE_HOSTS.includes(url.hostname)) {          // imagery: cache first, keep what was viewed
    e.respondWith(caches.open("tiles-v1").then(async (c) => {
      const hit = await c.match(e.request);
      if (hit) return hit;
      try { const r = await fetch(e.request); if (r.ok) c.put(e.request, r.clone()); return r; } catch (err) { return hit || Response.error(); }
    }));
    return;
  }
  // The page, its code and its data: network first, so a new version shows on the first visit after it is deployed.
  // With no signal (or none within 4 seconds), the copy kept on the phone is used.
  if (url.origin === location.origin && !/^\/(tiles|vendor|icons)\//.test(url.pathname)) {
    const net = fetch(e.request).then((r) => { if (r.ok) { const copy = r.clone(); caches.open(VERSION).then((c) => c.put(e.request, copy)); } return r; });
    net.catch(() => {});   // handled below; this only stops a late failure being reported as unhandled
    const slow = new Promise((res) => setTimeout(res, 4000));
    e.respondWith(Promise.race([net, slow.then(() => caches.match(e.request, { ignoreSearch: true }))])
      .then((r) => r || net)
      .catch(() => caches.match(e.request, { ignoreSearch: true }).then((hit) => hit || Response.error())));
    return;
  }
  // map tiles and libraries never change: kept copy first
  e.respondWith(caches.match(e.request, { ignoreSearch: true }).then((hit) => {
    const net = fetch(e.request).then((r) => { if (r.ok && url.origin === location.origin) caches.open(VERSION).then((c) => c.put(e.request, r.clone())); return r; })
      .catch(() => hit);
    return hit || net;
  }));
});
// The page asks the worker to pre-download imagery for a run (a list of tile URLs).
self.addEventListener("message", (e) => {
  if (e.data && e.data.type === "cache-tiles") {
    caches.open("tiles-v1").then((c) => Promise.allSettled(e.data.urls.map((u) => c.match(u).then((h) => h || fetch(u).then((r) => r.ok && c.put(u, r))))))
      .then(() => e.source && e.source.postMessage({ type: "tiles-cached", n: e.data.urls.length }));
  }
});
