// sw.js — офлайн-кэш. После первой загрузки приложение целиком живёт на устройстве.
// При любом изменении файлов приложения увеличьте VERSION: старый кэш будет заменён.
const VERSION = "v2";
const CACHE = `ember-${VERSION}`;
const FILES = [
  "./",
  "index.html",
  "manifest.webmanifest",
  "css/app.css",
  "data/dict.json",
  "icons/icon-192.png",
  "icons/icon-512.png",
  "icons/apple-touch-icon.png",
  "js/app.js",
  "js/dom.js",
  "js/db.js",
  "js/store.js",
  "js/lex.js",
  "js/fsrs.js",
  "js/zip.js",
  "js/epub.js",
  "js/tts.js",
  "js/views/library.js",
  "js/views/reader.js",
  "js/views/slip.js",
  "js/views/dict.js",
  "js/views/review.js",
  "js/views/settings.js",
];

self.addEventListener("install", (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(FILES)).then(() => self.skipWaiting()));
});

self.addEventListener("activate", (e) => {
  e.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => k.startsWith("ember-") && k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

// Сначала кэш; если файла нет — сеть, и найденное кладём в кэш.
self.addEventListener("fetch", (e) => {
  const req = e.request;
  if (req.method !== "GET" || new URL(req.url).origin !== location.origin) return;
  e.respondWith(
    caches.match(req, { ignoreSearch: true }).then(
      (hit) =>
        hit ||
        fetch(req).then((res) => {
          if (res.ok) caches.open(CACHE).then((c) => c.put(req, res.clone()));
          return res;
        }),
    ),
  );
});
