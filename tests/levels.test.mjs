import test from "node:test";
import assert from "node:assert/strict";
import { newSrs, answer, dueFor, dueInDays, fromLegacy, isNew, isMastered, isLeech, MAX_LEVEL, WAITS, PIPS, KNOWN, LADDER, OLD_TO_NEW, levelInLadder, needsMigration, migrateSrs } from "../js/levels.js";

const MIN = 60000;
const HOUR = 3600000;
const DAY = 86400000;
const T0 = new Date(2026, 9, 11, 15, 0).getTime(); // 11 октября 2026, 15:00 местного времени
const hours = (a, b) => (b - a) / HOUR;

test("новая карточка: ни одного ответа, уровень 0", () => {
  const s = newSrs(T0);
  assert.equal(s.lv, 0);
  assert.ok(isNew(s));
});

test("верные ответы подряд ведут по лесенке: 10 мин, 1 час, 12 часов, 1, 2, 3, 5, 7, 14, 28 дней", () => {
  let s = newSrs(T0);
  let now = T0;
  const got = [];
  for (let i = 0; i < 10; i++) {
    s = answer(s, "ok", { now });
    got.push(hours(now, s.due));
    now = s.due;
  }
  assert.deepEqual(got.slice(0, 3), [1 / 6, 1, 12], "первые сутки: 10 минут, час, 12 часов");
  [1, 2, 3, 5, 7, 14, 28].forEach((n, i) => {
    const h = got[3 + i];
    assert.ok(h >= (n - 0.5) * 24 - 1e-9 && h <= (n + 0.5) * 24 + 1e-9, `уровень ${4 + i}: через ${n} дн., вышло ${h} ч`);
  });
  assert.equal(s.lv, MAX_LEVEL);
  assert.equal(WAITS.length, 10);
  assert.equal(PIPS, MAX_LEVEL, "по точке на уровень");
});

test("за день слово не взлетает: утро, день и вечер дают три уровня, и к утру оно ещё «учится»", () => {
  // раньше 1 мин и 10 мин позволяли набрать три уровня меньше чем за 11 минут
  const at = (h) => new Date(2026, 9, 11, h, 0).getTime();
  let s = answer(newSrs(at(9)), "ok", { now: at(9) });
  s = answer(s, "ok", { now: at(13) });
  s = answer(s, "ok", { now: at(19) });
  assert.equal(s.lv, 3);
  assert.equal(s.due - at(19), 12 * HOUR, "после трёх занятий за день следующее повторение лишь через 12 часов");
  assert.ok(s.lv < KNOWN);
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
  const wait = hours(T0, s.due);
  assert.ok(s.lv === 6 && wait >= 2.5 * 24 && wait <= 3.5 * 24, "с восьмого уровня на шестой: слово вернётся через 3 дня, а не через 10 минут");
  assert.equal(s.lapses, 1, "ошибка считается срывом");
  const low = answer({ lv: 2, due: T0, last: T0, reps: 5, lapses: 0 }, "no", { now: T0 });
  assert.equal(low.due - T0, 10 * MIN, "на первом уровне слово возвращается через десять минут");
});

test("в письменных режимах ошибка тоже на два уровня вниз, но не ниже второго, и никогда не поднимает", () => {
  const got = [1, 2, 3, 4, 5, 6, 8].map((lv) => answer({ lv, due: T0, last: T0, reps: 5, lapses: 0 }, "no", { now: T0, written: true }).lv);
  assert.deepEqual(got, [1, 2, 2, 2, 3, 4, 6]);
  const s = answer({ lv: 3, due: T0, last: T0, reps: 5, lapses: 0 }, "no", { now: T0, written: true });
  assert.equal(s.due - T0, HOUR, "на втором уровне: через час");
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
  for (const lv of [8, 9, 10]) {
    const s = answer({ lv, due: T0, last: T0, reps: 9, lapses: 0 }, "no", { now: T0 });
    assert.ok(s.lv >= KNOWN, `с уровня ${lv} слово остаётся «Знаю»`);
  }
});

test("«почти» и «с подсказкой»: уровень не меняется", () => {
  const s = answer({ lv: 6, due: T0, last: T0, reps: 5, lapses: 0 }, "near", { now: T0 });
  assert.equal(s.lv, 6);
  assert.ok(hours(T0, s.due) >= 2.5 * 24 && hours(T0, s.due) <= 3.5 * 24, "срок прежний: три дня");
  assert.equal(s.lapses, 0);
});

