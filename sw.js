/* Kochbudget Service Worker – macht die App offline nutzbar */
const VERSION = 'v1';
const SHELL = 'kb-shell-' + VERSION;
const DATA = 'kb-data';     // Rezept-Daten (TheMealDB) & Schriften
const IMG = 'kb-img';       // Rezeptbilder
const SHELL_FILES = ['./', './index.html', './manifest.webmanifest',
  './icons/icon-192.png', './icons/icon-512.png', './icons/maskable-512.png', './icons/apple-touch-icon.png', './icons/favicon-32.png'];
const MAX_IMAGES = 400;

self.addEventListener('install', e => {
  e.waitUntil(caches.open(SHELL).then(c => c.addAll(SHELL_FILES)).then(() => self.skipWaiting()));
});
self.addEventListener('activate', e => {
  e.waitUntil(caches.keys().then(keys => Promise.all(
    keys.filter(k => k.startsWith('kb-shell-') && k !== SHELL).map(k => caches.delete(k))
  )).then(() => self.clients.claim()));
});

async function trimImages() {
  const c = await caches.open(IMG), keys = await c.keys();
  for (let i = 0; i < keys.length - MAX_IMAGES; i++) await c.delete(keys[i]);
}
// Zuerst Netz, bei Offline aus dem Cache
async function networkFirst(req, cacheName) {
  const c = await caches.open(cacheName);
  try {
    const res = await fetch(req);
    if (res && (res.ok || res.type === 'opaque')) c.put(req, res.clone());
    return res;
  } catch (err) {
    const hit = await c.match(req, { ignoreSearch: false }) || (req.mode === 'navigate' && await caches.match('./index.html'));
    if (hit) return hit;
    throw err;
  }
}
// Zuerst Cache, sonst Netz (für Bilder & Schriften)
async function cacheFirst(req, cacheName) {
  const c = await caches.open(cacheName), hit = await c.match(req);
  if (hit) return hit;
  const res = await fetch(req);
  if (res && (res.ok || res.type === 'opaque')) { c.put(req, res.clone()); if (cacheName === IMG) trimImages(); }
  return res;
}

self.addEventListener('fetch', e => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin === location.origin) {
    // App selbst: online immer die neueste Version, offline die gespeicherte
    e.respondWith(networkFirst(req, SHELL));
    return;
  }
  const h = url.hostname;
  if (h.endsWith('themealdb.com') && url.pathname.includes('/images/')) { e.respondWith(cacheFirst(req, IMG)); return; }
  if (h.endsWith('themealdb.com')) { e.respondWith(networkFirst(req, DATA)); return; }
  if (h === 'fonts.googleapis.com' || h === 'fonts.gstatic.com') { e.respondWith(cacheFirst(req, DATA)); return; }
  // heisse-preise.io & Übersetzungen: nicht im SW cachen (die App speichert die Ergebnisse selbst)
});
