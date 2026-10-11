import test from "node:test";
import assert from "node:assert/strict";
import { ALL, MAX_GROUP_NAME, isUserGroup, reconcileGroups, mergeGroups, normalize, queryMatches, cleanName, nameTaken, newGroupId, toggleMembership, sanitizeCatalog, pendingCatalog, groupChips, shelfItems, fmtSize } from "../js/shelf.js";

const catalog = sanitizeCatalog({
  groups: [
    { id: "kids", name: "Детям" },
    { id: "classics", name: "Классика" },
  ],
  books: [
    { id: "c1", file: "kids/alice.epub", title: "Alice in Wonderland", author: "Lewis Carroll", size: 340000, groups: ["kids", "classics"] },
    { id: "c2", file: "kids/peter-rabbit.epub", title: "The Tale of Peter Rabbit", author: "Beatrix Potter", size: 90000, groups: ["kids"] },
    { id: "c3", file: "classics/dracula.epub", title: "Dracula", author: "Bram Stoker", size: 1200000, groups: ["classics"] },
  ],
});
const userGroups = [{ id: "u-1", name: "Для сестры" }];
const book = (id, title, over = {}) => ({ id, title, author: "", groups: [], ...over });

test("нормализация: регистр, ё, пробелы", () => {
  assert.equal(normalize("  Ёжик   В   ТУМАНЕ "), "ежик в тумане");
  assert.equal(normalize(null), "");
});

test("поиск: все слова запроса должны встретиться, порядок и регистр не важны", () => {
  assert.ok(queryMatches("alice wonder", "Alice in Wonderland", "Lewis Carroll"));
  assert.ok(queryMatches("carroll alice", "Alice in Wonderland", "Lewis Carroll"));
  assert.ok(!queryMatches("alice dracula", "Alice in Wonderland", "Lewis Carroll"));
  assert.ok(queryMatches("   ", "что угодно"));
  assert.ok(queryMatches("детям", ["Alice", ["Детям", "Классика"]]));
});

test("название группы: пробелы, длина, повтор без учёта регистра", () => {
  assert.equal(cleanName("  Для   сестры  "), "Для сестры");
  assert.equal(cleanName("x".repeat(100)).length, MAX_GROUP_NAME);
  assert.equal(cleanName("   "), "");
  const groups = [{ id: "u-1", name: "Для сестры" }];
  assert.ok(nameTaken("для СЕСТРЫ", groups));
  assert.ok(!nameTaken("для сестры", groups, "u-1"), "переименование в то же имя разрешено");
  assert.ok(!nameTaken("Другая", groups));
});

test("идентификатор своей группы начинается с «u-» и различается", () => {
  const a = newGroupId(1000, () => 0.1);
  const b = newGroupId(1000, () => 0.9);
  assert.match(a, /^u-[0-9a-z]+$/);
  assert.notEqual(a, b);
});

test("членство: добавить и убрать группу", () => {
  assert.deepEqual(toggleMembership([], "a"), ["a"]);
  assert.deepEqual(toggleMembership(["a", "b"], "a"), ["b"]);
  assert.deepEqual(toggleMembership(undefined, "a"), ["a"]);
});

test("каталог: берётся только нужное, лишнее отбрасывается", () => {
  assert.deepEqual(catalog.groups.map((g) => g.id), ["kids", "classics"]);
  assert.equal(catalog.books.length, 3);
  assert.deepEqual(catalog.books[0].groups, ["kids", "classics"]);
  assert.deepEqual(sanitizeCatalog(null), { groups: [], books: [] });
  assert.deepEqual(sanitizeCatalog("мусор"), { groups: [], books: [] });
});