test("ошибка на новой карточке: уровень 1, срыв не считается", () => {
  const s = answer(newSrs(T0), "no", { now: T0 });
  assert.equal(s.lv, 1);
  assert.equal(s.lapses, 0);
});

test("сроки в днях выставляются на 4:00 ближайших суток", () => {
  for (const lv of [4, 5, 6, 7, 8, 9, 10]) {
    const d = new Date(dueFor(lv, T0));
    assert.equal(d.getHours(), 4, `уровень ${lv}`);
    assert.equal(d.getMinutes(), 0);
  }
  assert.equal(dueFor(4, T0), new Date(2026, 9, 12, 4, 0).getTime(), "из дневных 15:00 «1 день» это завтра в 4:00 (13 часов, это не меньше 12)");
});

test("вечерний ответ: «через 1 день» это не следующее утро, а послезавтра в 4:00; утренний вернётся завтра в 4:00", () => {
  const evening = new Date(2026, 9, 11, 23, 40).getTime();
  assert.equal(dueFor(4, evening), new Date(2026, 9, 13, 4, 0).getTime());
  const morning = new Date(2026, 9, 11, 9, 0).getTime();
  assert.equal(dueFor(4, morning), new Date(2026, 9, 12, 4, 0).getTime());
});

test("срок в днях всегда в пределах n ± ½ суток, 4:00, и не убывает с ростом n (в том числе в ночь перевода часов)", () => {
  const ns = [1, 2, 3, 5, 7, 14, 28];
  // начало: за две недели до перевода часов в Европе и в США, чтобы захватить оба
  for (const start of [new Date(2026, 9, 9), new Date(2026, 2, 20), new Date(2026, 10, 1)]) {
    for (let step = 0; step < 24 * 12; step += 5) {
      const now = start.getTime() + step * HOUR + 17 * MIN;
      let prev = 0;
      for (const n of ns) {
        const due = dueInDays(now, n);
        const d = new Date(due);
        assert.equal(d.getHours(), 4);
        assert.equal(d.getMinutes(), 0);
        const gap = hours(now, due);
        assert.ok(gap >= (n - 0.5) * 24 - 1.01 && gap <= (n + 0.5) * 24 + 1.01, `n=${n}, ${new Date(now)}: ${gap} ч`);
        assert.ok(due >= prev, "следующий уровень не раньше предыдущего");
        prev = due;
      }
    }
  }
});

test("ступени первых суток не пересекаются: 10 минут < 1 час < 12 часов <= 1 день", () => {
  for (let h = 0; h < 24; h++) {
    const now = new Date(2026, 9, 11, h, 5).getTime();
    const d = [1, 2, 3, 4, 5].map((lv) => dueFor(lv, now));
    for (let i = 1; i < d.length; i++) assert.ok(d[i] >= d[i - 1], `${h}:05, уровень ${i + 1}`);
    assert.ok(d[3] - now >= 12 * HOUR);
  }
});

test("освоено и «Знаю»: пороги 10 и 6 уровней", () => {
  assert.equal(KNOWN, 6);
  assert.ok(!isMastered({ lv: 9 }));
  assert.ok(isMastered({ lv: 10 }));
  assert.ok(!isMastered(undefined));
});

test("трудное слово: после четырёх срывов, пока не дошло до последнего уровня", () => {
  assert.ok(isLeech({ lv: 3, lapses: 4 }));
  assert.ok(isLeech({ lv: 9, lapses: 5 }));
  assert.ok(!isLeech({ lv: 10, lapses: 5 }));
  assert.ok(!isLeech({ lv: 3, lapses: 3 }));
});

test("перенос карточек из старого формата (FSRS) сразу на нынешнюю лестницу", () => {
  assert.equal(fromLegacy({ state: 0, due: T0 }).lv, 0);
  assert.equal(fromLegacy({ state: 1, step: 0, due: T0, last: T0 }).lv, 1);
  assert.equal(fromLegacy({ state: 1, step: 1, due: T0, last: T0 }).lv, 1);
  assert.equal(fromLegacy({ state: 2, due: T0 + 3 * DAY, last: T0, reps: 4 }).lv, 5);
  assert.equal(fromLegacy({ state: 2, due: T0 + 16 * DAY, last: T0 }).lv, 9);
  assert.equal(fromLegacy({ state: 2, due: T0 + 90 * DAY, last: T0 }).lv, 10);
  assert.equal(fromLegacy({ state: 3, step: 0, due: T0, last: T0, lapses: 2 }).lapses, 2);
  assert.ok([{ state: 0 }, { state: 1, step: 0 }, { state: 2, due: T0 + DAY, last: T0 }].every((f) => fromLegacy(f, T0).v === LADDER), "переведённая карточка помечена версией лестницы");
});

