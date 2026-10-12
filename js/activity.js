// activity.js — чтение по дням: сколько секунд книга была открыта и вы с ней что-то делали (листали, нажимали на слова).
// Это нужно главной странице: серия дней и время чтения за неделю. Чистые функции без DOM (tests/activity.test.mjs).
//
// Данные лежат в kv «activity» как { read: { "2026-10-12": 1260, … }, words?: { "2026-10-12": 840, … } }: секунды чтения и прочитанные слова
// по учебным дням (сутки с 4:00, как в levels.js). Слова нужны для темпа чтения («в таком темпе дочитаете…»); ключа words нет, пока слов не набралось.
// Время идёт, пока окно видно и последнее касание или прокрутка были не раньше минуты назад: открытая и забытая книга не считается.

export const TICK_SEC = 5; // как часто читалка добавляет время
export const IDLE_SEC = 60; // после стольких секунд без касаний время не идёт
export const MIN_ACTIVE_SEC = 60; // с какого времени чтения день считается занятым (для серии)
const MAX_DAY_SEC = 86400;
const MAX_DAY_WORDS = 200000; // выше за день не прочитать: защита от мусора в данных
const DAY = /^\d{4}-\d{2}-\d{2}$/;

/** Приводит прочитанное из хранилища или из копии к нормальному виду: только настоящие дни и конечные числа. */
export function normalizeActivity(raw) {
  const clean = (src, max) => {
    const out = {};
    if (!src || typeof src !== "object") return out;
    for (const [day, v] of Object.entries(src)) {
      if (!DAY.test(day) || !Number.isFinite(v) || v <= 0) continue;
      const n = Math.min(Math.round(v), max);
      if (n > 0) out[day] = n;
    }
    return out;
  };
  const read = clean(raw && typeof raw === "object" ? raw.read : null, MAX_DAY_SEC);
  const words = clean(raw && typeof raw === "object" ? raw.words : null, MAX_DAY_WORDS);
  return Object.keys(words).length ? { read, words } : { read };
}

/** Прибавляет секунды чтения к дню. Меняет и возвращает act. */
export function addRead(act, day, sec) {
  if (!DAY.test(day) || !Number.isFinite(sec) || sec <= 0) return act;
  act.read[day] = Math.min((act.read[day] || 0) + Math.round(sec), MAX_DAY_SEC);
  return act;
}

/** Прибавляет прочитанные слова к дню (дробные части копятся, округляются при загрузке). Меняет и возвращает act. */
export function addWords(act, day, n) {
  if (!DAY.test(day) || !Number.isFinite(n) || n <= 0) return act;
  act.words ||= {};
  act.words[day] = Math.min((act.words[day] || 0) + n, MAX_DAY_WORDS);
  return act;
}

/** Слияние двух записей (например, из копии данных): по каждому дню берётся большее время, а не сумма, чтобы повторная загрузка копии ничего не удваивала. */
export function mergeActivity(a, b) {
  const out = normalizeActivity(a);
  const other = normalizeActivity(b);
  let changed = 0;
  for (const key of ["read", "words"]) {
    for (const [day, v] of Object.entries(other[key] || {})) {
      if ((out[key]?.[day] || 0) < v) {
        (out[key] ||= {})[day] = v;
        changed += 1;
      }
    }
  }
  return { activity: out, changed };
}

export const readOn = (act, day) => act?.read?.[day] || 0;
export const wordsOn = (act, day) => act?.words?.[day] || 0;

/** Дни, в которые читали не меньше minSec секунд. */
export function readDays(act, minSec = MIN_ACTIVE_SEC) {
  return new Set(Object.entries(act?.read || {}).filter(([, s]) => s >= minSec).map(([d]) => d));
}

/** Сколько секунд читали за перечисленные дни. */
export const readTotal = (act, days) => days.reduce((sum, d) => sum + readOn(act, d), 0);

/** «18 мин», «2 ч 10 мин», «2 ч»; меньше минуты — «меньше минуты», ноль — «0 мин». */
export function fmtDuration(sec) {
  if (!sec) return "0 мин";
  const min = Math.round(sec / 60);
  if (min < 1) return "меньше минуты";
  if (min < 60) return `${min} мин`;
  const h = Math.floor(min / 60);
  const m = min % 60;
  return m ? `${h} ч ${m} мин` : `${h} ч`;
}

/**
 * Копилка секунд для читалки: считает время только пока человек активен. tick(now) вызывается каждые TICK_SEC секунд и возвращает
 * число секунд, которое нужно записать (0, если человек отошёл или окно скрыто); touch(now) вызывается на касание и прокрутку.
 */
export function createClock({ idle = IDLE_SEC, step = TICK_SEC } = {}) {
  let last = -Infinity;
  return {
    touch(now = Date.now()) {
      last = now;
    },
    tick(now = Date.now(), visible = true) {
      if (!visible) return 0;
      return now - last <= idle * 1000 ? step : 0;
    },
  };
}