test("каталог: небезопасные пути, не-EPUB и повторы отбрасываются", () => {
  const c = sanitizeCatalog({
    groups: [{ id: "g", name: "G" }, { id: "g", name: "Повтор" }, { id: "u-evil", name: "Подмена" }, { id: "all", name: "Подмена" }, { name: "без id" }],
    books: [
      { id: "ok", file: "a/ok.epub", title: "Ok", groups: ["g", "нет-такой"] },
      { id: "up", file: "../secret.epub", title: "Up" },
      { id: "abs", file: "/etc/passwd.epub", title: "Abs" },
      { id: "url", file: "https://evil.example/x.epub", title: "Url" },
      { id: "js", file: "javascript:alert(1).epub", title: "Js" },
      { id: "txt", file: "a/book.txt", title: "Txt" },
      { id: "ok", file: "a/dup.epub", title: "Dup" },
      { file: "a/noid.epub", title: "NoId" },
      { id: "cv", file: "a/cv.epub", title: "Cv", cover: "../x.jpg" },
    ],
  });
  assert.deepEqual(c.groups.map((g) => g.id), ["g"]);
  assert.deepEqual(c.books.map((b) => b.id), ["ok", "cv"]);
  assert.deepEqual(c.books[0].groups, ["g"], "несуществующая группа убрана");
  assert.equal(c.books[1].cover, "", "обложка с «..» не принимается");
});

test("каталог: название по умолчанию и размер", () => {
  const c = sanitizeCatalog({ groups: [{ id: "g" }], books: [{ id: "x", file: "x.epub", size: "много" }] });
  assert.equal(c.groups[0].name, "g");
  assert.equal(c.books[0].title, "x");
  assert.equal(c.books[0].size, 0);
});

test("ещё не скачанные книги каталога", () => {
  const books = [book("b1", "Alice in Wonderland", { catalogId: "c1" })];
  assert.deepEqual(pendingCatalog(books, catalog).map((c) => c.id), ["c2", "c3"]);
  assert.equal(pendingCatalog([], catalog).length, 3);
});

test("чипы: «Все» первым, встроенные группы, потом свои; счёт учитывает каталог", () => {
  const books = [book("b1", "Alice in Wonderland", { catalogId: "c1", groups: ["kids", "classics"] }), book("b2", "Мои заметки", { groups: ["u-1"] }), book("b3", "Без группы")];
  const chips = groupChips({ books, catalog, userGroups });
  assert.deepEqual(chips.map((c) => c.id), [ALL, "kids", "classics", "u-1"]);
  assert.deepEqual(chips.map((c) => c.count), [3, 2, 2, 1]);
  assert.deepEqual(chips.map((c) => c.shipped), [false, true, true, false]);
});

test("полка «Все»: только книги на устройстве", () => {
  const books = [book("b1", "A"), book("b2", "B")];
  const items = shelfItems({ books, catalog, userGroups, active: ALL });
  assert.deepEqual(items.map((i) => i.kind), ["book", "book"]);
});

test("полка группы: книги группы на устройстве и ещё не скачанные из каталога", () => {
  const books = [book("b1", "Alice in Wonderland", { catalogId: "c1", groups: ["kids", "classics"] }), book("b2", "Чужая", { groups: ["u-1"] })];
  const kids = shelfItems({ books, catalog, userGroups, active: "kids" });
  assert.deepEqual(kids.map((i) => (i.kind === "book" ? i.book.id : i.entry.id)), ["b1", "c2"]);
  assert.deepEqual(kids.map((i) => i.kind), ["book", "catalog"]);
  const mine = shelfItems({ books, catalog, userGroups, active: "u-1" });
  assert.deepEqual(mine.map((i) => i.book.id), ["b2"]);
});

test("книга в нескольких группах видна в каждой", () => {
  const books = [book("b1", "Alice", { catalogId: "c1", groups: ["kids", "classics", "u-1"] })];
  for (const g of ["kids", "classics", "u-1"]) assert.equal(shelfItems({ books, catalog, userGroups, active: g }).some((i) => i.book?.id === "b1"), true, g);
});

