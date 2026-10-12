import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { Glossary, sentencesOf } from "../js/lex.js";
import { usable, findSpan, exampleContext, contextPool, pickContext, collectFromText, mergeFound, MAX_FOUND } from "../js/context.js";

const g = new Glossary(JSON.parse(readFileSync(new URL("./fixtures/dict-demo.json", import.meta.url), "utf8")));
const seeded = (seed = 1) => () => ((seed = (seed * 1664525 + 1013904223) >>> 0) / 2 ** 32);
const card = (w, t = "w", extra = {}) => ({ id: `${t}:${w}`, w, t, ctx: [], ...extra });
const slice = (c) => c.s.slice(c.a, c.b);

test("деление на предложения: сокращения, кавычки, пустое", () => {
  const got = [...sentencesOf('Mr. Dursley was thin. "Where is he?" asked Harry. It was late…  Nobody came')];
  assert.deepEqual(got, ["Mr. Dursley was thin.", '"Where is he?"', "asked Harry.", "It was late…", "Nobody came"], "так же делит читалка: реплика, оканчивающаяся на «?», — отдельное предложение");
  assert.deepEqual([...sentencesOf("")], []);
  assert.deepEqual([...sentencesOf("   ")], []);
});

test("пригодность предложения: слово на месте, число слов совпадает", () => {
  const c = card("screech");
  assert.ok(usable({ s: "The owl screeched loudly.", a: 8, b: 17 }, c));
  assert.ok(!usable({ s: "The owl screeched loudly.", a: 8, b: 25 }, c), "за пределами предложения");
  assert.ok(!usable({ s: "The owl screeched loudly.", a: 4, b: 17 }, c), "в пропуске два слова");
  assert.ok(!usable(null, c));
  assert.ok(usable({ s: "He had to wake up early.", a: 10, b: 17 }, card("wake up", "pv")));
  assert.ok(!usable({ s: "He had to wake early.", a: 10, b: 14 }, card("wake up", "pv")));
});

test("слово в предложении находится по любой форме", () => {
  const span = (sentence, w, t = "w") => {
    const c = g.byId.get(`${t}:${w}`);
    const r = findSpan(sentence, c, g);
    return r && sentence.slice(r.a, r.b);
  };
  assert.equal(span("The owl screeched over the garden.", "screech"), "screeched");
  assert.equal(span("Something crept along the wall.", "creep"), "crept");
  assert.equal(span("Nothing happened here at all.", "screech"), null);
});

test("фразовые глаголы и идиомы находятся целиком, разорванные не годятся для пропуска", () => {
  const wake = g.byId.get("pv:wake up");
  const r = findSpan("The Dursleys had woken up to find a letter.", wake, g);
  assert.equal("The Dursleys had woken up to find a letter.".slice(r.a, r.b), "woken up");
  assert.equal(findSpan("They had nothing to say.", wake, g), null);
  const idiom = g.byId.get("id:get a move on");
  const s = "Get a move on, I want you to leave now.";
  const r2 = findSpan(s, idiom, g);
  assert.equal(s.slice(r2.a, r2.b), "Get a move on");
});

test("пример из словаря: одиночное слово в другой форме, фраза точно, нет слова — нет предложения", () => {
  const a = exampleContext(card("grow", "w", { ex: "The plants grew quickly in spring." }), g);
  assert.equal(slice(a), "grew");
  assert.ok(a.example);
  const b = exampleContext(card("kick the bucket", "id", { ex: "The old dog finally kicked the bucket." }), g);
  assert.equal(b, null, "фраза в другой форме: надёжно не находится, пример не используем");
  const c = exampleContext(card("piece of cake", "id", { ex: "The test was a piece of cake." }), g);
  assert.equal(slice(c), "piece of cake");
  assert.equal(exampleContext(card("grow", "w", { ex: "Plants need water." }), g), null);
  assert.equal(exampleContext(card("grow"), g), null);
  assert.equal(exampleContext(card("cat", "w", { ex: "Concatenate the strings." }), g), null, "слово внутри чужого слова не считается");
});

test("пул предложений: свои, найденные и пример; повторы и негодные отсеиваются", () => {
  const c = card("screech", "w", {
    ctx: [{ s: "The owl screeched over the old house.", a: 8, b: 17 }],
    found: [
      { s: "A car screeched to a halt outside.", a: 6, b: 15 },
      { s: "The owl screeched over the old house.", a: 8, b: 17 }, // повтор
      { s: "Broken one", a: 4, b: 99 }, // за пределами
    ],
    ex: "The brakes screech loudly on that hill.",
  });
  const pool = contextPool(c, g);
  assert.equal(pool.length, 3);
  assert.deepEqual(pool.map((x) => slice(x)), ["screeched", "screeched", "screech"]);
});

test("пул предложений: короткие берутся, только если других нет", () => {
  const short = card("screech", "w", { ctx: [{ s: "It screeched.", a: 3, b: 12 }] });
  assert.equal(contextPool(short, g).length, 1);
  const mixed = card("screech", "w", { ctx: [{ s: "It screeched.", a: 3, b: 12 }, { s: "The owl screeched over the old house.", a: 8, b: 17 }] });
  assert.equal(contextPool(mixed, g).length, 1);
});

