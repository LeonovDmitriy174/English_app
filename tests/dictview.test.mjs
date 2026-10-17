import test from "node:test";
import assert from "node:assert/strict";
import { SORTS, LEVELS, SOURCES, DEFAULTS, sourceOf, levelKey, filterCards, sortCards, activeCount, describe } from "../js/dictview.js";

const card = (w, o = {}) => ({ id: `w:${w}`, w, t: "w", ru: `р-${w}`, ctx: [], added: 1, srs: { lv: 0 }, ...o });
const SET = [
  card("apple", { added: 5, srs: { lv: 3 }, ctx: [{ s: "An apple." }] }),
  card("banana", { added: 9, srs: { lv: 0 }, src: "freq", series: "s1" }),
  card("cherry", { added: 7, srs: { lv: 7 } }),
  card("date", { added: 2, srs: { lv: 10 }, skip: true, ctx: [{ s: "A date." }] }),
  card("give up", { t: "pv", added: 4, srs: { lv: 1 }, ru: "сдаваться" }),
];

test("источник слова: проверка, книга, вручную", () => {
  assert.equal(sourceOf(SET[0]), "book");
  assert.equal(sourceOf(SET[1]), "freq");
  assert.equal(sourceOf(SET[2]), "hand");
  assert.equal(sourceOf({ src: "freq", ctx: [{ s: "x" }] }), "freq", "слово, которое добавила проверка, остаётся «из проверки», даже если потом встретилось в книге");
  assert.equal(sourceOf(undefined), "hand");
});

test("группа уровня слова: новое, учу, знаю, освоено, не повторяется", () => {
  assert.deepEqual(SET.map(levelKey), ["learning", "new", "known", "skip", "learning"]);
  assert.equal(levelKey({ skip: true, srs: { lv: 3 } }), "skip", "скрытое слово не считается ни «учу», ни «знаю»");
  assert.equal(levelKey({ srs: { lv: 10 } }), "mastered");
});

test("фильтры: тип, уровень, источник и поиск работают вместе", () => {
  const ws = (f) => filterCards(SET, f).map((c) => c.w);
  assert.deepEqual(ws({}), ["apple", "banana", "cherry", "date", "give up"]);
  assert.deepEqual(ws({ kind: "pv" }), ["give up"]);
  assert.deepEqual(ws({ level: "learning" }), ["apple", "give up"]);
  assert.deepEqual(ws({ level: "skip" }), ["date"]);
  assert.deepEqual(ws({ source: "book" }), ["apple", "date"]);
  assert.deepEqual(ws({ source: "freq" }), ["banana"]);
  assert.deepEqual(ws({ level: "learning", source: "book" }), ["apple"]);
  assert.deepEqual(ws({ query: "  CHER " }), ["cherry"], "поиск без учёта регистра и пробелов по краям");
  assert.deepEqual(ws({ query: "сдав" }), ["give up"], "поиск по переводу");
  assert.deepEqual(ws({ kind: "pv", source: "book" }), []);
});

test("порядок: новые, алфавит, слабые, сильные; при равенстве позднее добавленные первыми", () => {
  const order = (sort, list = SET) => sortCards(list, sort).map((c) => c.w);
  assert.deepEqual(order("new"), ["banana", "cherry", "apple", "give up", "date"]);
  assert.deepEqual(order("abc"), ["apple", "banana", "cherry", "date", "give up"]);
  assert.deepEqual(order("weak"), ["banana", "give up", "apple", "cherry", "date"]);
  assert.deepEqual(order("strong"), ["date", "cherry", "apple", "give up", "banana"]);
  const tie = [card("a", { added: 1 }), card("b", { added: 3 }), card("c", { added: 2 })];
  assert.deepEqual(order("weak", tie), ["b", "c", "a"], "одинаковый уровень: сначала добавленные позже");
  assert.deepEqual(order("нет такого"), order("new"), "незнакомый порядок читается как «сначала новые»");
});

test("сортировка не меняет исходный массив", () => {
  const before = SET.map((c) => c.w);
  sortCards(SET, "abc");
  assert.deepEqual(SET.map((c) => c.w), before);
});

test("число настроек и подпись на кнопке", () => {
  assert.equal(activeCount(DEFAULTS), 0);
  assert.equal(activeCount({ ...DEFAULTS, kind: "pv" }), 0, "тип стоит отдельными чипами и в число не входит");
  assert.equal(activeCount({ ...DEFAULTS, sort: "weak", level: "known" }), 2);
  assert.equal(activeCount({ sort: "abc", level: "skip", source: "freq" }), 3);
  assert.equal(describe(DEFAULTS), "");
  assert.equal(describe({ ...DEFAULTS, sort: "weak", source: "book" }), "Слабые сначала · Из книг");
  assert.equal(describe({ ...DEFAULTS, level: "learning" }), "Учу");
});

test("списки вариантов начинаются с обычного значения", () => {
  assert.equal(SORTS[0][0], DEFAULTS.sort);
  assert.equal(LEVELS[0][0], DEFAULTS.level);
  assert.equal(SOURCES[0][0], DEFAULTS.source);
  assert.deepEqual(LEVELS.map(([k]) => k), ["all", "new", "learning", "known", "mastered", "skip"]);
});
