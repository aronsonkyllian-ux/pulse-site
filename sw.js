/* PULSE service worker (v6): network first, so the numbers are always fresh; the last good copy is used only when offline.
   Scope = the folder it is served from (/pulse-site/ on GitHub Pages). */
const CACHE = "pulse-v6";
const SHELL = ["./", "index.html", "style.css", "app.js", "manifest.webmanifest", "icons/icon-192.png", "icons/icon-512.png"];
const key = url => { const u = new URL(url, self.location); return u.origin + u.pathname; };   // ignore ?t=... so the cache does not grow
self.addEventListener("install", e => { self.skipWaiting();
  e.waitUntil(caches.open(CACHE).then(c => Promise.all(SHELL.map(p => fetch(p, {cache: "no-cache"}).then(r => r.ok && c.put(key(p), r)).catch(() => {})))));
});
self.addEventListener("activate", e => { e.waitUntil(caches.keys().then(ks => Promise.all(ks.filter(k => k !== CACHE).map(k => caches.delete(k)))).then(() => self.clients.claim())); });
self.addEventListener("fetch", e => {
  const req = e.request; if (req.method !== "GET") return;
  const u = new URL(req.url); if (u.origin !== self.location.origin) return;
  e.respondWith((req.mode === "navigate" ? fetch(req) : fetch(req.url, {cache: "no-cache"})).then(r => {
    if (r && r.ok) { const copy = r.clone(); caches.open(CACHE).then(c => c.put(key(req.url), copy)); }
    return r;
  }).catch(() => caches.match(key(req.url)).then(m => m || caches.match(key("index.html")))));
});
