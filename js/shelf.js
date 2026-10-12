// shelf.js — книжная полка: папки, поиск, каталог встроенных книг. Чистые функции без DOM (tests/shelf.test.mjs).
//
// Устройство:
//  - Папки работают как метки: книга может лежать в нескольких папках сразу, а может ни в одной.
//    Виртуальная папка «Все книги» всегда показывает книги, которые уже лежат на устройстве.
//  - Вложенность одна: у папки верхнего уровня могут быть вложенные папки, а у вложенных своих уже нет
//    (всего два уровня, как в «Заметках» на iPhone, только строже). Это правило общее для книг и заметок.
//  - Открытая папка показывает книги всех своих вложенных папок: «Встроенные» это всё готовое разом.
//  - Свои папки создаёте вы (id вида «u-…»). Встроенные приходят из каталога books/catalog.json вместе с книгами,
//    которые лежат рядом с приложением: их нельзя переименовать, удалить или переложить, но внутри них можно
//    создавать свои вложенные папки. Корень books/ называется «Встроенные», его подпапки лежат внутри.
//  - Книга из каталога появляется на устройстве по нажатию и дальше работает без интернета.
//  - Поиск один на всю библиотеку и каталог: папки при поиске не учитываются.

export const ALL = "all";
export const MAX_GROUP_NAME = 40;

/** Свои папки создаёте вы на устройстве (id «u-…»); остальные приходят вместе с каталогом и вам не подчиняются. */
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

/** Название папки: без лишних пробелов, не длиннее MAX_GROUP_NAME. Пустое название — пустая строка. */
export const cleanName = (s) => String(s ?? "").replace(/\s+/g, " ").trim().slice(0, MAX_GROUP_NAME).trim();

/** Есть ли уже папка с таким названием среди переданных (без учёта регистра); except — id папки, которую переименовываем. */
export const nameTaken = (name, groups, except = null) => groups.some((g) => g.id !== except && normalize(g.name) === normalize(name));

/** Идентификатор своей папки. Не зависит от названия, поэтому переименование ничего не ломает. */
export const newGroupId = (now = Date.now(), rnd = Math.random) => `u-${now.toString(36)}${Math.floor(rnd() * 36 ** 3).toString(36).padStart(3, "0")}`;

/** Список папок книги: добавляет id, если его нет, и убирает, если есть. */
export const toggleMembership = (groups = [], id) => (groups.includes(id) ? groups.filter((g) => g !== id) : [...groups, id]);

/** Путь из каталога должен быть относительным и без «..»: так каталог не может увести за пределы books/. */
const safePath = (p) => typeof p === "string" && p.length > 0 && !/^[a-z][a-z0-9+.-]*:/i.test(p) && !p.startsWith("/") && !p.split("/").includes("..");

/**
 * Приводит содержимое books/catalog.json к знакомому виду и отбрасывает всё лишнее.
 * Возвращает { groups: [{id, name, parent}], books: [{id, file, title, author, size, cover, groups}] }.
 * parent — id папки верхнего уровня, в которой лежит эта, или "" (она сама на верхнем уровне).
 * Вложенность глубже одной в каталоге не принимается: такая папка встаёт на верхний уровень.
 */
