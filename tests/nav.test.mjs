import test from "node:test";
import assert from "node:assert/strict";
import { lastPage, pageHash, folderFromHash, remember, tabHref } from "../js/nav.js";

test("адрес страницы: без папки, с папкой, с русским названием в идентификаторе", () => {
  assert.equal(pageHash("library"), "#/library");
  assert.equal(pageHash("notes", "all"), "#/notes/all");
  const h = pageHash("library", "s-классика");
  assert.ok(!/[а-я]/i.test(h), "кириллица в адресе кодируется");
  assert.equal(folderFromHash(h.split("/")[2]), "s-классика");
});

test("папка из адреса: пусто, испорченное кодирование", () => {
  assert.equal(folderFromHash(undefined), "");
  assert.equal(folderFromHash(""), "");
  assert.equal(folderFromHash("%E0%A4%A"), "", "битая последовательность не роняет приложение");
});

test("вкладка помнит свою страницу, открытая вкладка ведёт к началу", () => {
  remember("library", "u-abc");
  remember("notes", undefined);
  remember("dict", "x"); // чужие вкладки не запоминаются
  assert.equal(lastPage.library, "#/library/u-abc");
  assert.equal(lastPage.notes, "#/notes");
  assert.equal(tabHref("library", "notes"), "#/library/u-abc", "с другой вкладки возвращаемся туда, где были");
  assert.equal(tabHref("library", "library"), "#/library", "касание открытой вкладки возвращает к списку папок");
  assert.equal(tabHref("dict", "library"), "#/dict");
});

test("место вкладки помнится между запусками; испорченная запись и закрытое хранилище не мешают", async () => {
  const mem = new Map();
  globalThis.localStorage = { getItem: (k) => mem.get(k) ?? null, setItem: (k, v) => mem.set(k, v) };
  try {
    const first = await import("../js/nav.js?запуск1");
    first.remember("library", "u-abc");
    assert.equal(JSON.parse(mem.get("ember.lastPage")).library, "#/library/u-abc");
    const second = await import("../js/nav.js?запуск2");
    assert.equal(second.lastPage.library, "#/library/u-abc", "после перезапуска книги открываются в той же папке");
    assert.equal(second.lastPage.notes, "#/notes");

    mem.set("ember.lastPage", JSON.stringify({ library: "#/dict/evil", notes: 5 }));
    const bad = await import("../js/nav.js?запуск3");
    assert.deepEqual(bad.lastPage, { library: "#/library", notes: "#/notes" }, "чужие адреса и мусор не принимаются");
    mem.set("ember.lastPage", "{не json");
    assert.equal((await import("../js/nav.js?запуск4")).lastPage.library, "#/library");

    globalThis.localStorage = { getItem: () => { throw new Error("закрыто"); }, setItem: () => { throw new Error("закрыто"); } };
    const closed = await import("../js/nav.js?запуск5");
    closed.remember("library", "x");
    assert.equal(closed.lastPage.library, "#/library/x", "без хранилища всё работает, просто не запоминается");
  } finally {
    delete globalThis.localStorage;
  }
});
