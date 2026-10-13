import test from "node:test";
import assert from "node:assert/strict";
import { groupOf, levelSpread, lastDays, reviewsByDay, streak, accuracy, shortDate } from "../js/progress.js";
import { studyDay, KNOWN, MAX_LEVEL } from "../js/levels.js";

const at = (d, h = 12, m = 0) => new Date(2026, 9, d, h, m).getTime(); // октябрь 2026
const NOW = at(12, 15, 0);
const log = (...entries) => entries.map(([t, result = "ok"]) => ({ t, result }));

test("учебный день начинается в 4:00", () => {
  assert.equal(studyDay(at(12, 12)), "2026-10-12");
  assert.equal(studyDay(at(12, 4, 0)), "2026-10-12");
  assert.equal(studyDay(at(12, 3, 59)), "2026-10-11", "ночное повторение входит в предыдущий день");
  assert.equal(studyDay(at(12, 0, 5)), "2026-10-11");
  assert.equal(studyDay(new Date(2026, 0, 1, 2, 0).getTime()), "2025-12-31", "и на границе года");
});

test("группы уровней", () => {
  assert.equal(groupOf(0), "new");
  assert.equal(groupOf(undefined), "new");
  assert.equal(groupOf(1), "learning");
  assert.equal(groupOf(KNOWN - 1), "learning", "до пятого уровня включительно слово учится");
  assert.equal(groupOf(5), "learning");
  assert.equal(groupOf(KNOWN), "known", "с шестого уровня (три дня между повторами) слово знакомо");
  assert.equal(groupOf(9), "known");
  assert.equal(groupOf(MAX_LEVEL), "mastered", "последний уровень (28 дней) это «Освоено»");
  assert.equal(KNOWN, 6);
  assert.equal(MAX_LEVEL, 10);
});

test("распределение по уровням не считает слова «не повторять»", () => {
  const cards = [{ srs: { lv: 0 } }, { srs: { lv: 2 } }, { srs: { lv: 2 } }, { srs: { lv: 7 } }, { srs: { lv: 10 } }, { srs: { lv: 10 }, skip: true }, {}];
  assert.deepEqual(levelSpread(cards), { total: 6, new: 2, learning: 2, known: 1, mastered: 1 });
  assert.deepEqual(levelSpread([]), { total: 0, new: 0, learning: 0, known: 0, mastered: 0 });
});

test("последние дни: от старого к новому, сегодняшний последний", () => {
  assert.deepEqual(lastDays(NOW, 3), ["2026-10-10", "2026-10-11", "2026-10-12"]);
  assert.equal(lastDays(NOW, 14).length, 14);
  assert.deepEqual(lastDays(at(2, 12), 3), ["2026-09-30", "2026-10-01", "2026-10-02"], "через границу месяца");
  // ночью (до 4:00) «сегодня» это ещё вчерашний учебный день
  assert.equal(lastDays(at(12, 2, 0), 1)[0], "2026-10-11");
});

test("повторения по дням: дни без ответов тоже есть, ответы вне окна не считаются", () => {
  const rows = reviewsByDay(log([at(12, 9)], [at(12, 10), "no"], [at(12, 3, 0), "near"], [at(10, 20)], [at(1, 10)]), NOW, 3);
  assert.deepEqual(rows, [
    { day: "2026-10-10", n: 1, ok: 1 },
    { day: "2026-10-11", n: 1, ok: 0 }, // 3:00 утра 12-го — вчерашний день
    { day: "2026-10-12", n: 2, ok: 1 },
  ]);
  assert.deepEqual(reviewsByDay([], NOW, 2), [{ day: "2026-10-11", n: 0, ok: 0 }, { day: "2026-10-12", n: 0, ok: 0 }]);
  assert.equal(reviewsByDay(undefined, NOW, 14).length, 14);
});

test("серия: дни подряд, пропуск обрывает её", () => {
  assert.equal(streak(log([at(12)], [at(11)], [at(10)]), NOW), 3);
  assert.equal(streak(log([at(12)], [at(11)], [at(9)]), NOW), 2, "9 октября отдельно: 10-го был пропуск");
  assert.equal(streak(log([at(12)]), NOW), 1);
  assert.equal(streak([], NOW), 0);
  assert.equal(streak(undefined, NOW), 0);
});

test("серия: если сегодня повторений ещё нет, считается до вчера", () => {
  assert.equal(streak(log([at(11)], [at(10)]), NOW), 2);
  assert.equal(streak(log([at(10)], [at(9)]), NOW), 0, "вчера тоже пропущено: серия кончилась");
});

test("серия не ломается на переводе часов и нескольких ответах за день", () => {
  const many = log(...Array.from({ length: 40 }, (_, i) => [at(12, 8, i)]), [at(11, 22)], [at(10, 5)]);
  assert.equal(streak(many, NOW), 3);
  // конец октября: перевод часов в ночь на 25 октября 2026
  const late = new Date(2026, 9, 28, 12).getTime();
  const days = [28, 27, 26, 25, 24, 23].map((d) => [new Date(2026, 9, d, 12).getTime()]);
  assert.equal(streak(log(...days), late), 6);
  assert.equal(lastDays(late, 6).join(), "2026-10-23,2026-10-24,2026-10-25,2026-10-26,2026-10-27,2026-10-28");
});

test("доля верных ответов", () => {
  assert.equal(accuracy([{ n: 4, ok: 3 }, { n: 6, ok: 3 }]), 0.6);
  assert.equal(accuracy([{ n: 0, ok: 0 }]), null);
  assert.equal(accuracy([]), null);
});

test("короткая дата", () => {
  assert.equal(shortDate("2026-10-02"), "02.10");
  assert.equal(shortDate("2026-12-31"), "31.12");
});