export function sanitizeCatalog(raw) {
  const out = { groups: [], books: [] };
  if (!raw || typeof raw !== "object") return out;
  const seenGroup = new Set();
  const parents = new Map();
  for (const g of Array.isArray(raw.groups) ? raw.groups : []) {
    const id = typeof g?.id === "string" ? g.id.trim() : "";
    if (!id || isUserGroup(id) || id === ALL || seenGroup.has(id)) continue;
    seenGroup.add(id);
    parents.set(id, typeof g.parent === "string" ? g.parent.trim() : "");
    out.groups.push({ id, name: cleanName(g.name) || id, parent: "" });
  }
  for (const g of out.groups) {
    const p = parents.get(g.id);
    // родитель должен быть в каталоге, быть другой папкой и сам лежать на верхнем уровне
    if (p && p !== g.id && seenGroup.has(p) && !seenGroup.has(parents.get(p))) g.parent = p;
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

// ── Дерево папок ──────────────────────────────────────────────────────────

/**
 * Дерево папок из встроенных и своих. Узел: { id, name, shipped, parent, children }.
 * parent — настоящий родитель (id) или null. Он признаётся, только если такая папка есть и сама лежит на верхнем уровне:
 * папка с потерянным или слишком глубоким родителем встаёт на верхний уровень (вложенность не бывает глубже одной).
 * Порядок: встроенные, потом свои, как они лежат в списках.
 * Возвращает { roots, all, byId }.
 */
export function folderTree({ catalog, userGroups = [] }) {
  const flat = [
    ...catalog.groups.map((g) => ({ id: g.id, name: g.name, shipped: true, raw: g.parent || null })),
    ...userGroups.map((g) => ({ id: g.id, name: g.name, shipped: false, raw: g.parent || null })),
  ];
  const rawParent = new Map(flat.map((n) => [n.id, n.raw]));
  // вложенной папка считается, если родитель есть и сам не вложен (иначе вышло бы глубже одной вложенности)
  const nested = (n) => !!n.raw && n.raw !== n.id && rawParent.has(n.raw) && !rawParent.has(rawParent.get(n.raw));
  const all = flat.map((n) => ({ id: n.id, name: n.name, shipped: n.shipped, parent: nested(n) ? n.raw : null, children: [] }));
  const byId = new Map(all.map((n) => [n.id, n]));
  const roots = [];
  for (const n of all) (n.parent ? byId.get(n.parent).children : roots).push(n);
  return { roots, all, byId };
}

/** id папки и всех её вложенных папок. */
export function subtreeIds(tree, id) {
  const n = tree.byId.get(id);
  return n ? [n.id, ...n.children.map((c) => c.id)] : [];
}

/** Название с родителем, если он есть: «Для сестры › Сказки». */
export function pathLabel(tree, id) {
  const n = tree.byId.get(id);
  if (!n) return "";
  const p = n.parent ? tree.byId.get(n.parent) : null;
  return p ? `${p.name} › ${n.name}` : n.name;
}

/** Папки, среди которых названия не должны повторяться: те, что лежат в parent (null — на верхнем уровне). */
export function siblingsOf(tree, parent = null) {
  if (!parent) return tree.roots;
  return tree.byId.get(parent)?.children || [];
}

/** Можно ли создать или положить папку внутрь parent: такая папка есть и сама лежит на верхнем уровне. */
export function canNestIn(tree, parent) {
  const p = tree.byId.get(parent);
  return !!p && !p.parent;
}

/**
 * Куда можно положить свою папку id: на верхний уровень (null) или в любую папку верхнего уровня, кроме неё самой.
 * Если в папке id уже есть вложенные, глубже её не спрятать: выбор только один — верхний уровень.
 * Без id (новая папка) подходит любая папка верхнего уровня.
 */
export function parentChoices(tree, id = null) {
  if (id && (tree.byId.get(id)?.children.length ?? 0) > 0) return [];
  return tree.roots.filter((n) => n.id !== id);
}

/** То же, что subtreeIds, но в виде множества: удобно спрашивать «лежит ли книга в этой папке». */
export const subtreeSet = (tree, id) => new Set(subtreeIds(tree, id));

/**
 * Папки из резервной копии вливаются в свои. Тот же id или то же название в той же папке (без учёта регистра) — это та же папка.
 * Сначала берутся папки верхнего уровня, потом вложенные: вложенная встаёт к тому же родителю на этом устройстве.
 * Если родителя в копии нет или он сам вложенный, папка встаёт на верхний уровень. Родитель из встроенных (s-…) остаётся как есть.
 * Возвращает { groups, map, added }: map переводит id из копии в id на этом устройстве.
 */
export function mergeGroups(mine, theirs, now = Date.now()) {
  const groups = [...mine];
  const map = new Map();
  const list = (Array.isArray(theirs) ? theirs : []).filter((g) => g && isUserGroup(g.id) && cleanName(g.name));
  const own = new Set(list.map((g) => g.id));
  const parentOf = (g) => (typeof g.parent === "string" && g.parent && g.parent !== g.id ? g.parent : null);
  const addAll = (items, resolve) => {
    for (const g of items) {
      const name = cleanName(g.name);
      let parent = resolve(parentOf(g));
      if (parent && groups.find((x) => x.id === parent)?.parent) parent = null; // родитель на этом устройстве сам вложенный
      const same = groups.find((x) => x.id === g.id) || groups.find((x) => normalize(x.name) === normalize(name) && (x.parent || null) === parent);
      if (same) {
        map.set(g.id, same.id);
        continue;
      }
      groups.push({ id: g.id, name, created: Number.isFinite(g.created) ? g.created : now, ...(parent ? { parent } : {}) });
      map.set(g.id, g.id);
    }
  };
  const isNested = (g) => parentOf(g) && own.has(parentOf(g));
  addAll(list.filter((g) => !isNested(g)), (p) => (p && !own.has(p) ? p : null));
  addAll(list.filter(isNested), (p) => map.get(p) || null);
  return { groups, map, added: groups.length - mine.length };
}

/**
 * Папки книги после сверки с каталогом: встроенные папки определяет каталог (книгу могли переложить в другую подпапку),
 * свои папки остаются как есть. Книга не из каталога сохраняет только те встроенные папки, которые ещё существуют.
 */
export function reconcileGroups(book, catalog) {
  const mine = (book.groups || []).filter(isUserGroup);
  const entry = book.catalogId ? catalog.books.find((c) => c.id === book.catalogId) : null;
  const known = new Set(catalog.groups.map((g) => g.id));
  const shipped = entry ? entry.groups : (book.groups || []).filter((id) => !isUserGroup(id) && known.has(id));
  return [...new Set([...shipped, ...mine])];
}

/** Книги каталога, которых ещё нет на устройстве. */
export function pendingCatalog(books, catalog) {
  const have = new Set(books.map((b) => b.catalogId).filter(Boolean));
  return catalog.books.filter((c) => !have.has(c.id));
}

/**
 * Сколько книг в каждой папке (с вложенными): лежащих на устройстве и ещё не скачанных из каталога.
 * Возвращает Map id → число.
 */
export function folderCounts({ books, catalog, tree }) {
  const pending = pendingCatalog(books, catalog);
  const counts = new Map();
  for (const n of tree.all) {
    const ids = subtreeSet(tree, n.id);
    const inside = (list) => list.filter((x) => x.groups?.some((g) => ids.has(g))).length;
    counts.set(n.id, inside(books) + inside(pending));
  }
  return counts;
}

/**
 * Строки списка папок: вложенный вид { id, name, shipped, count, children } по дереву.
 * countOf(id) даёт число для строки; hideEmpty убирает папки без единого элемента (так заметки показывают только нужное).
 */
export function folderRows(tree, countOf, { hideEmpty = false } = {}) {
  const rows = (nodes) =>
    nodes
      .map((n) => ({ id: n.id, name: n.name, shipped: n.shipped, count: countOf(n.id), children: rows(n.children) }))
      .filter((r) => !hideEmpty || r.count > 0);
  return rows(tree.roots);
}

/**
 * Что показать на полке. Элементы: { kind: "book", book } для книг на устройстве и { kind: "catalog", entry } для
 * книг каталога, которые ещё не скачаны.
 *  - с запросом: поиск по всей библиотеке и каталогу, папка не учитывается;
 *  - «Все книги»: только книги на устройстве;
 *  - папка: книги этой папки и её вложенных папок: и на устройстве, и из каталога.
 */
export function shelfItems({ books, catalog, userGroups = [], active = ALL, query = "" }) {
  const tree = folderTree({ catalog, userGroups });
  const groupText = (ids = []) =>
    ids.flatMap((id) => {
      const n = tree.byId.get(id);
      return n ? [n.name, n.parent ? tree.byId.get(n.parent).name : ""] : [];
    });
  const pending = pendingCatalog(books, catalog);
  const q = normalize(query);
  if (q) {
    return [
      ...books.filter((b) => queryMatches(q, b.title, b.author, groupText(b.groups))).map((book) => ({ kind: "book", book })),
      ...pending.filter((c) => queryMatches(q, c.title, c.author, groupText(c.groups))).map((entry) => ({ kind: "catalog", entry })),
    ];
  }
  if (active === ALL) return books.map((book) => ({ kind: "book", book }));
  const ids = subtreeSet(tree, active);
  const inside = (x) => x.groups?.some((g) => ids.has(g));
  return [
    ...books.filter(inside).map((book) => ({ kind: "book", book })),
    ...pending.filter(inside).map((entry) => ({ kind: "catalog", entry })),
  ];
}

/** Размер файла для подписи: «340 КБ», «1,2 МБ». */
export function fmtSize(bytes) {
  if (!bytes) return "";
  if (bytes < 1024 * 1024) return `${Math.max(1, Math.round(bytes / 1024))} КБ`;
  return `${(bytes / 1024 / 1024).toFixed(1).replace(".", ",")} МБ`;
}
