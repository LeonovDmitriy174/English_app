import test from "node:test";
import assert from "node:assert/strict";
import { newSrs, answer, dueFor, fromLegacy, isNew, isMastered, MAX_LEVEL, WAITS } from "../js/levels.js";

const MIN = 60000;
const DAY = 86400000;
const T0 = new Date(2026, 9, 11, 15, 0).getTime(); // 11 октября 2026, 15:00 местного времени
const cal = (a, b) => Math.round((new Date(b - 4 * 3600000).setHours(0, 0, 0, 0) - new Date(a - 4 * 3600000).setHours(0, 0, 0, 0)) / DAY);

test("новая карточка: ни одного ответа, уровень 0", () => {
  const s = newSrs(T0);
  assert.equal(s.lv, 0);
  assert.ok(isNew(s));
});

test("верные ответы подряд ведут по лесенке: 1 мин, 10 мин, 1, 3, 7, 14, 30, 60, 120, 240 дней", () => {
  let s = newSrs(T0);
  let now = T0;
  const got = [];
  for (let i = 0; i < 10; i++) {
    s = answer(s, "ok", { now });
    got.push(s.lv <= 2 ? `${Math.round((s.due - now) / MIN)} мин` : cal(now, s.due));
    now = s.due;
  }
  assert.deepEqual(got, ["1 мин", "10 мин", 1, 3, 7, 14, 30, 60, 120, 240]);
  assert.equal(s.lv, MAX_LEVEL);
});

test("выше последнего уровня не растёт", () => {
  let s = { lv: MAX_LEVEL, due: T0, last: T0, reps: 9, lapses: 0 };
  s = answer(s, "ok", { now: T0 });
  assert.equal(s.lv, MAX_LEVEL);
});

test("ошибка опускает слово на два уровня, но не ниже первого", () => {
  const got = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map((lv) => answer({ lv, due: T0, last: T0, reps: 5, lapses: 0 }, "no", { now: T0 }).lv);
  assert.deepEqual(got, [1, 1, 1, 2, 3, 4, 5, 6, 7, 8]);
  const s = answer({ lv: 8, due: T0, last: T0, reps: 5, lapses: 0 }, "no", { now: T0 });
  assert.equal(cal(T0, s.due), 14, "с восьмого уровня на шестой: слово вернётся через 14 дней, а не через минуту");
  assert.equal(s.lapses, 1, "ошибка считается срывом");
  const low = answer({ lv: 2, due: T0, last: T0, reps: 5, lapses: 0 }, "no", { now: T0 });
  assert.equal(low.due - T0, MIN, "на первом уровне слово возвращается через минуту");
});

test("в письменных режимах ошибка тоже на два уровня вниз, но не ниже второго, и никогда не поднимает", () => {
  const got = [1, 2, 3, 4, 5, 6, 8].map((lv) => answer({ lv, due: T0, last: T0, reps: 5, lapses: 0 }, "no", { now: T0, written: true }).lv);
  assert.deepEqual(got, [1, 2, 2, 2, 3, 4, 6]);
  const s = answer({ lv: 3, due: T0, last: T0, reps: 5, lapses: 0 }, "no", { now: T0, written: true });
  assert.equal(s.due - T0, 10 * MIN, "на втором уровне: через десять минут");
  assert.equal(answer({ lv: 1, due: T0, last: T0, reps: 1, lapses: 0 }, "no", { now: T0, written: true }).lv, 1, "с первого уровня на второй не прыгаем");
});

test("повторная ошибка в том же заходе: уровень и срывы не меняются, срок считается заново", () => {
  const first = answer({ lv: 8, due: T0, last: T0, reps: 9, lapses: 1 }, "no", { now: T0 });
  assert.equal(first.lv, 6);
  assert.equal(first.lapses, 2);
  const again = answer(first, "no", { now: T0 + MIN, repeat: true });
  assert.equal(again.lv, 6, "второй штраф не накладывается");
  assert.equal(again.lapses, 2, "срыв не считается второй раз");
  assert.equal(again.reps, first.reps + 1, "но повторение засчитано");
  const fresh = answer(newSrs(T0), "no", { now: T0, repeat: true });
  assert.equal(fresh.lv, 1, "у новой карточки повтор ничего не меняет");
});

