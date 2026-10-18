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

// Словарь большой (до десятков мегабайт) и меняется редко, поэтому у него свой кэш с именем по отпечатку содержимого.
// Отпечаток при публикации подставляет тот же workflow: пока словарь не менялся, новые версии приложения его заново не скачивают.
const DICT = "__DICT__";
const DICT_FILE = "data/dict.json";
const DICT_CACHE = `ember-dict-${DEV ? "dev" : DICT}`;

const FILES = [
  "./",
  "index.html",
  "manifest.webmanifest",
  "css/app.css",
  "icons/icon-192.png",
  "icons/icon-512.png",
  "icons/icon-maskable-512.png",
  "icons/apple-touch-icon.png",
  "data/freq.json",
  "js/app.js",
  "js/dom.js",
  "js/db.js",
  "js/build.js",
  "js/backup.js",
  "js/diag.js",
  "js/store.js",
  "js/store/state.js",
  "js/store/lexicon.js",
  "js/store/settings.js",
  "js/store/cards.js",
  "js/store/chars.js",
  "js/store/contexts.js",
  "js/store/books.js",
  "js/store/folders.js",
  "js/store/catalog.js",
  "js/store/notes.js",
  "js/store/data.js",
  "js/store/activity.js",
  "js/store/replenish.js",
  "js/dictfixes.js",
  "js/prefs.js",
  "js/lex.js",
  "js/rustem.js",
  "js/bookwords.js",
  "js/progress.js",
  "js/characters.js",
  "js/coverage.js",
  "js/dictview.js",
  "js/freqdeck.js",
  "js/research.js",
  "js/families.js",
  "js/familydata.js",
  "js/phrasedeck.js",
  "js/phrasedata.js",
  "js/pacing.js",
  "js/activity.js",
  "js/reading.js",
  "js/records.js",
  "js/charts.js",
  "js/home.js",
  "js/dictsearch.js",
  "js/levels.js",
  "js/session.js",
  "js/choices.js",
  "js/modes.js",
  "js/hints.js",
  "js/context.js",
  "js/judge.js",
  "js/forms.js",
  "js/phrases.js",
  "js/dictation.js",
  "js/pace.js",
  "js/pairs.js",
  "js/leech.js",
  "js/notes.js",
  "js/shelf.js",
  "js/nav.js",
  "js/analysis.js",
  "js/zip.js",
  "js/epub.js",
  "js/tts.js",
  "js/views/library.js",
  "js/views/reader.js",
  "js/views/slip.js",
  "js/views/characters.js",
  "js/views/dict.js",
  "js/views/replenish.js",
  "js/views/research.js",
  "js/views/phrases.js",
  "js/views/review.js",
  "js/views/settings.js",
  "js/views/dictsettings.js",
  "js/views/tasks.js",
  "js/views/pairs.js",
  "js/views/level.js",
  "js/views/notes.js",
  "js/views/folders.js",
  "js/views/backupui.js",
  "js/views/addword.js",
  "js/views/hits.js",
  "js/views/bookwords.js",
  "js/views/progress.js",
  "js/views/charts.js",
  "js/views/home.js",
  "js/views/cover.js",
];

// Установка: кладём все файлы приложения в новый кэш, а словарь в свой, если такого ещё нет. cache: "reload" — мимо HTTP-кэша
// браузера, иначе в только что опубликованной версии могли бы оказаться файлы десятиминутной давности.
async function download(file) {
  const res = await fetch(new Request(file, { cache: "reload" }));
  if (!res.ok) throw new Error(`${file}: ${res.status}`);
  return res;
}

self.addEventListener("install", (e) => {
  e.waitUntil(
    (async () => {
      const [cache, dicts] = await Promise.all([caches.open(CACHE), caches.open(DICT_CACHE)]);
      const needDict = DEV || !(await dicts.match(DICT_FILE)); // в режиме разработки словарь берём заново: он мог измениться
      await Promise.all([
        ...FILES.map(async (f) => cache.put(f, await download(f))),
        needDict && download(DICT_FILE).then((res) => dicts.put(DICT_FILE, res)),
      ]);
      await self.skipWaiting();
    })(),
  );
});

// Активация: удаляем кэши прошлых версий и старых словарей. Данные пользователя (IndexedDB) не затрагиваются.
self.addEventListener("activate", (e) => {
  e.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => k.startsWith("ember-") && k !== CACHE && k !== DICT_CACHE).map((k) => caches.delete(k))))
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
