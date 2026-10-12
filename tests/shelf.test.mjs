import test from "node:test";
import assert from "node:assert/strict";
import { ALL, MAX_GROUP_NAME, isUserGroup, reconcileGroups, mergeGroups, normalize, queryMatches, cleanName, nameTaken, newGroupId, toggleMembership, sanitizeCatalog, pendingCatalog, folderTree, subtreeIds, pathLabel, siblingsOf, canNestIn, parentChoices, folderCounts, folderRows, shelfItems, fmtSize } from "../js/shelf.js";

const catalog = sanitizeCatalog({
  groups: [
    { id: "default", name: "Встроенные" },
    { id: "kids", name: "Детям", parent: "default" },
    { id: "classics", name: "Классика", parent: "default" },
  ],
  books: [
    { id: "c1", file: "kids/alice.epub", title: "Alice in Wonderland", author: "Lewis Carroll", size: 340000, groups: ["kids", "classics"] },
    { id: "c2", file: "kids/peter-rabbit.epub", title: "The Tale of Peter Rabbit", author: "Beatrix Potter", size: 90000, groups: ["kids"] },
    { id: "c3", file: "classics/dracula.epub", title: "Dracula", author: "Bram Stoker", size: 1200000, groups: ["classics"] },
  ],
});
const userGroups = [{ id: "u-1", name: "Для сестры" }];
const tree = (groups = userGroups) => folderTree({ catalog, userGroups: groups });
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
  assert.deepEqual(catalog.groups.map((g) => g.id), ["default", "kids", "classics"]);
  assert.deepEqual(catalog.groups.map((g) => g.parent), ["", "default", "default"]);
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

// ── Вложенные папки ───────────────────────────────────────────────────────

test("каталог: родитель принимается, только если он есть и сам на верхнем уровне", () => {
  const c = sanitizeCatalog({
    groups: [
      { id: "a", name: "A" },
      { id: "b", name: "B", parent: "a" },
      { id: "c", name: "C", parent: "b" },
      { id: "d", name: "D", parent: "нет-такой" },
      { id: "e", name: "E", parent: "e" },
      { id: "f", name: "F", parent: "u-1" },
    ],
    books: [],
  });
  assert.deepEqual(c.groups.map((g) => [g.id, g.parent]), [["a", ""], ["b", "a"], ["c", ""], ["d", ""], ["e", ""], ["f", ""]], "«c» лежала бы глубже одной вложенности: встаёт наверх");
});

test("дерево: встроенные первыми, свои следом; вложенные лежат у родителя", () => {
  const t = tree([{ id: "u-1", name: "Для сестры" }, { id: "u-2", name: "Мои", parent: "default" }, { id: "u-3", name: "Сказки", parent: "u-1" }]);
  assert.deepEqual(t.roots.map((n) => n.id), ["default", "u-1"]);
  assert.deepEqual(t.byId.get("default").children.map((n) => n.id), ["kids", "classics", "u-2"], "своя вложенная папка встаёт после встроенных");
  assert.deepEqual(t.byId.get("u-1").children.map((n) => n.id), ["u-3"]);
  assert.equal(t.byId.get("u-3").parent, "u-1");
  assert.equal(t.byId.get("kids").shipped, true);
  assert.equal(t.byId.get("u-2").shipped, false);
  assert.equal(t.all.length, 6);
});

test("дерево: глубже одной вложенности не бывает, потерянный родитель и цикл не ломают", () => {
  const t = tree([
    { id: "u-1", name: "Верх" },
    { id: "u-2", name: "Середина", parent: "u-1" },
    { id: "u-3", name: "Низ", parent: "u-2" },
    { id: "u-4", name: "Сирота", parent: "u-нет" },
    { id: "u-5", name: "Пять", parent: "u-6" },
    { id: "u-6", name: "Шесть", parent: "u-5" },
    { id: "u-7", name: "Сам себе", parent: "u-7" },
  ]);
  assert.equal(t.byId.get("u-2").parent, "u-1");
  assert.equal(t.byId.get("u-3").parent, null, "третий уровень встаёт на верхний");
  assert.equal(t.byId.get("u-4").parent, null);
  assert.equal(t.byId.get("u-5").parent, null);
  assert.equal(t.byId.get("u-6").parent, null);
  assert.equal(t.byId.get("u-7").parent, null);
  assert.ok(t.all.every((n) => !n.parent || !t.byId.get(n.parent).parent), "ни у одной вложенной нет вложенных");
});

