// sw.js — офлайн-кэш. После первой загрузки приложение целиком живёт на устройстве.
//
// Версия подставляется автоматически при публикации (.github/workflows/pages.yml): маркер в
// строке BUILD заменяется на короткий номер коммита. Поэтому при каждом обновлении репозитория
// телефон видит изменённый sw.js, скачивает свежие файлы и приложение предлагает перезапуск.
// Если маркер не заменён (запуск на компьютере или публикация «из ветки» без workflow),
// включается режим разработки: сначала сеть, кэш служит запасным вариантом без интернета.
const BUILD = "__BUILD__";
const DEV = BUILD.startsWith("__");
const CACHE = `ember-${DEV ? "dev" : BUILD}`;
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
  "js/levels.js",
  "js/session.js",
  "js/choices.js",
  "js/modes.js",
  "js/hints.js",
  "js/context.js",
  "js/judge.js",
  "js/notes.js",
  "js/shelf.js",
  "js/analysis.js",
  "js/zip.js",
  "js/epub.js",
  "js/tts.js",
  "js/views/library.js",
  "js/views/reader.js",
  "js/views/slip.js",
  "js/views/dict.js",
  "js/views/review.js",
  "js/views/settings.js",
  "js/views/dictsettings.js",
  "js/views/tasks.js",
  "js/views/level.js",
  "js/views/notes.js",
];

// Установка: кладём все файлы в новый кэш. cache: "reload" — мимо HTTP-кэша браузера,
// иначе в только что опубликованной версии могли бы оказаться файлы десятиминутной давности.
self.addEventListener("install", (e) => {
  e.waitUntil(
    caches
      .open(CACHE)
      .then((cache) =>
        Promise.all(
          FILES.map(async (f) => {
            const res = await fetch(new Request(f, { cache: "reload" }));
            if (!res.ok) throw new Error(`${f}: ${res.status}`);
            await cache.put(f, res);
          }),
        ),
      )
      .then(() => self.skipWaiting()),
  );
});

// Активация: удаляем кэши прошлых версий. Данные пользователя (IndexedDB) не затрагиваются.
self.addEventListener("activate", (e) => {
  e.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => k.startsWith("ember-") && k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

async function cacheFirst(req) {
  const hit = await caches.match(req, { ignoreSearch: true });
  if (hit) return hit;
  const res = await fetch(req);
  if (res.ok) (await caches.open(CACHE)).put(req, res.clone());
  return res;
}

async function networkFirst(req) {
  try {
    const res = await fetch(req.url, { cache: "no-cache" });
    if (res.ok) (await caches.open(CACHE)).put(req, res.clone());
    return res;
  } catch (err) {
    const hit = await caches.match(req, { ignoreSearch: true });
    if (hit) return hit;
    throw err;
  }
}

self.addEventListener("fetch", (e) => {
  const req = e.request;
  const url = new URL(req.url);
  if (req.method !== "GET" || url.origin !== location.origin) return;
  // Встроенные книги и их каталог (books/) в кэш приложения не кладём: книга после скачивания хранится в самом приложении,
  // а список книг должен приходить свежим. Без интернета каталог берётся из сохранённой копии на устройстве.
  if (url.pathname.startsWith(new URL("books/", self.registration.scope).pathname)) return;
  e.respondWith(DEV ? networkFirst(req) : cacheFirst(req));
});
