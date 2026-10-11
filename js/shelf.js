// shelf.js — книжная полка: группы, поиск, каталог встроенных книг. Чистые функции без DOM (tests/shelf.test.mjs).
//
// Устройство:
//  - Группы (папки) работают как метки: книга может лежать в нескольких группах сразу, а может ни в одной.
//    Виртуальная группа «Все» всегда показывает книги, которые уже лежат на устройстве.
//  - Свои группы создаёте вы (id вида «u-…»). Встроенные группы приходят из каталога books/catalog.json
//    вместе с книгами, которые лежат рядом с приложением; их нельзя переименовать или удалить.
//  - Книга из каталога появляется на устройстве по нажатию и дальше работает без интернета.
//  - Поиск один на всю библиотеку и каталог: группы при поиске не учитываются.

export const ALL = "all";
export const MAX_GROUP_NAME = 40;

/** Свои группы создаёте вы на устройстве (id «u-…»); остальные приходят вместе с каталогом и вам не подчиняются. */
export const isUserGroup = (id) => typeof id === "string" && id.startsWith("u-");

/** Нижний регистр, «ё» как «е», пробелы схлопнуты. */
export const normalize = (s) => String(s ?? "").toLowerCase().replace(/ё/g, "е").replace(/\s+/g, " ").trim();

/** Все слова запроса должны встретиться в тексте полей (в любом порядке). Пустой запрос подходит всему. */
export function queryMatches(query, ...fields) {
  const tokens = normalize(query).split(" ").filter(Boolean);
  if (!tokens.length) return true;
  const hay = normalize(fields.flat().join(" "));
  return tokens.every((t) => hay.includes(t));
}

/** Название группы: без лишних пробелов, не длиннее MAX_GROUP_NAME. Пустое название — пустая строка. */
export const cleanName = (s) => String(s ?? "").replace(/\s+/g, " ").trim().slice(0, MAX_GROUP_NAME).trim();

/** Есть ли уже группа с таким названием (без учёта регистра); except — id группы, которую переименовываем. */
export const nameTaken = (name, groups, except = null) => groups.some((g) => g.id !== except && normalize(g.name) === normalize(name));

/** Идентификатор своей группы. Не зависит от названия, поэтому переименование ничего не ломает. */
export const newGroupId = (now = Date.now(), rnd = Math.random) => `u-${now.toString(36)}${Math.floor(rnd() * 36 ** 3).toString(36).padStart(3, "0")}`;

/** Список групп с книгой / без неё: добавляет id, если его нет, и убирает, если есть. */
export const toggleMembership = (groups = [], id) => (groups.includes(id) ? groups.filter((g) => g !== id) : [...groups, id]);

/** Путь из каталога должен быть относительным и без «..»: так каталог не может увести за пределы books/. */
const safePath = (p) => typeof p === "string" && p.length > 0 && !/^[a-z][a-z0-9+.-]*:/i.test(p) && !p.startsWith("/") && !p.split("/").includes("..");

/**
 * Приводит содержимое books/catalog.json к знакомому виду и отбрасывает всё лишнее.
 * Возвращает { groups: [{id, name}], books: [{id, file, title, author, size, cover, groups}] }.
 */
export function sanitizeCatalog(raw) {
  const out = { groups: [], books: [] };
  if (!raw || typeof raw !== "object") return out;
  const seenGroup = new Set();
  for (const g of Array.isArray(raw.groups) ? raw.groups : []) {
    const id = typeof g?.id === "string" ? g.id.trim() : "";
    if (!id || isUserGroup(id) || id === ALL || seenGroup.has(id)) continue;
    seenGroup.add(id);
    out.groups.push({ id, name: cleanName(g.name) || id });
  }
  const seenBook = new Set();
  for (const b of Array.isArray(raw.books) ? raw.books : []) {
    const id = typeof b?.id === "string" ? b.id.trim() : "";
    if (!id || seenBook.has(id) || !safePath(b.file) || !/\.epub$/i.test(b.file)) continue;
    seenBook.add(id);
    out.books.push({
      id,
      file: b.file,
      title: String(b.title || id),
      author: String(b.author || ""),
      size: Number.isFinite(b.size) ? b.size : 0,
      cover: safePath(b.cover) ? b.cover : "",
      groups: (Array.isArray(b.groups) ? b.groups : []).filter((id2) => seenGroup.has(id2)),
    });
  }
  return out;
}