test("поддерево, путь, соседи, куда можно вкладывать", () => {
  const t = tree([{ id: "u-1", name: "Для сестры" }, { id: "u-2", name: "Сказки", parent: "u-1" }]);
  assert.deepEqual(subtreeIds(t, "default"), ["default", "kids", "classics"]);
  assert.deepEqual(subtreeIds(t, "kids"), ["kids"]);
  assert.deepEqual(subtreeIds(t, "нет"), []);
  assert.equal(pathLabel(t, "u-2"), "Для сестры › Сказки");
  assert.equal(pathLabel(t, "u-1"), "Для сестры");
  assert.deepEqual(siblingsOf(t, null).map((n) => n.id), ["default", "u-1"]);
  assert.deepEqual(siblingsOf(t, "default").map((n) => n.id), ["kids", "classics"]);
  assert.deepEqual(siblingsOf(t, "нет"), []);
  assert.ok(canNestIn(t, "default"), "в «Встроенные» можно");
  assert.ok(canNestIn(t, "u-1"));
  assert.ok(!canNestIn(t, "u-2"), "во вложенную нельзя");
  assert.ok(!canNestIn(t, "kids"));
  assert.ok(!canNestIn(t, "нет"));
});

test("куда можно переложить папку: свою и не глубже одной вложенности", () => {
  const t = tree([{ id: "u-1", name: "Для сестры" }, { id: "u-2", name: "Сказки", parent: "u-1" }, { id: "u-3", name: "Пустая" }]);
  assert.deepEqual(parentChoices(t).map((n) => n.id), ["default", "u-1", "u-3"], "новая папка: любая папка верхнего уровня");
  assert.deepEqual(parentChoices(t, "u-2").map((n) => n.id), ["default", "u-1", "u-3"], "вложенную можно переложить в любую верхнюю");
  assert.deepEqual(parentChoices(t, "u-3").map((n) => n.id), ["default", "u-1"], "но не в саму себя");
  assert.deepEqual(parentChoices(t, "u-1"), [], "у папки есть вложенные: ей остаётся только верхний уровень");
});

test("счётчики папок: книги с вложенными, не скачанные тоже", () => {
  const books = [book("b1", "Alice", { catalogId: "c1", groups: ["kids", "classics", "u-1"] }), book("b2", "Своя", { groups: ["u-1"] }), book("b3", "Без папки")];
  const t = tree();
  const n = folderCounts({ books, catalog, tree: t });
  assert.equal(n.get("kids"), 2, "Alice и Peter Rabbit из каталога");
  assert.equal(n.get("classics"), 2, "Alice и Dracula");
  assert.equal(n.get("default"), 3, "Alice, Peter Rabbit, Dracula: одна книга в двух вложенных считается один раз");
  assert.equal(n.get("u-1"), 2);
});

test("строки списка папок: вложенный вид и скрытие пустых", () => {
  const t = tree([{ id: "u-1", name: "Для сестры" }, { id: "u-2", name: "Сказки", parent: "u-1" }]);
  const counts = new Map([["default", 3], ["kids", 2], ["classics", 0], ["u-1", 1], ["u-2", 1]]);
  const rows = folderRows(t, (id) => counts.get(id) ?? 0);
  assert.deepEqual(rows.map((r) => [r.id, r.count, r.children.map((c) => c.id)]), [["default", 3, ["kids", "classics"]], ["u-1", 1, ["u-2"]]]);
  const shown = folderRows(t, (id) => counts.get(id) ?? 0, { hideEmpty: true });
  assert.deepEqual(shown[0].children.map((c) => c.id), ["kids"], "«Классика» пуста: скрыта");
  assert.equal(folderRows(t, () => 0, { hideEmpty: true }).length, 0);
});

