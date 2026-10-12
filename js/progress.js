// progress.js — «Прогресс»: сколько слов на каком уровне, сколько повторений за последние дни, серия дней подряд.
// Время следующего повторения здесь не считается и не показывается. Чистые функции без DOM: проверяются в Node (tests/progress.test.mjs).
import { studyDay, PIPS } from "./levels.js";


/** Группы уровней: новое слово; слово, которое учится; знакомое; освоенное (выше последней точки индикатора). */
export const GROUPS = [
  { key: "new", label: "Новые" },
  { key: "learning", label: "Учу" },
  { key: "known", label: "Знаю" },
  { key: "mastered", label: "Освоено" },
];

export function groupOf(lv) {
  if (!lv) return "new";
  if (lv <= 3) return "learning";
  return lv <= PIPS ? "known" : "mastered";
}

/** Сколько карточек в каждой группе. Слова, помеченные «Это имя, не повторять», в учёбе не участвуют и не считаются. */
export function levelSpread(cards) {
  const out = { total: 0, new: 0, learning: 0, known: 0, mastered: 0 };
  for (const c of cards) {
    if (c.skip) continue;
    out.total += 1;
    out[groupOf(c.srs?.lv)] += 1;
  }
  return out;
}

/** Учебные дни от самого раннего до сегодняшнего: последние n штук. */
export function lastDays(now, n) {
  const days = [];
  const base = new Date(now);
  for (let i = n - 1; i >= 0; i--) {
    // шаг в сутки делаем по календарю (а не по 86 400 000 мс): так не ошибиться в дни перевода часов
    const d = new Date(base.getFullYear(), base.getMonth(), base.getDate() - i, base.getHours(), base.getMinutes());
    days.push(studyDay(d.getTime()));
  }
  return days;
}

/**
 * Ответы по учебным дням за последние n дней: [{ day, n, ok }] от старого к новому, дни без ответов тоже есть.
 * log — записи журнала { t, result }; ok — число полностью верных ответов.
 */
export function reviewsByDay(log, now = Date.now(), n = 14) {
  const rows = lastDays(now, n).map((day) => ({ day, n: 0, ok: 0 }));
  const at = new Map(rows.map((r) => [r.day, r]));
  for (const e of log || []) {
    const r = at.get(studyDay(e.t));
    if (!r) continue;
    r.n += 1;
    if (e.result === "ok") r.ok += 1;
  }
  return rows;
}

/**
 * Сколько учебных дней подряд были повторения. Сегодняшний день ещё не кончился, поэтому, если сегодня повторений пока нет,
 * серия считается до вчера и не обнуляется.
 */
export function streak(log, now = Date.now()) {
  const days = new Set((log || []).map((e) => studyDay(e.t)));
  let n = 0;
  let d = new Date(now);
  if (!days.has(studyDay(d.getTime()))) d = new Date(d.getFullYear(), d.getMonth(), d.getDate() - 1, d.getHours(), d.getMinutes());
  while (days.has(studyDay(d.getTime()))) {
    n += 1;
    d = new Date(d.getFullYear(), d.getMonth(), d.getDate() - 1, d.getHours(), d.getMinutes());
  }
  return n;
}

/** Доля верных ответов из rows (результат reviewsByDay) или null, если ответов не было. */
export function accuracy(rows) {
  const n = rows.reduce((a, r) => a + r.n, 0);
  return n ? rows.reduce((a, r) => a + r.ok, 0) / n : null;
}

/** «12.10» из «2026-10-12». */
export const shortDate = (day) => `${day.slice(8, 10)}.${day.slice(5, 7)}`;