/**
 * Группы книги после сверки с каталогом: встроенные группы определяет каталог (книгу могли переложить в другую папку),
 * свои группы остаются как есть. Книга не из каталога сохраняет только те встроенные группы, которые ещё существуют.
 */
export function reconcileGroups(book, catalog) {
  const mine = (book.groups || []).filter(isUserGroup);
  const entry = book.catalogId ? catalog.books.find((c) => c.id === book.catalogId) : null;
  const known = new Set(catalog.groups.map((g) => g.id));
  const shipped = entry ? entry.groups : (book.groups || []).filter((id) => !isUserGroup(id) && known.has(id));
  return [...new Set([...shipped, ...mine])];
}

/**
 * Группы из резервной копии вливаются в свои. Тот же id или то же название (без учёта регистра) — это та же группа.
 * Возвращает { groups, map, added }: map переводит id из копии в id на этом устройстве.
 */
export function mergeGroups(mine, theirs, now = Date.now()) {
  const groups = [...mine];
  const map = new Map();
  for (const g of Array.isArray(theirs) ? theirs : []) {
    if (!g || !isUserGroup(g.id)) continue;
    const name = cleanName(g.name);
    if (!name) continue;
    const same = groups.find((x) => x.id === g.id) || groups.find((x) => normalize(x.name) === normalize(name));
    if (same) {
      map.set(g.id, same.id);
      continue;
    }
    groups.push({ id: g.id, name, created: Number.isFinite(g.created) ? g.created : now });
    map.set(g.id, g.id);
  }
  return { groups, map, added: groups.length - mine.length };
}

/** Книги каталога, которых ещё нет на устройстве. */
export function pendingCatalog(books, catalog) {
  const have = new Set(books.map((b) => b.catalogId).filter(Boolean));
  return catalog.books.filter((c) => !have.has(c.id));
}

/**
 * Группы для строки «чипов»: сначала встроенные, потом свои. count — сколько книг увидите в группе
 * (лежащих на устройстве и ещё не скачанных из каталога).
 */
export function groupChips({ books, catalog, userGroups }) {
  const pending = pendingCatalog(books, catalog);
  const count = (id) => books.filter((b) => b.groups?.includes(id)).length + pending.filter((c) => c.groups.includes(id)).length;
  return [
    { id: ALL, name: "Все", shipped: false, count: books.length },
    ...catalog.groups.map((g) => ({ ...g, shipped: true, count: count(g.id) })),
    ...userGroups.map((g) => ({ ...g, shipped: false, count: count(g.id) })),
  ];
}

/**
 * Что показать на полке. Элементы: { kind: "book", book } для книг на устройстве и { kind: "catalog", entry } для
 * книг каталога, которые ещё не скачаны.
 *  - с запросом: поиск по всей библиотеке и каталогу, группа не учитывается;
 *  - «Все»: только книги на устройстве;
 *  - группа: книги этой группы на устройстве и книги этой группы из каталога.
 */
export function shelfItems({ books, catalog, userGroups = [], active = ALL, query = "" }) {
  const names = new Map([...catalog.groups, ...userGroups].map((g) => [g.id, g.name]));
  const groupText = (ids = []) => ids.map((id) => names.get(id) || "");
  const pending = pendingCatalog(books, catalog);
  const q = normalize(query);
  if (q) {
    return [
      ...books.filter((b) => queryMatches(q, b.title, b.author, groupText(b.groups))).map((book) => ({ kind: "book", book })),
      ...pending.filter((c) => queryMatches(q, c.title, c.author, groupText(c.groups))).map((entry) => ({ kind: "catalog", entry })),
    ];
  }
  if (active === ALL) return books.map((book) => ({ kind: "book", book }));
  return [
    ...books.filter((b) => b.groups?.includes(active)).map((book) => ({ kind: "book", book })),
    ...pending.filter((c) => c.groups.includes(active)).map((entry) => ({ kind: "catalog", entry })),
  ];
}

/** Размер файла для подписи: «340 КБ», «1,2 МБ». */
export function fmtSize(bytes) {
  if (!bytes) return "";
  if (bytes < 1024 * 1024) return `${Math.max(1, Math.round(bytes / 1024))} КБ`;
  return `${(bytes / 1024 / 1024).toFixed(1).replace(".", ",")} МБ`;
}
