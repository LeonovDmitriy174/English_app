import test from "node:test";
import assert from "node:assert/strict";
import { W, Rating, State, newState, retrievability, intervalFor, outcomes, review, formatWait, formatDue, DEFAULTS } from "../js/fsrs.js";

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

// ── Лесенка интервалов ────────────────────────────────────────────────────
const calDays = (from, to) => Math.round((new Date(to).setHours(0, 0, 0, 0) - new Date(from).setHours(0, 0, 0, 0)) / DAY);
const wholeDays = (from, to) => calDays(from - 4 * 3600000, to - 4 * 3600000); // сутки с границей в 4:00

test("лесенка: новая карточка при ответах «Хорошо»: 10 мин, 1, 3, 7, 14 дней, дальше FSRS", () => {
  let c = newState(T0);
  let now = T0;
  const seen = [];
  for (let i = 0; i < 8; i++) {
    c = review(c, Rating.Good, now);
    seen.push(c.state === State.Review ? wholeDays(now, c.due) : `${Math.round((c.due - now) / 60000)} мин`);
    now = c.due;
  }
  assert.deepEqual(seen.slice(0, 6), ["10 мин", 1, 3, 7, 14, seen[5]]);
  assert.ok(seen[5] >= 21 && seen[5] <= 42, `после 14 дней интервал растёт, но не скачет: ${seen[5]}`);
  assert.ok(seen[6] > seen[5] && seen[7] >= seen[6], seen.join(", "));
  assert.ok(seen[6] <= seen[5] * 3, `рост не больше чем втрое: ${seen.join(", ")}`);
});

test("лесенка: срок на день и дальше выставляется на 4:00, а не «через ровно 24 часа»", () => {
  let c = review(newState(T0), Rating.Good, T0);
  c = review(c, Rating.Good, c.due);
  const d = new Date(c.due);
  assert.equal(d.getHours(), 4);
  assert.equal(d.getMinutes(), 0);
});

test("лесенка: на новой карточке 1 мин / 6 мин / 10 мин / 3 дня", () => {
  const o = outcomes(newState(T0), T0);
  assert.equal(o[1].due - T0, 60000);
  assert.equal(o[2].due - T0, 6 * 60000);
  assert.equal(o[3].due - T0, 10 * 60000);
  assert.equal(wholeDays(T0, o[4].due), 3);
});

test("лесенка: «Трудно» остаётся на той же ступени, «Легко» перепрыгивает одну", () => {
  let c = newState(T0);
  let now = T0;
  c = review(c, Rating.Good, now);
  now = c.due;
  c = review(c, Rating.Good, now); // стоим на 1 дне
  now = c.due;
  const o = outcomes(c, now);
  assert.equal(wholeDays(now, o[2].due), 1, "трудно: снова 1 день");
  assert.equal(wholeDays(now, o[3].due), 3, "хорошо: 3 дня");
  assert.equal(wholeDays(now, o[4].due), 7, "легко: 7 дней");
});

test("лесенка: «Снова» ведёт в переобучение, потом возврат на две ступени назад", () => {
  let c = newState(T0);
  let now = T0;
  for (let i = 0; i < 5; i++) {
    c = review(c, Rating.Good, now);
    now = c.due;
  } // 10 мин, 1, 3, 7, 14 → стоим на 14 днях
  assert.equal(wholeDays(c.last, c.due), 14);
  const lapsed = review(c, Rating.Again, now);
  assert.equal(lapsed.state, State.Relearning);
  assert.equal(lapsed.due - now, 10 * 60000);
  const back = review(lapsed, Rating.Good, lapsed.due);
  assert.equal(back.state, State.Review);
  assert.equal(wholeDays(lapsed.due, back.due), 3, "14 → ступень 3 дня");
});

test("лесенка: если ответили сильно позже срока, карточка поднимается выше", () => {
  let c = review(newState(T0), Rating.Good, T0);
  c = review(c, Rating.Good, c.due); // 1 день
  const late = c.last + 10 * DAY; // ждали сутки, пришли через десять
  const o = outcomes(c, late);
  assert.equal(wholeDays(late, o[3].due), 14, "прошло 10 дней: ступень 7 пройдена, «Хорошо» даёт 14");
});

test("лесенка: интервалы строго растут Трудно < Хорошо < Легко на любой ступени", () => {
  let c = newState(T0);
  let now = T0;
  for (let i = 0; i < 12; i++) {
    c = review(c, Rating.Good, now);
    now = c.due;
    const o = outcomes(c, now);
    if (c.state === State.Review && wholeDays(now, o[4].due) < 365) assert.ok(o[2].due < o[3].due && o[3].due < o[4].due, `шаг ${i}`);
  }
});

test("лесенка: карточка, сохранённая до появления лесенки (без поля rung), получает ступень по интервалу", () => {
  const old = { state: State.Review, due: T0 + 3 * DAY, stability: 4, difficulty: 5, reps: 3, lapses: 0, last: T0, step: 0 };
  const o = outcomes(old, old.due);
  assert.equal(wholeDays(old.due, o[3].due), 7);
  assert.equal(o[3].rung, 2);
});

test("без лесенки (ladder: []) работает чистый FSRS", () => {
  const o = outcomes(newState(T0), T0, { ladder: [] });
  assert.ok(o[4].due - T0 >= DAY);
  let c = review(newState(T0), Rating.Good, T0, { ladder: [] });
  c = review(c, Rating.Good, c.due, { ladder: [] });
  assert.equal(c.state, State.Review);
});

test("подпись срока: сутки считаются календарными", () => {
  const evening = new Date(2026, 9, 11, 23, 30).getTime();
  const tomorrow4 = new Date(2026, 9, 12, 4, 0).getTime();
  assert.equal(formatDue(tomorrow4, evening), "1 дн.");
  assert.equal(formatDue(evening + 10 * 60000, evening), "10 мин");
  const morning = new Date(2026, 9, 11, 9, 0).getTime();
  assert.equal(formatDue(new Date(2026, 9, 14, 4, 0).getTime(), morning), "3 дн.");
  assert.equal(formatDue(new Date(2026, 9, 25, 4, 0).getTime(), morning), "14 дн.");
});

test("две «Хорошо» подряд выводят карточку на повторение на следующих сутках", () => {
  let c = review(newState(T0), Rating.Good, T0);
  c = review(c, Rating.Good, c.due);
  assert.equal(c.state, State.Review);
  assert.ok(c.due > c.last && c.due - c.last <= 2 * DAY);
  assert.equal(new Date(c.due).getDate() !== new Date(c.last).getDate() || new Date(c.due).getMonth() !== new Date(c.last).getMonth(), true);
});

test("повторение: Трудно < Хорошо < Легко, «Снова» ведёт на переобучение", () => {
  let c = review(newState(T0), Rating.Easy, T0); // сразу в Review
  const now = c.due; // ответ ровно в срок
  const o = outcomes(c, now);
  const d = (g) => o[g].due - now;
  assert.ok(d(2) < d(3) && d(3) < d(4), `${d(2)} < ${d(3)} < ${d(4)}`);
  assert.ok(DEFAULTS.ladder.length > 0);
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