test("выученное слово не пропадает из выученных из-за одной ошибки", () => {
  const s = answer({ lv: 8, due: T0, last: T0, reps: 9, lapses: 0 }, "no", { now: T0 });
  assert.ok(s.lv >= 4, "освоенное слово остаётся выше четвёртого уровня");
});

test("«почти» и «с подсказкой»: уровень не меняется", () => {
  const s = answer({ lv: 4, due: T0, last: T0, reps: 5, lapses: 0 }, "near", { now: T0 });
  assert.equal(s.lv, 4);
  assert.equal(cal(T0, s.due), 3);
  assert.equal(s.lapses, 0);
});

test("ошибка на новой карточке: уровень 1, срыв не считается", () => {
  const s = answer(newSrs(T0), "no", { now: T0 });
  assert.equal(s.lv, 1);
  assert.equal(s.lapses, 0);
});

test("сроки в днях выставляются на 4:00 нужного дня", () => {
  for (const lv of [3, 4, 5, 6, 7]) {
    const d = new Date(dueFor(lv, T0));
    assert.equal(d.getHours(), 4, `уровень ${lv}`);
    assert.equal(d.getMinutes(), 0);
  }
  assert.equal(cal(T0, dueFor(3, T0)), 1);
});

test("вечерний ответ: «через 1 день» это завтра утром, а не послезавтра", () => {
  const evening = new Date(2026, 9, 11, 23, 40).getTime();
  const due = dueFor(3, evening);
  assert.equal(new Date(due).getDate(), 12);
  assert.ok(due - evening < DAY);
});

test("освоено: выше шестого уровня", () => {
  assert.ok(!isMastered({ lv: 6 }));
  assert.ok(isMastered({ lv: 7 }));
});

test("перенос карточек из старого формата (FSRS)", () => {
  assert.equal(fromLegacy({ state: 0, due: T0 }).lv, 0);
  assert.equal(fromLegacy({ state: 1, step: 0, due: T0, last: T0 }).lv, 1);
  assert.equal(fromLegacy({ state: 1, step: 1, due: T0, last: T0 }).lv, 2);
  assert.equal(fromLegacy({ state: 2, due: T0 + 3 * DAY, last: T0, reps: 4 }).lv, 4);
  assert.equal(fromLegacy({ state: 2, due: T0 + 16 * DAY, last: T0 }).lv, 6);
  assert.equal(fromLegacy({ state: 2, due: T0 + 90 * DAY, last: T0 }).lv, 8);
  assert.equal(fromLegacy({ state: 3, step: 0, due: T0, last: T0, lapses: 2 }).lapses, 2);
  assert.equal(WAITS.length, 10);
});

test("потолок: верный ответ не поднимает слово выше потолка задания и не отнимает уже набранное", () => {
  let s = { lv: 2, due: T0, last: T0, reps: 2, lapses: 0 };
  s = answer(s, "ok", { now: T0, cap: 3 });
  assert.equal(s.lv, 3);
  s = answer(s, "ok", { now: T0, cap: 3 });
  assert.equal(s.lv, 3, "на потолке уровень не растёт");
  assert.equal(s.reps, 4, "но повторение засчитывается");
  const high = answer({ lv: 6, due: T0, last: T0, reps: 9, lapses: 0 }, "ok", { now: T0, cap: 3 });
  assert.equal(high.lv, 6, "слово выше потолка остаётся на своём уровне, а не падает");
  assert.equal(answer(newSrs(T0), "ok", { now: T0, cap: 3 }).lv, 1);
});

test("потолок не мешает ошибке: штраф работает как обычно", () => {
  const s = answer({ lv: 5, due: T0, last: T0, reps: 9, lapses: 0 }, "no", { now: T0, cap: 3 });
  assert.equal(s.lv, 3);
});