test("каждый раз другое предложение, пока их больше одного", () => {
  const c = card("screech", "w", { ctx: [{ s: "The owl screeched over the old house.", a: 8, b: 17 }], found: [{ s: "A car screeched to a halt outside.", a: 6, b: 15 }] });
  for (let seed = 1; seed <= 20; seed++) {
    const first = pickContext(c, { glossary: g, rnd: seeded(seed) });
    const second = pickContext(c, { glossary: g, last: first.s, rnd: seeded(seed + 100) });
    assert.notEqual(second.s, first.s);
  }
  const one = card("screech", "w", { ctx: [{ s: "The owl screeched over the old house.", a: 8, b: 17 }] });
  assert.equal(pickContext(one, { glossary: g, last: one.ctx[0].s }).s, one.ctx[0].s, "единственное предложение повторяется");
  assert.equal(pickContext(card("screech"), { glossary: g }), null);
});

const TEXT = [
  "The owl screeched over the garden and everyone woke up at once.",
  "He was scared. Something crept along the dark wall of the cellar slowly.",
  "A brakes screeched somewhere far away from the old road tonight.",
  "Nothing at all happened on the quiet street that morning really.",
  "The tall boy screeched and screeched until his throat was sore.",
].join(" ");

test("поиск в тексте: находит предложения нужных слов и фраз, остальное пропускает", () => {
  const wanted = new Map([
    ["w:screech", { card: g.byId.get("w:screech"), known: new Set() }],
    ["w:creep", { card: g.byId.get("w:creep"), known: new Set() }],
    ["pv:wake up", { card: g.byId.get("pv:wake up"), known: new Set() }],
  ]);
  const bucket = new Map();
  collectFromText(TEXT, { book: "B", bookId: "b1", ch: "One" }, wanted, g, bucket, { rnd: seeded(1), k: 5 });
  const screech = bucket.get("w:screech").picks;
  assert.equal(screech.length, 3);
  assert.deepEqual(screech.map(slice), ["screeched", "screeched", "screeched"]);
  assert.equal(screech[0].book, "B");
  assert.equal(screech[0].ch, "One");
  assert.equal(slice(bucket.get("w:creep").picks[0]), "crept");
  assert.equal(slice(bucket.get("pv:wake up").picks[0]), "woke up");
  for (const c of [...screech, ...bucket.get("w:creep").picks]) assert.ok(usable(c, g.byId.get(c === undefined ? "" : `w:${/screech/.test(c.s) ? "screech" : "creep"}`)));
});

test("поиск в тексте: известные предложения не повторяются, лишнее не берётся", () => {
  const known = "The owl screeched over the garden and everyone woke up at once.";
  const wanted = new Map([["w:screech", { card: g.byId.get("w:screech"), known: new Set([known]) }]]);
  const bucket = new Map();
  collectFromText(TEXT, {}, wanted, g, bucket, { rnd: seeded(1), k: 5 });
  assert.ok(!bucket.get("w:screech").picks.some((c) => c.s === known));
  const none = new Map();
  collectFromText(TEXT, {}, new Map([["w:hoodlum", { card: g.byId.get("w:hoodlum"), known: new Set() }]]), g, none, { rnd: seeded(1) });
  assert.equal(none.size, 0);
});

test("поиск в тексте: слишком короткие и слишком длинные предложения пропускаются", () => {
  const long = `The owl screeched ${"and ".repeat(40)}away.`;
  const wanted = new Map([["w:screech", { card: g.byId.get("w:screech"), known: new Set() }]]);
  const bucket = new Map();
  collectFromText(`It screeched. ${long}`, {}, wanted, g, bucket, {});
  assert.equal(bucket.size, 0);
});

test("поиск в тексте: выборка ограничена k и справедлива", () => {
  const sentences = Array.from({ length: 40 }, (_, i) => `The owl number ${i} screeched over the quiet garden tonight.`).join(" ");
  const counts = new Map();
  for (let seed = 1; seed <= 200; seed++) {
    const wanted = new Map([["w:screech", { card: g.byId.get("w:screech"), known: new Set() }]]);
    const bucket = new Map();
    collectFromText(sentences, {}, wanted, g, bucket, { rnd: seeded(seed), k: 3 });
    const picks = bucket.get("w:screech").picks;
    assert.equal(picks.length, 3);
    for (const p of picks) counts.set(p.s, (counts.get(p.s) || 0) + 1);
  }
  assert.ok(counts.size >= 35, `выбираются разные предложения: ${counts.size} из 40`);
  assert.ok(Math.max(...counts.values()) < 40, "нет явного перекоса к началу текста");
});

test("свои карточки, которых нет в словаре, тоже ищутся по слову", () => {
  const mine = { id: "w:wonky", w: "wonky", t: "w", ctx: [] };
  const wanted = new Map([[mine.id, { card: mine, known: new Set() }]]);
  const bucket = new Map();
  collectFromText("The table was a bit wonky and the chairs were wonkier still today.", {}, wanted, g, bucket, {});
  assert.equal(slice(bucket.get("w:wonky").picks[0]), "wonky");
});

test("найденные предложения: не больше MAX_FOUND, свежие вытесняют старые", () => {
  const mk = (i) => ({ s: `Sentence number ${i} here today.`, a: 0, b: 8 });
  let found = [];
  for (let i = 0; i < 4; i++) found = mergeFound(found, [mk(i), mk(i + 10)]);
  assert.equal(found.length, MAX_FOUND);
  assert.equal(found[found.length - 1].s, mk(13).s);
  assert.equal(mergeFound(found, [found[0]]).length, MAX_FOUND, "повтор не добавляется");
  assert.deepEqual(mergeFound(undefined, [mk(1)]), [mk(1)]);
});
