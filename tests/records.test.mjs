// Записи из хранилища: любой мусор приводится к допустимому виду или пропускается, исправные записи не меняются.
import test from "node:test";
import assert from "node:assert/strict";
import { sanitizeCard, sanitizeBook, validStats, cleanLog, isObject } from "../js/records.js";
import { newCounter, addText, summarize } from "../js/analysis.js";
import { Glossary } from "../js/lex.js";
import { newSrs } from "../js/levels.js";

function rng(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const pick = (r, xs) => xs[Math.floor(r() * xs.length)];
const JUNK = [undefined, null, 0, -1, NaN, Infinity, "", "x", "12", [], [1, "a"], {}, { s: 1 }, true, 7.5, [null], { href: 5 }, { href: "a.xhtml", title: 1, chars: "z" }];

const good = {
  id: "b1",
  title: "Книга",
  author: "A",
  chapters: [{ href: "a.xhtml", title: "Глава", chars: 100 }],
  progress: { ch: 0, p: 0 },
  groups: ["g:1"],
  added: 1,
  parser: 3,
};

test("исправные книга и карточка возвращаются как есть (та же запись, ничего не пишется заново)", () => {
  assert.equal(sanitizeBook(good), good);
  const card = { id: "w:cat", t: "w", w: "cat", ru: "кот", ctx: [{ s: "a cat" }], srs: newSrs(1) };
  assert.equal(sanitizeCard(card), card);
});

test("разбор настоящей книги проходит проверку (иначе книгу разбирали бы заново при каждом запуске)", () => {
  const g = new Glossary([{ t: "w", w: "wand", pos: "n", ru: "палочка" }, { t: "w", w: "go", pos: "v", ru: "идти", f: ["went"] }]);
  const acc = newCounter();
  addText(acc, "The wand was old. Harry took the wand and went home. Ron went again. Harry laughed.", g);
  const st = summarize(acc, g);
  assert.ok(validStats(st), JSON.stringify(st).slice(0, 200));
  assert.equal(sanitizeBook({ ...good, stats: st }).stats, st);
  assert.equal(validStats({ ...st, top: "x" }), false);
  assert.equal(validStats({ ...st, tokens: NaN }), false);
  assert.equal(validStats(null), false);
});

test("не книга и не карточка → null", () => {
  for (const x of [undefined, null, 5, "x", [], {}, { id: "" }, { id: 5 }]) {
    assert.equal(sanitizeBook(x), null);
    assert.equal(sanitizeCard(x), null);
  }
  assert.equal(sanitizeCard({ id: "w:a" }), null, "без слова");
  assert.equal(sanitizeCard({ id: "w:a", w: "  " }), null);
  assert.equal(sanitizeCard({ id: "w:a", w: 5 }), null);
});

test("карточка с испорченными полями исправляется", () => {
  const c = sanitizeCard({ id: "pv:give up", w: "give up", t: "zzz", ru: 5, ctx: [null, { s: "x" }, { s: 5 }, "q"] });
  assert.equal(c.t, "pv", "тип по номеру");
  assert.equal(c.ru, "5");
  assert.deepEqual(c.ctx, [{ s: "x" }]);
  assert.equal(sanitizeCard({ id: "nocolon", w: "x", t: 7 }).t, "w");
});

test("книга с испорченными полями: главы, место, папки, разбор", () => {
  const b = sanitizeBook({ id: "b", title: 5, author: ["x"], chapters: "no", progress: "50%", groups: [1, "g", null], stats: "x", added: "вчера", opened: NaN });
  assert.equal(b.title, "5");
  assert.equal(b.author, "");
  assert.deepEqual(b.chapters, []);
  assert.deepEqual(b.progress, { ch: 0, p: 0 });
  assert.deepEqual(b.groups, ["g"]);
  assert.equal(b.stats, undefined);
  assert.ok(!("added" in b) && !("opened" in b));
  const c = sanitizeBook({ ...good, chapters: [null, { href: "a", title: 3, chars: -9 }, { title: "без адреса" }], progress: { ch: -3.7, p: "9", f: NaN, done: "x" } });
  assert.deepEqual(c.chapters, [{ href: "a", title: "3", chars: 0 }]);
  assert.deepEqual(c.progress, { ch: 0, p: 0 });
});

test("случайный мусор: результат всегда допустим, а повторная очистка ничего не меняет", () => {
  const r = rng(20261018);
  for (let i = 0; i < 3000; i++) {
    const raw = { id: pick(r, ["b", "b", "b", "", 5]), title: pick(r, JUNK), author: pick(r, JUNK), chapters: pick(r, [...JUNK, [pick(r, JUNK), pick(r, JUNK)], good.chapters]), progress: pick(r, [...JUNK, { ch: pick(r, JUNK), p: pick(r, JUNK), f: pick(r, JUNK), done: pick(r, JUNK) }]), groups: pick(r, JUNK), stats: pick(r, JUNK), added: pick(r, JUNK), opened: pick(r, JUNK) };
    const b = sanitizeBook(raw);
    if (raw.id === "" || raw.id === 5) {
      assert.equal(b, null);
      continue;
    }
    assert.ok(b && typeof b.title === "string" && b.title);
    assert.ok(Array.isArray(b.chapters) && b.chapters.every((c) => typeof c.href === "string" && typeof c.title === "string" && Number.isFinite(c.chars) && c.chars >= 0));
    assert.ok(Number.isInteger(b.progress.ch) && b.progress.ch >= 0 && Number.isInteger(b.progress.p) && b.progress.p >= 0);
    assert.ok(b.groups === undefined || b.groups.every((g) => typeof g === "string"));
    assert.ok(b.stats === undefined);
    assert.ok(b.added === undefined || Number.isFinite(b.added));
    assert.equal(sanitizeBook(b), b, "повторная очистка возвращает ту же запись");
    const c = sanitizeCard({ id: pick(r, ["w:a", "pv:b", "x"]), w: pick(r, ["a", "", 5, null]), t: pick(r, JUNK), ru: pick(r, JUNK), ctx: pick(r, JUNK) });
    if (c) {
      assert.ok(["w", "pv", "id"].includes(c.t) && typeof c.w === "string" && c.w.trim());
      assert.ok(["pos", "ru", "rm", "en", "ex"].every((k) => c[k] === undefined || typeof c[k] === "string"));
      assert.ok(c.ctx === undefined || (Array.isArray(c.ctx) && c.ctx.every((x) => isObject(x) && typeof x.s === "string")));
      assert.equal(sanitizeCard(c), c);
    }
  }
});

test("журнал: остаются только строки с номером слова и временем", () => {
  const rows = [null, 5, "x", {}, { id: "w:a" }, { id: "w:a", t: NaN }, { id: "w:a", t: 5 }, { id: 5, t: 5 }, [1]];
  assert.deepEqual(cleanLog(rows), [{ id: "w:a", t: 5 }]);
  assert.deepEqual(cleanLog(undefined), []);
  assert.deepEqual(cleanLog("x"), []);
});
