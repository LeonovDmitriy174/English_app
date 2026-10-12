import test from "node:test";
import assert from "node:assert/strict";
import { phraseQuestion, canAskPhrase, blankIndex, PARTICLES } from "../js/phrases.js";

const seeded = (seed = 1) => () => ((seed = (seed * 1664525 + 1013904223) >>> 0) / 2 ** 32);
const mk = (w, t, m) => ({ id: `${t}:${w}`, w, t, ...(m ? { m } : {}) });
const entries = [
  mk("give up", "pv"),
  mk("give in", "pv"),
  mk("give away", "pv"),
  mk("give out", "pv"),
  mk("look after", "pv"),
  mk("come up with", "pv"),
  mk("come up against", "pv"),
  mk("piece of cake", "id"),
  mk("as usual", "id"),
  mk("as long as", "id"),
  mk("as far as", "id"),
  mk("break the ice", "id"),
  mk("under the weather", "id"),
  mk("spill the beans", "id"),
  mk("hit the road", "id"),
  mk("cost an arm and a leg", "id"),
  mk("once in a blue moon", "id"),
  mk("table", "w"),
];
const by = (id) => entries.find((e) => e.id === id);

test("какие карточки подходят", () => {
  assert.ok(canAskPhrase(by("pv:give up")));
  assert.ok(canAskPhrase(by("id:break the ice")));
  assert.ok(!canAskPhrase(by("w:table")), "слово без фразы");
  assert.ok(!canAskPhrase({ t: "pv", w: "take place" }), "второе слово не частица");
  assert.ok(!canAskPhrase({ t: "id", w: "up to" }), "в идиоме нет значимого слова");
});

test("пропускается последнее значимое слово идиомы", () => {
  assert.equal(blankIndex(["piece", "of", "cake"]), 2);
  assert.equal(blankIndex(["as", "usual"]), 1);
  assert.equal(blankIndex(["all", "sorts", "of"]), 1);
  assert.equal(blankIndex(["up", "to"]), -1);
});

test("фразовый глагол без предложения: «give ___», ответ — частица", () => {
  const q = phraseQuestion({ card: by("pv:give up"), entries, rnd: seeded(2) });
  assert.equal(q.kind, "pv");
  assert.equal(q.answer, "up");
  assert.equal(q.before, "give ");
  assert.equal(q.after, "");
  assert.equal(q.sentence, false);
  assert.equal(q.options.length, 4);
  assert.equal(q.options.filter((o) => o.ok).length, 1);
  assert.equal(q.options.find((o) => o.ok).text, "up");
});

test("неверные варианты начинаются с частиц «братьев»: give in, give away, give out", () => {
  for (let seed = 1; seed < 30; seed++) {
    const q = phraseQuestion({ card: by("pv:give up"), entries, rnd: seeded(seed) });
    const wrong = q.options.filter((o) => !o.ok).map((o) => o.text);
    for (const w of ["in", "away", "out"]) assert.ok(wrong.includes(w), `${w} должен быть среди неверных, а их ${wrong}`);
  }
});

test("все варианты — настоящие частицы, без повторов", () => {
  for (let seed = 1; seed < 30; seed++) {
    const q = phraseQuestion({ card: by("pv:look after"), entries, rnd: seeded(seed) });
    assert.equal(new Set(q.options.map((o) => o.text)).size, 4);
    for (const o of q.options) assert.ok(PARTICLES.includes(o.text), o.text);
  }
});

test("фразовый глагол в предложении: пропущена только частица, глагол остаётся в своей форме", () => {
  const s = "Tom gave up smoking last year.";
  const ctx = { s, a: 4, b: 11 };
  const q = phraseQuestion({ card: by("pv:give up"), entries, ctx, rnd: seeded(4) });
  assert.equal(q.sentence, true);
  assert.equal(q.before, "Tom gave ");
  assert.equal(q.after, " smoking last year.");
  assert.equal(q.answer, "up");
});

test("предложение, где фраза не совпала по длине, не используется", () => {
  const ctx = { s: "He came up with a plan.", a: 3, b: 12 }; // «came up» вместо «come up with»
  const q = phraseQuestion({ card: by("pv:come up with"), entries, ctx, rnd: seeded(1) });
  assert.equal(q.sentence, false);
  assert.equal(q.before, "come up ");
  assert.equal(q.answer, "with");
});

test("идиома: пропущено главное слово, неверные взяты из других идиом", () => {
  const q = phraseQuestion({ card: by("id:piece of cake"), entries, rnd: seeded(3) });
  assert.equal(q.kind, "id");
  assert.equal(q.answer, "cake");
  assert.equal(q.before, "piece of ");
  assert.equal(q.after, "");
  assert.equal(q.options.length, 4);
  const pool = new Set(["usual", "long", "far", "ice", "weather", "beans", "road", "arm", "leg", "blue", "moon", "piece", "cake", "once", "cost"]);
  for (const o of q.options) assert.ok(pool.has(o.text), o.text);
});

test("слово внутри идиомы: хвост сохраняется", () => {
  const q = phraseQuestion({ card: mk("all sorts of", "id"), entries: [...entries, mk("all sorts of", "id")], rnd: seeded(2) });
  assert.equal(q.answer, "sorts");
  assert.equal(q.before, "all ");
  assert.equal(q.after, " of");
});

test("вариант, из которого получается другая настоящая идиома, в неверные не попадает", () => {
  // «as ___ as»: long и far — разные идиомы, и подсказка-перевод у них разная, но «as far as» вместо «as long as» путает
  for (let seed = 1; seed < 40; seed++) {
    const q = phraseQuestion({ card: by("id:as long as"), entries, rnd: seeded(seed) });
    assert.equal(q.answer, "long");
    assert.ok(!q.options.some((o) => o.text === "far"), "as far as — настоящая идиома");
  }
});

test("если вариантов не хватает, задания нет", () => {
  const tiny = [mk("give up", "pv"), mk("piece of cake", "id")];
  assert.equal(phraseQuestion({ card: tiny[1], entries: tiny, rnd: seeded(1) }), null);
  assert.ok(phraseQuestion({ card: tiny[0], entries: tiny, rnd: seeded(1) }), "для частиц хватает общего списка");
  assert.equal(phraseQuestion({ card: { t: "w", w: "table" }, entries }), null);
});
