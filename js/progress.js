// progress.js — «Прогресс»: сколько слов на каком уровне, сколько повторений за последние дни, серия дней подряд.
// Время следующего повторения здесь не считается и не показывается. Чистые функции без DOM: проверяются в Node (tests/progress.test.mjs).
import { studyDay, KNOWN, MAX_LEVEL } from "./levels.js";
import { readDays } from "./activity.js";
import { FREQ_TASK } from "./freqdeck.js";

/** Группы уровней: новое слово; слово, которое учится (1–5); знакомое (6–9, от трёх дней между повторами); освоенное (последний уровень, 28 дней). */
export const GROUPS = [
  { key: "new", label: "Новые" },
  { key: "learning", label: "Учу" },
  { key: "known", label: "Знаю" },
  { key: "mastered", label: "Освоено" },
];

export function groupOf(lv) {
  if (!lv) return "new";
  if (lv < KNOWN) return "learning";
  return lv < MAX_LEVEL ? "known" : "mastered";
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
    if (e.task === FREQ_TASK) continue; // проверка в «Пополнить словарь» не повторение: серию дней она продлевает, а в счёт повторений и точности не идёт
    const r = at.get(studyDay(e.t));
    if (!r) continue;
    r.n += 1;
    if (e.result === "ok") r.ok += 1;
  }
  return rows;
}

const dayBefore = (d) => new Date(d.getFullYear(), d.getMonth(), d.getDate() - 1, d.getHours(), d.getMinutes());

/** Учебные дни, в которые было хоть одно повторение (log) или достаточно чтения (activity, js/activity.js). */
export function studyDays(log, activity) {
  const days = new Set((log || []).map((e) => studyDay(e.t)));
  for (const d of readDays(activity)) days.add(d);
  return days;
}

/**
 * Сколько учебных дней подряд были занятия (days — множество дней «ГГГГ-ММ-ДД»). Сегодняшний день ещё не кончился, поэтому, если сегодня
 * занятий пока нет, серия считается до вчера и не обнуляется.
 */
export function streakOf(days, now = Date.now()) {
  let n = 0;
  let d = new Date(now);
  if (!days.has(studyDay(d.getTime()))) d = dayBefore(d);
  while (days.has(studyDay(d.getTime()))) {
    n += 1;
    d = dayBefore(d);
  }
  return n;
}

/** Самая длинная серия за всё время. */
export function bestStreak(days) {
  const t = [...days].map((s) => Date.UTC(+s.slice(0, 4), +s.slice(5, 7) - 1, +s.slice(8, 10))).sort((a, b) => a - b);
  let best = 0;
  let run = 0;
  t.forEach((x, i) => {
    run = i && x - t[i - 1] === 86400000 ? run + 1 : 1;
    best = Math.max(best, run);
  });
  return best;
}

/** Серия по одним повторениям (журнал ответов). */
export const streak = (log, now = Date.now()) => streakOf(studyDays(log, null), now);

/** Доля верных ответов из rows (результат reviewsByDay) или null, если ответов не было. */
export function accuracy(rows) {
  const n = rows.reduce((a, r) => a + r.n, 0);
  return n ? rows.reduce((a, r) => a + r.ok, 0) / n : null;
}

/** «12.10» из «2026-10-12». */
export const shortDate = (day) => `${day.slice(8, 10)}.${day.slice(5, 7)}`;