test("общий поиск: по всей библиотеке и каталогу, активная группа не мешает", () => {
  const books = [book("b1", "Harry Potter", { author: "J. K. Rowling", groups: ["u-1"] }), book("b2", "Alice in Wonderland", { catalogId: "c1", groups: ["kids"] })];
  const items = shelfItems({ books, catalog, userGroups, active: "u-1", query: "alice" });
  assert.deepEqual(items.map((i) => i.kind), ["book"]);
  const potter = shelfItems({ books, catalog, userGroups, active: "kids", query: "potter" });
  assert.deepEqual(potter.map((i) => i.kind + ":" + (i.book?.id || i.entry.id)), ["book:b1", "catalog:c2"], "Rowling не в «kids», но поиск общий; Beatrix Potter из каталога тоже находится");
});

test("поиск находит и по названию группы, и по автору", () => {
  const books = [book("b1", "Дневник", { groups: ["u-1"] })];
  assert.equal(shelfItems({ books, catalog, userGroups, query: "сестры" }).length, 1);
  assert.deepEqual(shelfItems({ books: [], catalog, userGroups, query: "stoker" }).map((i) => i.entry.id), ["c3"]);
  assert.equal(shelfItems({ books, catalog, userGroups, query: "zzz" }).length, 0);
});

test("скачанная книга каталога в поиске не дублируется", () => {
  const books = [book("b1", "Dracula", { catalogId: "c3", groups: ["classics"] })];
  const items = shelfItems({ books, catalog, userGroups, query: "dracula" });
  assert.equal(items.length, 1);
  assert.equal(items[0].kind, "book");
});

test("размер файла для подписи", () => {
  assert.equal(fmtSize(0), "");
  assert.equal(fmtSize(500), "1 КБ");
  assert.equal(fmtSize(340000), "332 КБ");
  assert.equal(fmtSize(1_300_000), "1,2 МБ");
});

test("свои группы отличаются по префиксу", () => {
  assert.ok(isUserGroup("u-abc"));
  assert.ok(!isUserGroup("kids"));
  assert.ok(!isUserGroup(undefined));
});

test("сверка с каталогом: встроенные группы берутся из каталога, свои остаются", () => {
  const b = { id: "b1", catalogId: "c1", groups: ["classics", "u-1"] };
  assert.deepEqual(reconcileGroups(b, catalog), ["kids", "classics", "u-1"], "каталог положил книгу в обе группы");
  const moved = { id: "b2", catalogId: "c3", groups: ["kids", "u-1"] };
  assert.deepEqual(reconcileGroups(moved, catalog), ["classics", "u-1"], "книгу переложили в другую папку");
});

test("сверка с каталогом: книга не из каталога и исчезнувшие группы", () => {
  const own = { id: "b3", groups: ["u-1", "kids", "old-shipped"] };
  assert.deepEqual(reconcileGroups(own, catalog), ["kids", "u-1"], "«old-shipped» нет в каталоге — убрана");
  const gone = { id: "b4", catalogId: "removed-from-repo", groups: ["classics", "gone", "u-2"] };
  assert.deepEqual(reconcileGroups(gone, catalog), ["classics", "u-2"]);
  assert.deepEqual(reconcileGroups({ id: "b5" }, catalog), []);
});

test("группы из копии: новые добавляются, совпадения по id и названию склеиваются", () => {
  const mine = [{ id: "u-1", name: "Для сестры", created: 1 }];
  const r = mergeGroups(mine, [{ id: "u-1", name: "Для сестры" }, { id: "u-2", name: "для СЕСТРЫ" }, { id: "u-3", name: "Детективы", created: 5 }, { id: "kids", name: "Подделка" }, { id: "u-4", name: "  " }, null], 99);
  assert.deepEqual(r.groups.map((g) => g.id), ["u-1", "u-3"]);
  assert.equal(r.added, 1);
  assert.equal(r.map.get("u-2"), "u-1", "то же название — та же группа");
  assert.equal(r.map.get("u-3"), "u-3");
  assert.ok(!r.map.has("kids") && !r.map.has("u-4"));
  assert.equal(r.groups[1].created, 5);
  assert.equal(mergeGroups([], [{ id: "u-9", name: "Новая" }], 77).groups[0].created, 77);
  assert.deepEqual(mergeGroups(mine, undefined).groups, mine);
});