test("метка версии: новая карточка и каждый ответ её ставят", () => {
  assert.equal(newSrs(T0).v, LADDER);
  assert.equal(answer(newSrs(T0), "ok", { now: T0 }).v, LADDER);
  assert.equal(answer({ lv: 3, due: T0, last: T0, reps: 1, lapses: 0 }, "no", { now: T0 }).v, LADDER, "и карточка без метки получает её с первым же ответом");
});

test("уровень по прежней лестнице → нынешний", () => {
  assert.deepEqual(OLD_TO_NEW, [0, 1, 1, 2, 5, 7, 9, 10, 10, 10, 10]);
  assert.deepEqual([0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map((lv) => levelInLadder(lv, undefined)), OLD_TO_NEW);
  assert.deepEqual([0, 3, 10].map((lv) => levelInLadder(lv, LADDER)), [0, 3, 10], "уровень нынешней лестницы не меняется");
  assert.equal(levelInLadder(99, undefined), 10);
  assert.equal(levelInLadder(undefined, undefined), 0);
});

test("слова с суточным интервалом (третий уровень прежней лестницы) переходят на второй, срок остаётся", () => {
  const old = { lv: 3, due: T0 + 13 * HOUR, last: T0, reps: 4, lapses: 1 };
  assert.ok(needsMigration(old));
  const s = migrateSrs(old, T0);
  assert.deepEqual(s, { lv: 2, due: T0 + 13 * HOUR, last: T0, reps: 4, lapses: 1, v: LADDER });
  assert.ok(!needsMigration(s));
  assert.equal(migrateSrs(s, T0), s, "повторный перенос ничего не меняет");
});

test("перенос: порядок слов по уровням сохраняется, далёкие сроки подтягиваются к 28 дням, новые слова остаются новыми", () => {
  const lvs = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map((lv) => migrateSrs({ lv, due: T0 + 100 * DAY, last: T0, reps: 3, lapses: 0 }, T0));
  for (let i = 1; i < lvs.length; i++) assert.ok(lvs[i].lv >= lvs[i - 1].lv, "уровни не меняются местами");
  assert.ok(lvs.every((x) => x.due <= T0 + 28 * DAY));
  assert.equal(lvs[9].lv, 10);
  const fresh = migrateSrs({ lv: 0, due: T0, last: null, reps: 0, lapses: 0 }, T0);
  assert.equal(fresh.lv, 0);
  assert.equal(fresh.v, LADDER);
  assert.equal(migrateSrs({ lv: 4, due: NaN, last: null, reps: 1, lapses: 0 }, T0).due, T0, "битый срок заменяется сейчас, слово просто пора повторить");
  assert.equal(migrateSrs(undefined), undefined);
});

test("потолок: верный ответ не поднимает слово выше потолка задания и не отнимает уже набранное", () => {
  let s = { lv: 3, due: T0, last: T0, reps: 2, lapses: 0 };
  s = answer(s, "ok", { now: T0, cap: 4 });
  assert.equal(s.lv, 4);
  s = answer(s, "ok", { now: T0, cap: 4 });
  assert.equal(s.lv, 4, "на потолке уровень не растёт");
  assert.equal(s.reps, 4, "но повторение засчитывается");
  const high = answer({ lv: 8, due: T0, last: T0, reps: 9, lapses: 0 }, "ok", { now: T0, cap: 4 });
  assert.equal(high.lv, 8, "слово выше потолка остаётся на своём уровне, а не падает");
  assert.equal(answer(newSrs(T0), "ok", { now: T0, cap: 4 }).lv, 1);
});

test("потолок не мешает ошибке: штраф работает как обычно", () => {
  const s = answer({ lv: 7, due: T0, last: T0, reps: 9, lapses: 0 }, "no", { now: T0, cap: 4 });
  assert.equal(s.lv, 5);
});
