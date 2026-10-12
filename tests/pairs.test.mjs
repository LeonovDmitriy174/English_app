import test from "node:test";
import assert from "node:assert/strict";
import { shortMeaning, pickPairs, rightOrder, PAIRS, MIN_PAIRS } from "../js/pairs.js";

const seeded = (seed = 1) => () => ((seed = (seed * 1664525 + 1013904223) >>> 0) / 2 ** 32);
const card = (w, ru, extra = {}) => ({ id: `w:${w}`, w, ru, ...extra });

test("короткий перевод: первое значение; длинное режется по запятой; слишком длинное не берём", () => {
  assert.equal(shortMeaning(card("a", "взорвать(ся); надуть")), "взорвать(ся)");
  assert.equal(shortMeaning(card("a", "происходить, быть родом из")), "происходить, быть родом из");
  assert.equal(shortMeaning(card("a", "происходить в какой-то далёкой стране, быть родом")), "происходить в какой-то далёкой стране".length <= 28 ? "происходить в какой-то далёкой стране" : null);
  assert.equal(shortMeaning(card("a", "очень-очень-очень-очень-длинное слово без запятых")), null);
  assert.equal(shortMeaning(card("a", "", { rm: "автоперевод" })), "автоперевод");
  assert.equal(shortMeaning(card("a", "")), null);
});

test("выбирается до пяти карточек, без одинаковых слов и переводов", () => {
  const cards = [card("one", "один"), card("two", "два"), card("three", "три"), card("four", "четыре"), card("five", "пять"), card("six", "шесть"), card("seven", "семь"), card("One", "ещё один"), card("eight", "ДВА")];
  const p = pickPairs(cards, { rnd: seeded(2) });
  assert.equal(p.length, PAIRS);
  assert.equal(new Set(p.map((x) => x.w.toLowerCase())).size, PAIRS);
  assert.equal(new Set(p.map((x) => x.ru.toLowerCase())).size, PAIRS);
  for (const x of p) assert.ok(cards.some((c) => c.id === x.id && c.w === x.w));
});

test("разные заходы дают разные наборы, но берутся из начала списка", () => {
  const cards = Array.from({ length: 40 }, (_, i) => card(`w${i}`, `слово${i}`));
  const sets = new Set();
  for (let seed = 1; seed < 20; seed++) {
    const p = pickPairs(cards, { rnd: seeded(seed) });
    p.forEach((x) => assert.ok(Number(x.w.slice(1)) < PAIRS * 3, "из первых пятнадцати"));
    sets.add(p.map((x) => x.id).sort().join());
  }
  assert.ok(sets.size > 3);
});

test("меньше трёх подходящих карточек — разминки нет", () => {
  assert.equal(pickPairs([card("a", "а"), card("b", "б")]), null);
  assert.equal(pickPairs([card("a", ""), card("b", ""), card("c", ""), card("d", "")]), null);
  assert.equal(pickPairs([card("a", "а"), card("b", "б"), card("c", "в")]).length, MIN_PAIRS);
  assert.equal(pickPairs([]), null);
});

test("порядок переводов перемешан и не совпадает с порядком слов", () => {
  const pairs = ["a", "b", "c", "d", "e"].map((w) => ({ id: w, w, ru: w }));
  for (let seed = 1; seed < 60; seed++) {
    const order = rightOrder(pairs, seeded(seed));
    assert.deepEqual([...order].sort(), ["a", "b", "c", "d", "e"]);
    assert.notDeepEqual(order, ["a", "b", "c", "d", "e"]);
  }
  assert.deepEqual(rightOrder([{ id: "x" }]), ["x"]);
  const three = rightOrder(["a", "b", "c"].map((id) => ({ id })), () => 0);
  assert.notDeepEqual(three, ["a", "b", "c"]);
});
