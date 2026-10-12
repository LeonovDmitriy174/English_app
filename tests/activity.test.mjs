import test from "node:test";
import assert from "node:assert/strict";
import { normalizeActivity, addRead, addWords, wordsOn, mergeActivity, readOn, readDays, readTotal, fmtDuration, createClock, TICK_SEC, IDLE_SEC, MIN_ACTIVE_SEC } from "../js/activity.js";

test("нормализация: только настоящие дни и конечные положительные числа", () => {
  assert.deepEqual(normalizeActivity(undefined), { read: {} });
  assert.deepEqual(normalizeActivity(null), { read: {} });
  assert.deepEqual(normalizeActivity("мусор"), { read: {} });
  const a = normalizeActivity({ read: { "2026-10-12": 120.4, "вчера": 50, "2026-10-11": -5, "2026-10-10": NaN, "2026-10-09": 999999, "2026-10-08": "7" } });
  assert.deepEqual(a, { read: { "2026-10-12": 120, "2026-10-09": 86400 } }, "сутки не длиннее 24 часов, строки и отрицательные отбрасываются");
});

test("addRead копит секунды по дням и игнорирует мусор", () => {
  const a = { read: {} };
  addRead(a, "2026-10-12", 5);
  addRead(a, "2026-10-12", 5);
  addRead(a, "2026-10-13", 1);
  addRead(a, "не день", 5);
  addRead(a, "2026-10-14", 0);
  addRead(a, "2026-10-14", NaN);
  assert.deepEqual(a, { read: { "2026-10-12": 10, "2026-10-13": 1 } });
  addRead(a, "2026-10-12", 90000);
  assert.equal(a.read["2026-10-12"], 86400, "день не длиннее суток");
});

test("слияние берёт большее время за день, а не сумму: повторная загрузка копии ничего не удваивает", () => {
  const mine = { read: { "2026-10-12": 100, "2026-10-11": 300 } };
  const theirs = { read: { "2026-10-12": 250, "2026-10-11": 300, "2026-10-10": 60 } };
  const once = mergeActivity(mine, theirs);
  assert.deepEqual(once.activity.read, { "2026-10-12": 250, "2026-10-11": 300, "2026-10-10": 60 });
  assert.equal(once.changed, 2);
  const twice = mergeActivity(once.activity, theirs);
  assert.deepEqual(twice.activity, once.activity);
  assert.equal(twice.changed, 0);
  assert.deepEqual(mergeActivity(mine, undefined).activity, mine, "копия без данных о чтении ничего не стирает");
  assert.deepEqual(mine.read, { "2026-10-12": 100, "2026-10-11": 300 }, "исходные данные не меняются");
});

test("дни чтения: от минуты; сумма за дни", () => {
  const a = { read: { "2026-10-12": MIN_ACTIVE_SEC, "2026-10-11": MIN_ACTIVE_SEC - 1, "2026-10-10": 600 } };
  assert.deepEqual([...readDays(a)].sort(), ["2026-10-10", "2026-10-12"]);
  assert.equal(readOn(a, "2026-10-10"), 600);
  assert.equal(readOn(a, "2026-01-01"), 0);
  assert.equal(readOn(undefined, "2026-01-01"), 0);
  assert.equal(readTotal(a, ["2026-10-12", "2026-10-11", "2026-10-09"]), 119);
  assert.equal(readDays(undefined).size, 0);
});

test("длительность по-русски", () => {
  assert.equal(fmtDuration(0), "0 мин");
  assert.equal(fmtDuration(20), "меньше минуты");
  assert.equal(fmtDuration(90), "2 мин");
  assert.equal(fmtDuration(18 * 60), "18 мин");
  assert.equal(fmtDuration(60 * 60), "1 ч");
  assert.equal(fmtDuration(130 * 60), "2 ч 10 мин");
});

test("часы чтения: время идёт, пока вы что-то делаете, и не идёт, когда отошли или окно скрыто", () => {
  const c = createClock();
  assert.equal(c.tick(1000, true), 0, "пока касаний не было, время не идёт");
  c.touch(1000);
  assert.equal(c.tick(1000 + TICK_SEC * 1000, true), TICK_SEC);
  assert.equal(c.tick(1000 + IDLE_SEC * 1000, true), TICK_SEC, "ровно через минуту ещё идёт");
  assert.equal(c.tick(1000 + IDLE_SEC * 1000 + 1, true), 0, "после минуты без касаний не идёт");
  assert.equal(c.tick(1000 + 5000, false), 0, "окно скрыто");
  c.touch(200000);
  assert.equal(c.tick(203000, true), TICK_SEC, "новое касание снова запускает время");
});

test("слова по дням: ключа нет, пока слов не набралось; мусор отбрасывается", () => {
  assert.deepEqual(normalizeActivity({ read: { "2026-10-12": 60 } }), { read: { "2026-10-12": 60 } }, "старые данные остаются такими же");
  assert.deepEqual(normalizeActivity({ read: {}, words: {} }), { read: {} });
  const a = normalizeActivity({ read: {}, words: { "2026-10-12": 840.6, "2026-10-11": -3, "вчера": 5, "2026-10-10": "9", "2026-10-09": 9999999 } });
  assert.deepEqual(a.words, { "2026-10-12": 841, "2026-10-09": 200000 });
  const act = { read: {} };
  addWords(act, "2026-10-12", 120.5);
  addWords(act, "2026-10-12", 30);
  addWords(act, "2026-10-12", 0);
  addWords(act, "2026-10-12", NaN);
  addWords(act, "не день", 50);
  assert.deepEqual(act, { read: {}, words: { "2026-10-12": 150.5 } });
  assert.equal(wordsOn(act, "2026-10-12"), 150.5);
  assert.equal(wordsOn(act, "2026-10-11"), 0);
  assert.equal(wordsOn(undefined, "2026-10-11"), 0);
  assert.deepEqual(addWords({ read: {} }, "2026-10-12", -5), { read: {} }, "пустой ключ words не появляется");
});

test("слияние слов по дням: большее значение, повторная загрузка ничего не удваивает", () => {
  const mine = { read: { "2026-10-12": 100 }, words: { "2026-10-12": 300, "2026-10-11": 500 } };
  const theirs = { read: {}, words: { "2026-10-12": 900, "2026-10-11": 500, "2026-10-10": 40 } };
  const once = mergeActivity(mine, theirs);
  assert.deepEqual(once.activity.words, { "2026-10-12": 900, "2026-10-11": 500, "2026-10-10": 40 });
  assert.equal(once.changed, 2);
  const twice = mergeActivity(once.activity, theirs);
  assert.deepEqual(twice.activity, once.activity);
  assert.equal(twice.changed, 0);
  assert.deepEqual(mergeActivity({ read: { "2026-10-12": 5 } }, theirs).activity.words, theirs.words, "в старых данных слов не было — берутся из копии");
  assert.deepEqual(mergeActivity(mine, { read: {} }).activity, mine, "копия без слов ничего не стирает");
  assert.deepEqual(mine.words, { "2026-10-12": 300, "2026-10-11": 500 }, "исходные данные не меняются");
});
