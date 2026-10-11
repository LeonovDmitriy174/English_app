import test from "node:test";
import assert from "node:assert/strict";
import { W, Rating, State, newState, retrievability, intervalFor, outcomes, review, formatWait } from "../js/fsrs.js";

const DAY = 86400000;
const T0 = Date.UTC(2026, 9, 11, 8, 0, 0);

test("доля запоминания при t = стабильность равна 90 %", () => {
  for (const s of [0.5, 1, 7, 30, 200]) assert.ok(Math.abs(retrievability(s, s) - 0.9) < 1e-9);
});

test("интервал для 90 % равен стабильности", () => {
  for (const s of [1, 5, 20, 120]) assert.ok(Math.abs(intervalFor(s, 0.9) - s) < 1e-9);
});

test("новая карточка: начальная стабильность берётся из параметров", () => {
  for (const g of [1, 2, 3, 4]) {
    const c = review(newState(T0), g, T0);
    assert.ok(Math.abs(c.stability - Math.max(W[g - 1], 0.1)) < 1e-9);
    assert.ok(c.difficulty >= 1 && c.difficulty <= 10);
  }
});

test("новая карточка: шаги обучения", () => {
  const o = outcomes(newState(T0), T0);
  assert.equal(o[1].state, State.Learning);
  assert.equal(o[1].due - T0, 1 * 60000);
  assert.equal(o[3].state, State.Learning);
  assert.equal(o[3].due - T0, 10 * 60000);
  assert.equal(o[4].state, State.Review);
  assert.ok(o[4].due - T0 >= DAY);
});

test("две «Хорошо» подряд выводят карточку на повторение через сутки или больше", () => {
  let c = review(newState(T0), Rating.Good, T0);
  c = review(c, Rating.Good, c.due);
  assert.equal(c.state, State.Review);
  assert.ok(c.due - c.last >= DAY);
});

test("повторение: Трудно < Хорошо < Легко, «Снова» ведёт на переобучение", () => {
  let c = review(newState(T0), Rating.Easy, T0); // сразу в Review
  const now = c.due; // ответ ровно в срок
  const o = outcomes(c, now);
  const d = (g) => o[g].due - now;
  assert.ok(d(2) < d(3) && d(3) < d(4), `${d(2)} < ${d(3)} < ${d(4)}`);
  assert.equal(o[1].state, State.Relearning);
  assert.equal(o[1].lapses, 1);
  assert.ok(o[1].stability < c.stability);
  assert.ok(o[3].stability > c.stability);
});

test("чем позже ответ, тем сильнее рост стабильности", () => {
  const c = review(newState(T0), Rating.Easy, T0);
  const early = review(c, Rating.Good, c.last + 5 * DAY);
  const late = review(c, Rating.Good, c.last + 40 * DAY);
  assert.ok(late.stability > early.stability);
});

test("сложность остаётся в диапазоне 1–10 при любой серии ответов", () => {
  let c = review(newState(T0), Rating.Good, T0);
  let now = T0;
  for (let i = 0; i < 60; i++) {
    now = c.due + (i % 3) * DAY;
    c = review(c, [1, 2, 3, 4, 1, 4][i % 6], now);
    assert.ok(c.difficulty >= 1 && c.difficulty <= 10, `difficulty=${c.difficulty}`);
    assert.ok(Number.isFinite(c.stability) && c.stability > 0);
  }
});

test("максимальный интервал ограничен", () => {
  let c = review(newState(T0), Rating.Easy, T0);
  for (let i = 0; i < 20; i++) c = review(c, Rating.Easy, c.due);
  assert.ok(c.due - c.last <= 365 * DAY + 1000);
});

test("подписи интервалов", () => {
  assert.equal(formatWait(60000), "1 мин");
  assert.equal(formatWait(10 * 60000), "10 мин");
  assert.equal(formatWait(3 * 3600000), "3 ч");
  assert.equal(formatWait(3 * DAY), "3 дн.");
  assert.equal(formatWait(60 * DAY), "2 мес.");
});
