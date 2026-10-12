import test from "node:test";
import assert from "node:assert/strict";
import { Glossary } from "../js/lex.js";
import { bookWords, hasFrequency, timesText, COMMON_ZIPF } from "../js/bookwords.js";

const W = (w, z, extra = {}) => ({ t: "w", w, pos: "n", ru: `перевод ${w}`, ...(z === undefined ? {} : { z }), ...extra });
const glossary = new Glossary([W("wand", 3.4), W("castle", 4.5), W("house", 5.6), W("the", 7.7), W("a", 7.2), W("to", 7.4), W("mystic"), W("gloomy", 3.0, { ru: "", rm: "мрачный" }), W("nameless", 2.0, { ru: "" }), { t: "pv", w: "give up", pos: "pv", ru: "сдаваться", m: ["give up"] }]);
const top = [["w:the", 900], ["w:house", 120], ["pv:give up", 40], ["w:wand", 38], ["w:castle", 20], ["w:a", 800], ["w:to", 700], ["w:mystic", 15], ["w:gloomy", 9], ["w:nameless", 8], ["w:ghost", 7]];
const ids = (r) => r.map((x) => x.entry.id);

test("в список попадают редкие слова и фразы, частые идут первыми", () => {
  const r = bookWords({ top, glossary, cards: new Map(), known: new Set() });
  assert.deepEqual(ids(r), ["pv:give up", "w:wand", "w:castle", "w:mystic", "w:gloomy"]);
  assert.equal(r[0].n, 40);
});

test("самые обычные слова и совсем короткие не предлагаются", () => {
  const r = ids(bookWords({ top, glossary, cards: new Map(), known: new Set() }));
  for (const id of ["w:the", "w:house", "w:a", "w:to"]) assert.ok(!r.includes(id), id);
  assert.equal(COMMON_ZIPF, 5);
  // порог можно сдвинуть
  assert.ok(ids(bookWords({ top, glossary, cards: new Map(), known: new Set(), maxZ: 6 })).includes("w:house"));
});

test("слова, которые уже в словаре или помечены «Знаю», не предлагаются", () => {
  const r = bookWords({ top, glossary, cards: new Map([["w:wand", {}]]), known: new Set(["w:castle", "pv:give up"]) });
  assert.deepEqual(ids(r), ["w:mystic", "w:gloomy"]);
});

test("слова без перевода и неизвестные словарю пропускаются; автоперевод считается переводом", () => {
  const r = ids(bookWords({ top, glossary, cards: new Map(), known: new Set() }));
  assert.ok(!r.includes("w:nameless"), "нет ни перевода, ни автоперевода");
  assert.ok(!r.includes("w:ghost"), "такого слова в словаре уже нет");
  assert.ok(r.includes("w:gloomy"));
});

test("слово без данных о частоте предлагается (словарь старой сборки)", () => {
  assert.ok(ids(bookWords({ top, glossary, cards: new Map(), known: new Set() })).includes("w:mystic"));
});

test("пустые и неполные входные данные не ломают", () => {
  assert.deepEqual(bookWords({}), []);
  assert.deepEqual(bookWords({ top: undefined, glossary }), []);
  assert.deepEqual(bookWords({ top, glossary: undefined }), []);
  assert.deepEqual(bookWords({ top, glossary, cards: undefined, known: undefined }).map((x) => x.entry.id).slice(0, 1), ["pv:give up"]);
});

test("есть ли в словаре данные о частоте", () => {
  assert.equal(hasFrequency(glossary), true);
  assert.equal(hasFrequency(new Glossary([W("cat")])), false);
  assert.equal(hasFrequency(new Glossary([])), false);
  assert.equal(hasFrequency(undefined), false);
});

test("«встречается N раз» склоняется", () => {
  assert.equal(timesText(1), "встречается 1 раз");
  assert.equal(timesText(2), "встречается 2 раза");
  assert.equal(timesText(5), "встречается 5 раз");
  assert.equal(timesText(11), "встречается 11 раз");
  assert.equal(timesText(22), "встречается 22 раза");
  assert.equal(timesText(112), "встречается 112 раз");
  assert.equal(timesText(121), "встречается 121 раз");
});
