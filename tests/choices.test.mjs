import test from "node:test";
import assert from "node:assert/strict";
import { Glossary } from "../js/lex.js";
import { buildChoices, optionText, kindOf } from "../js/choices.js";

// маленький генератор случайных чисел, чтобы тесты были повторяемыми
const seeded = (seed = 1) => () => ((seed = (seed * 1664525 + 1013904223) >>> 0) / 2 ** 32);

const NOUNS = ["собака", "кошка", "лошадь", "корова", "птица", "рыба", "мышь", "волк", "лиса", "медведь", "заяц", "олень"];
const entries = [
  ...NOUNS.map((ru, i) => ({ t: "w", w: `noun${i}`, pos: "noun", ru, en: `a thing ${i}` })),
  { t: "w", w: "run", pos: "verb", ru: "бежать, бегать", en: "to move fast" },
  { t: "w", w: "walk", pos: "verb", ru: "идти; ходить", en: "to move on foot" },
  { t: "w", w: "dog", pos: "noun", ru: "собака, пёс", en: "an animal" },
  { t: "w", w: "hound", pos: "noun", ru: "пёс", en: "a hunting dog" },
  { t: "id", w: "kick the bucket", pos: "idiom", ru: "умереть", en: "to die" },
  { t: "id", w: "spill the beans", pos: "idiom", ru: "выболтать секрет", en: "to reveal a secret" },
  { t: "id", w: "break a leg", pos: "idiom", ru: "ни пуха ни пера", en: "good luck" },
  { t: "id", w: "piece of cake", pos: "idiom", ru: "проще простого", en: "very easy" },
  { t: "w", w: "tantrum", pos: "noun", rm: "внезапная вспышка гнева", en: "a sudden angry outburst" },
  { t: "w", w: "scrawny", pos: "adjective", rm: "тощий и костлявый", en: "very thin" },
  { t: "w", w: "gleam", pos: "noun", rm: "слабый отблеск света", en: "a faint light" },
  { t: "w", w: "wand", pos: "noun", rm: "тонкая палочка для волшебства", en: "a thin magic rod" },
];
const g = new Glossary(entries);
const entry = (w, t = "w") => g.byId.get(`${t}:${w}`);

test("четыре варианта: один верный, остальные разные", () => {
  const r = buildChoices(entry("dog"), g, [], { rng: seeded(3) });
  assert.equal(r.options.length, 4);
  assert.equal(r.options.filter((o) => o.ok).length, 1);
  assert.equal(r.options.find((o) => o.ok).text, "собака, пёс");
  assert.equal(new Set(r.options.map((o) => o.text.toLowerCase())).size, 4);
});

test("у неверных вариантов нет общих слов с верным", () => {
  for (let seed = 1; seed <= 30; seed++) {
    const r = buildChoices(entry("dog"), g, [], { rng: seeded(seed) });
    assert.ok(!r.options.some((o) => !o.ok && /собак|пёс/.test(o.text)), `seed ${seed}: ${JSON.stringify(r.options)}`);
  }
});

test("фразы получают варианты только из фраз того же типа", () => {
  const r = buildChoices(entry("kick the bucket", "id"), g, [], { rng: seeded(5) });
  const ids = new Set(["умереть", "выболтать секрет", "ни пуха ни пера", "проще простого"]);
  assert.equal(r.options.length, 4);
  assert.ok(r.options.every((o) => ids.has(o.text)));
});

test("автоперевод сравнивается только с автопереводом, а не с короткими переводами", () => {
  assert.equal(kindOf(entry("tantrum")), "rm");
  const r = buildChoices(entry("tantrum"), g, [], { rng: seeded(2) });
  assert.equal(r.kind, "rm");
  const rm = new Set(entries.filter((e) => e.rm).map((e) => e.rm));
  assert.ok(r.options.every((o) => rm.has(o.text)));
});

test("часть речи учитывается: к существительному предлагаются существительные", () => {
  for (let seed = 1; seed <= 20; seed++) {
    const r = buildChoices(entry("noun0"), g, [], { rng: seeded(seed) });
    const verbs = new Set(["бежать, бегать", "идти; ходить"]);
    assert.ok(!r.options.some((o) => verbs.has(o.text)), `seed ${seed}`);
  }
});

test("повторяемость: тот же генератор даёт те же варианты в том же порядке", () => {
  const a = buildChoices(entry("run"), g, [], { rng: seeded(9) });
  const b = buildChoices(entry("run"), g, [], { rng: seeded(9) });
  assert.deepEqual(a, b);
});

test("порядок меняется: верный ответ не всегда на одном месте", () => {
  const spots = new Set();
  for (let seed = 1; seed <= 40; seed++) spots.add(buildChoices(entry("dog"), g, [], { rng: seeded(seed) }).options.findIndex((o) => o.ok));
  assert.equal(spots.size, 4);
});

test("карточки пользователя тоже годятся в неверные варианты", () => {
  const tiny = new Glossary([{ t: "w", w: "cat", pos: "noun", ru: "кошка", en: "an animal" }]);
  const cards = new Map([["w:owl", { id: "w:owl", t: "w", w: "owl", pos: "noun", ru: "сова", en: "a bird" }]]);
  const r = buildChoices(tiny.byId.get("w:cat"), tiny, cards, { rng: seeded(1) });
  assert.deepEqual(r.options.map((o) => o.text).sort(), ["кошка", "сова"]);
});

test("нет подходящих вариантов: null (экран перейдёт в другой режим)", () => {
  const lone = new Glossary([{ t: "w", w: "cat", pos: "noun", ru: "кошка", en: "x" }]);
  assert.equal(buildChoices(lone.byId.get("w:cat"), lone, [], { rng: seeded(1) }), null);
  assert.equal(buildChoices({ t: "w", w: "x", pos: "", ru: "", en: "" }, g, []), null);
});

test("длинный перевод на кнопке сокращается до двух смыслов", () => {
  const e = { ru: "банк, банковское учреждение; берег, откос; ряд, шеренга; запас" };
  assert.equal(optionText(e, "ru"), "банк, банковское учреждение; берег, откос");
  const long = { rm: "очень " + "длинное ".repeat(30) + "определение" };
  assert.ok(optionText(long, "rm").length <= 112 && optionText(long, "rm").endsWith("…"));
});

test("большой словарь: подбор быстрый", () => {
  const big = new Glossary(Array.from({ length: 60000 }, (_, i) => ({ t: "w", w: `слово${i}`, pos: "noun", ru: `значение номер ${i} ${"абвгд"[i % 5]}${i % 977}`, en: "x" })));
  const t0 = performance.now();
  for (let i = 0; i < 200; i++) buildChoices(big.list[i * 7], big, [], { rng: seeded(i + 1) });
  assert.ok(performance.now() - t0 < 1500, `200 вопросов за ${(performance.now() - t0).toFixed(0)} мс`);
});
