import test from "node:test";
import assert from "node:assert/strict";
import { homeSummary, weekdayShort } from "../js/home.js";
import { studyDays, streakOf, bestStreak } from "../js/progress.js";

const at = (d, h = 12, m = 0) => new Date(2026, 9, d, h, m).getTime(); // октябрь 2026; 12 октября 2026 — понедельник
const NOW = at(12, 15);
const day = (d) => `2026-10-${String(d).padStart(2, "0")}`;
const card = (lv, extra = {}) => ({ srs: { lv }, ...extra });

test("дни недели по-русски", () => {
  assert.equal(weekdayShort("2026-10-12"), "Пн");
  assert.equal(weekdayShort("2026-10-18"), "Вс");
  assert.equal(weekdayShort("2026-10-17"), "Сб");
});

test("занятый день: повторение или минута чтения", () => {
  const days = studyDays([{ t: at(12) }, { t: at(10) }], { read: { [day(11)]: 90, [day(9)]: 30 } });
  assert.deepEqual([...days].sort(), [day(10), day(11), day(12)], "30 секунд чтения занятием не считаются");
  assert.equal(streakOf(days, NOW), 3, "чтение вчера склеивает серию");
});

test("серия: сегодня ещё не кончился; ночное повторение входит во вчерашний день", () => {
  const onlyYesterday = new Set([day(11), day(10)]);
  assert.equal(streakOf(onlyYesterday, NOW), 2, "сегодня занятий нет, но серия не обнуляется");
  assert.equal(streakOf(new Set([day(10)]), NOW), 0, "вчера тоже пропущено");
  const night = studyDays([{ t: at(13, 2, 30) }], null);
  assert.deepEqual([...night], [day(12)], "в 2:30 ещё вчерашний учебный день");
});

test("лучшая серия за всё время", () => {
  const days = new Set([day(1), day(2), day(3), day(4), day(7), day(8), day(12)]);
  assert.equal(bestStreak(days), 4);
  assert.equal(bestStreak(new Set()), 0);
  assert.equal(bestStreak(new Set([day(5)])), 1);
  assert.equal(bestStreak(new Set(["2026-02-28", "2026-03-01"])), 2, "2026 год не високосный: за 28 февраля идёт 1 марта");
  assert.equal(bestStreak(new Set(["2028-02-28", "2028-03-01"])), 1, "2028 год високосный: между ними был 29 февраля");
  assert.equal(bestStreak(new Set(["2028-02-28", "2028-02-29", "2028-03-01"])), 3);
  assert.equal(bestStreak(new Set(["2025-12-31", "2026-01-01"])), 2, "через границу года");
});

test("сводка для главной", () => {
  const cards = [card(0), card(0), card(2), card(4), card(6), card(7), card(10), card(9, { skip: true })];
  const books = [
    { chapters: [{ chars: 1000 }], progress: { ch: 0, p: 0, f: 1, done: 5 }, stats: { tokens: 200 }, opened: 1 },
    { chapters: [{ chars: 1000 }, { chars: 1000 }], progress: { ch: 1, p: 1, f: 0.5 }, stats: { tokens: 400 }, opened: 2 },
  ];
  const log = [{ t: at(12), result: "ok" }, { t: at(12, 16), result: "no" }, { t: at(11), result: "ok" }, { t: at(6), result: "ok" }];
  const activity = { read: { [day(12)]: 600, [day(10)]: 1800, [day(5)]: 3600 } };
  const s = homeSummary({ cards, books, log, activity, now: NOW });
  assert.deepEqual(s.words, { total: 7, learned: 4, learning: 1, fresh: 2, mastered: 2 }, "уровни 4–10 выучены, скрытое слово не считается");
  assert.deepEqual(s.books, { total: 2, finished: 1, reading: 1 });
  assert.equal(s.wordsRead, 200 + 300);
  assert.equal(s.streak, 3, "12, 11 (повторение), 10 (чтение)");
  assert.equal(s.best, 3);
  assert.equal(s.activeToday, true);
  assert.equal(s.week.length, 7);
  assert.deepEqual(s.week.map((d) => d.day), [day(6), day(7), day(8), day(9), day(10), day(11), day(12)]);
  assert.deepEqual(s.week.map((d) => d.active), [true, false, false, false, true, true, true]);
  assert.deepEqual(s.week.map((d) => d.label), ["Вс", "Пн", "Вт", "Ср", "Чт", "Пт", "Сб"].map((_, i) => ["Вт", "Ср", "Чт", "Пт", "Сб", "Вс", "Пн"][i]));
  assert.equal(s.week[6].today, true);
  assert.equal(s.todayReviews, 2);
  assert.equal(s.weekReviews, 4);
  assert.equal(s.todayReadSec, 600);
  assert.equal(s.weekReadSec, 600 + 1800, "чтение пятого числа в неделю не входит");
  // кривая для главной: у карточек без номера и без журнала день — по последнему ответу, а то и по сегодняшнему
  assert.equal(s.learnedTrend.length, 30);
  assert.equal(s.learnedTrend.at(-1), s.words.learned, "последняя точка равна числу выученных слов");
});

test("кривая для главной появляется вместе с первым выученным словом; Map.values() можно передавать", () => {
  assert.equal(homeSummary({ cards: [card(2), card(3)], now: NOW }).learnedTrend, null);
  const cards = new Map([["w:a", { id: "w:a", ...card(5) }], ["w:b", { id: "w:b", ...card(1) }]]);
  const s = homeSummary({ cards: cards.values(), log: [{ id: "w:a", t: at(8), lv: 4, result: "ok" }], now: NOW });
  assert.equal(s.words.total, 2);
  assert.equal(s.words.learned, 1);
  assert.deepEqual(s.learnedTrend.slice(-7), [0, 0, 1, 1, 1, 1, 1], "выучено 8 октября");
});

test("пустая сводка не падает и ничего не придумывает", () => {
  const s = homeSummary({ now: NOW });
  assert.deepEqual(s.words, { total: 0, learned: 0, learning: 0, fresh: 0, mastered: 0 });
  assert.equal(s.streak, 0);
  assert.equal(s.best, 0);
  assert.equal(s.activeToday, false);
  assert.equal(s.wordsRead, 0);
  assert.equal(s.week.length, 7);
});