test("полка папки с вложенными: книги всех вложенных, без повторов", () => {
  const books = [book("b1", "Alice in Wonderland", { catalogId: "c1", groups: ["kids", "classics"] }), book("b2", "Своя", { groups: ["u-2"] }), book("b3", "Чужая", { groups: ["u-1"] })];
  const t = [{ id: "u-1", name: "Для сестры" }, { id: "u-2", name: "Мои", parent: "default" }];
  const all = shelfItems({ books, catalog, userGroups: t, active: "default" });
  assert.deepEqual(all.map((i) => (i.kind === "book" ? i.book.id : i.entry.id)), ["b1", "b2", "c2", "c3"], "Alice один раз; своя из «Встроенные › Мои»; не скачанные в конце");
  const mine = shelfItems({ books, catalog, userGroups: t, active: "u-1" });
  assert.deepEqual(mine.map((i) => i.book.id), ["b3"]);
});

test("поиск находит и по названию родительской папки", () => {
  const books = [book("b2", "Своя", { groups: ["u-2"] })];
  const t = [{ id: "u-2", name: "Мои", parent: "default" }];
  assert.equal(shelfItems({ books, catalog, userGroups: t, query: "встроенные" }).some((i) => i.book?.id === "b2"), true);
  assert.equal(shelfItems({ books, catalog, userGroups: t, query: "мои" }).some((i) => i.book?.id === "b2"), true);
});

test("папки из копии: вложенные встают к своему родителю, лишняя вложенность срезается", () => {
  const mine = [{ id: "u-1", name: "Для сестры", created: 1 }];
  const r = mergeGroups(mine, [
    { id: "u-3", name: "Сказки", parent: "u-2" },
    { id: "u-2", name: "Детское" },
    { id: "u-4", name: "Совсем глубоко", parent: "u-3" },
    { id: "u-5", name: "Мои", parent: "default" },
    { id: "u-6", name: "Сказки", parent: "u-1" },
  ]);
  const by = Object.fromEntries(r.groups.map((g) => [g.id, g.parent ?? null]));
  assert.equal(by["u-2"], null);
  assert.equal(by["u-3"], "u-2", "вложенная пришла раньше родителя, но встала к нему");
  assert.equal(by["u-4"], null, "третий уровень срезан");
  assert.equal(by["u-5"], "default", "родитель из встроенных сохраняется");
  assert.equal(by["u-6"], "u-1");
  assert.equal(r.added, 5);
});

test("папки из копии: одинаковое название в разных родителях это разные папки, в одном родителе — одна", () => {
  const mine = [{ id: "u-1", name: "Верх", created: 1 }, { id: "u-2", name: "Сказки", parent: "u-1", created: 2 }];
  const r = mergeGroups(mine, [{ id: "u-1", name: "Верх" }, { id: "u-9", name: "сказки", parent: "u-1" }, { id: "u-8", name: "Сказки" }]);
  assert.equal(r.map.get("u-9"), "u-2", "то же название в той же папке");
  assert.equal(r.map.get("u-8"), "u-8", "то же название, но на верхнем уровне — другая папка");
  assert.deepEqual(r.groups.map((g) => g.id), ["u-1", "u-2", "u-8"]);
});

test("папки из копии: у родителя на этом устройстве своя вложенность важнее копии", () => {
  const mine = [{ id: "u-1", name: "Верх", created: 1 }, { id: "u-2", name: "Середина", parent: "u-1", created: 2 }];
  // в копии «u-2» была верхней и в ней лежала «u-3»; здесь «u-2» уже вложена, значит «u-3» встаёт наверх
  const r = mergeGroups(mine, [{ id: "u-2", name: "Середина" }, { id: "u-3", name: "Внутри", parent: "u-2" }]);
  assert.equal(r.groups.find((g) => g.id === "u-3").parent, undefined);
});
