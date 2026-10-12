// home.js — сводка для главной страницы: серия дней, слова по уровням, прочитанные книги, чтение за неделю.
// Чистая функция без DOM (tests/home.test.mjs). Время следующих повторений здесь не считается и не показывается.
import { studyDay } from "./levels.js";
import { levelSpread, lastDays, reviewsByDay, studyDays, streakOf, bestStreak } from "./progress.js";
import { readOn, readTotal } from "./activity.js";
import { shelfStats } from "./reading.js";

const WEEKDAYS = ["Вс", "Пн", "Вт", "Ср", "Чт", "Пт", "Сб"];

/** Короткое название дня недели для учебного дня «ГГГГ-ММ-ДД». */
export const weekdayShort = (day) => WEEKDAYS[new Date(+day.slice(0, 4), +day.slice(5, 7) - 1, +day.slice(8, 10)).getDay()];

/**
 * cards — карточки словаря, books — книги, log — журнал ответов, activity — чтение по дням (js/activity.js).
 * Возвращает всё, что показывает главная.
 */
export function homeSummary({ cards = [], books = [], log = [], activity = { read: {} }, now = Date.now() } = {}) {
  const spread = levelSpread(cards);
  const days = studyDays(log, activity);
  const week = lastDays(now, 7);
  const reviews = reviewsByDay(log, now, 7);
  const today = studyDay(now);
  const shelf = shelfStats(books);
  return {
    words: { total: spread.total, learned: spread.known + spread.mastered, learning: spread.learning, fresh: spread.new, mastered: spread.mastered },
    books: { total: shelf.total, finished: shelf.finished, reading: shelf.reading },
    wordsRead: shelf.words,
    streak: streakOf(days, now),
    best: bestStreak(days),
    activeToday: days.has(today),
    week: week.map((day, i) => ({ day, label: weekdayShort(day), active: days.has(day), today: day === today, reviews: reviews[i].n, readSec: readOn(activity, day) })),
    weekReviews: reviews.reduce((a, r) => a + r.n, 0),
    weekReadSec: readTotal(activity, week),
    todayReviews: reviews[reviews.length - 1].n,
    todayReadSec: readOn(activity, today),
  };
}
