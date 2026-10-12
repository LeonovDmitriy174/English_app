import test from "node:test";
import assert from "node:assert/strict";
import { excerpt, newNote, noteAt, notesIn, mergeNotes, findAnchor, groupByBook, notesInFolder, noteCounts } from "../js/notes.js";
import { folderTree, subtreeSet } from "../js/shelf.js";

const base = { book: "b1", bookTitle: "Book One", ch: 2, chTitle: "Chapter", p: 5, quote: "Mr. Dursley was the director of a firm called Grunnings." };
const note = (over = {}, now = 1000) => newNote({ ...base, ...over }, now, () => 0.5);

test("новая заметка: пустой комментарий — закладка, цитата сокращается", () => {
  const n = newNote({ ...base, text: "  " }, 5000, () => 0.25);
  assert.equal(n.text, "");
  assert.equal(n.created, 5000);
  assert.equal(n.updated, 5000);
  assert.match(n.id, /^n[0-9a-z]+$/);
  const long = excerpt("слово ".repeat(100), 50);
  assert.ok(long.length <= 51 && long.endsWith("…"));
  assert.equal(excerpt("  два   слова\nв строке "), "два слова в строке");
});

test("идентификаторы разных заметок не совпадают", () => {
  const a = newNote(base, 1000);
  const b = newNote(base, 1000);
  assert.notEqual(a.id, b.id);
});

test("noteAt и notesIn находят заметки по месту", () => {
  const list = [note({ p: 1 }), note({ p: 4 }), note({ ch: 3, p: 1 }), note({ book: "b2", p: 1 })];
  assert.equal(noteAt(list, "b1", 2, 4).p, 4);
  assert.equal(noteAt(list, "b1", 2, 9), undefined);
  assert.equal(notesIn(list, "b1", 2).length, 2);
});

test("слияние: новые добавляются, свежие побеждают, старые не затирают", () => {
  const mine = [note({ p: 1, text: "моя" }, 1000)];
  const older = { ...mine[0], text: "старая", updated: 500 };
  const newer = { ...mine[0], text: "новая", updated: 2000 };
  const extra = note({ p: 9, text: "другая" }, 1500);
  let r = mergeNotes(mine, [older]);
  assert.equal(r.changed, 0);
  assert.equal(r.list[0].text, "моя");
  r = mergeNotes(mine, [newer, extra]);
  assert.equal(r.changed, 2);
  assert.equal(r.list.length, 2);
  assert.equal(r.list.find((n) => n.id === mine[0].id).text, "новая");
});

test("слияние: два разных id на одном месте дают одну заметку, остаётся свежая", () => {
  const a = { ...note({ p: 3, text: "первая" }, 1000), id: "na" };
  const b = { ...note({ p: 3, text: "вторая" }, 3000), id: "nb" };
  const r = mergeNotes([a], [b]);
  assert.equal(r.list.length, 1);
  assert.equal(r.list[0].text, "вторая");
  assert.equal(mergeNotes([b], [a]).list[0].text, "вторая");
});

test("слияние: повреждённые записи пропускаются", () => {
  const r = mergeNotes([], [null, { id: 1 }, { id: "x", book: "b", ch: "1", p: 0 }, { id: "ok", book: "b", ch: 0, p: 0 }]);
  assert.equal(r.list.length, 1);
  assert.equal(r.list[0].id, "ok");
});

test("якорь: сохранённое место, если цитата там есть", () => {
  const texts = ["one", "two", "three", "Mr. Dursley was the director of a firm called Grunnings, and more"];
  assert.equal(findAnchor(texts, note({ p: 3 })), 3);
});

test("якорь: номера сдвинулись — заметка находит абзац по цитате", () => {
  const texts = ["extra", "extra two", "one", "Mr. Dursley was the director of a firm called Grunnings, and more", "five"];
  assert.equal(findAnchor(texts, note({ p: 2 })), 3);
});

test("якорь: цитаты нигде нет — остаёмся на сохранённом номере, но не за концом главы", () => {
  const texts = ["a", "b", "c"];
  assert.equal(findAnchor(texts, note({ p: 1, quote: "совсем другой текст" })), 1);
  assert.equal(findAnchor(texts, note({ p: 40, quote: "совсем другой текст" })), 2);
  assert.equal(findAnchor([], note({ p: 3 })), 0);
});

test("якорь: цитата-предложение внутри длинного абзаца и регистр не мешают", () => {
  const texts = ["Intro.", "He said nothing. THE OWL FLEW over the house, silently. Then it was gone."];
  assert.equal(findAnchor(texts, note({ p: 0, quote: "The owl flew over the house, silently." })), 1);
});

test("группы по книгам: порядок книг, порядок внутри книги, удалённые книги в конце", () => {
  const books = [
    { id: "b2", title: "Second" },
    { id: "b1", title: "First" },
  ];
  const notes = [note({ book: "b1", ch: 3, p: 1 }), note({ book: "b1", ch: 1, p: 8 }), note({ book: "b2", ch: 0, p: 0 }), note({ book: "gone", bookTitle: "Old Book", ch: 0, p: 0 }), note({ book: "b1", ch: 1, p: 2 })];
  const g = groupByBook(notes, books);
  assert.deepEqual(g.map((x) => x.title), ["Second", "First", "Old Book"]);
  assert.deepEqual(g[1].notes.map((n) => [n.ch, n.p]), [[1, 2], [1, 8], [3, 1]]);
  assert.equal(g[2].present, false);
  assert.equal(g[0].present, true);
});

test("заметки папки: лежат в папках своей книги, вложенные папки входят в родителя", () => {
  const catalog = { groups: [{ id: "s-default", name: "Встроенные", parent: "" }, { id: "s-kids", name: "Детям", parent: "s-default" }], books: [] };
  const tree = folderTree({ catalog, userGroups: [{ id: "u-1", name: "Для сестры" }] });
  const books = [{ id: "b1", groups: ["s-kids", "u-1"] }, { id: "b2", groups: ["s-default"] }, { id: "b3", groups: [] }];
  const notes = [note({ book: "b1", p: 1 }), note({ book: "b1", p: 2 }), note({ book: "b2", p: 1 }), note({ book: "b3", p: 1 }), note({ book: "gone", p: 1 })];
  assert.equal(notesInFolder(notes, books, subtreeSet(tree, "s-kids")).length, 2);
  assert.equal(notesInFolder(notes, books, subtreeSet(tree, "u-1")).length, 2, "та же книга в двух папках: заметки видны в каждой");
  assert.equal(notesInFolder(notes, books, subtreeSet(tree, "s-default")).length, 3, "заметки «Детям» и самой «Встроенные»");
  const counts = noteCounts(notes, books, tree);
  assert.deepEqual([...counts], [["s-default", 3], ["s-kids", 2], ["u-1", 2]]);
});

test("заметки без папки и заметки удалённых книг не лежат ни в одной папке", () => {
  const tree = folderTree({ catalog: { groups: [], books: [] }, userGroups: [{ id: "u-1", name: "А" }] });
  const notes = [note({ book: "b3" }), note({ book: "gone" })];
  assert.equal(noteCounts(notes, [{ id: "b3" }], tree).get("u-1"), 0);
  assert.deepEqual(notesInFolder(notes, [{ id: "b3" }], subtreeSet(tree, "u-1")), []);
});
