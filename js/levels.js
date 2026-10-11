// levels.js — уровни освоения слова и расписание повторений. Всё считается само.
//
// У каждой карточки есть уровень. Чем выше уровень, тем реже слово возвращается:
//
//   уровень   1       2        3      4      5      6      7       8       9       10
//   через     1 мин   10 мин   1 дн.  3 дн.  7 дн.  14 дн. 30 дн.  60 дн.  120 дн. 240 дн.
//
// Правила (управлять уровнями вручную нельзя, это сделано намеренно):
//  - верный ответ: уровень растёт на единицу;
//  - ошибка: уровень сбрасывается на первый (не на ступень назад);
//    в письменных режимах (написание, слово в предложении) сброс мягче: на второй,
//    потому что писать сложнее, чем узнавать;
//  - почти верный ответ (опечатка, другая форма слова) и верный ответ с подсказкой:
//    уровень не меняется, слово вернётся через тот же срок.
//
// Сроки в днях выставляются на 4:00 утра нужного дня: карточка «через 1 день» готова
// с самого утра, а не «через ровно 24 часа». Так вечерние повторения не уезжают вперёд.
//
// Время пользователю не показывается: в интерфейсе есть только индикатор уровня.

const MIN = 60000;
const HOUR = 3600000;

export const WAITS = [
  { min: 1 },
  { min: 10 },
  { days: 1 },
  { days: 3 },
  { days: 7 },
  { days: 14 },
  { days: 30 },
  { days: 60 },
  { days: 120 },
  { days: 240 },
];
export const MAX_LEVEL = WAITS.length;
/** Сколько точек показывает индикатор; всё, что выше, считается «освоено». */
export const PIPS = 6;
/** Куда падает карточка при ошибке: после неё остаётся не выше этого уровня. */
export const RESET = { read: 1, written: 2 };
export const ROLLOVER = 4; // сутки начинаются в 4:00 по местному времени

export const newSrs = (now = Date.now()) => ({ lv: 0, due: now, last: null, reps: 0, lapses: 0 });
export const isNew = (srs) => !srs || srs.lv === 0;
export const isMastered = (srs) => !!srs && srs.lv > PIPS;

/** Срок через n суток: 4:00 нужного дня по местному времени. */
function dueInDays(now, n, rollover = ROLLOVER) {
  const d = new Date(now - rollover * HOUR);
  d.setHours(0, 0, 0, 0);
  d.setDate(d.getDate() + n);
  return d.getTime() + rollover * HOUR;
}

/** Когда повторить карточку, достигшую уровня lv. */
export function dueFor(lv, now = Date.now()) {
  const w = WAITS[Math.min(Math.max(lv, 1), MAX_LEVEL) - 1];
  return w.min ? now + w.min * MIN : dueInDays(now, w.days);
}

/**
 * Применить ответ. result: 'ok' (верно) | 'near' (почти, или верно с подсказкой) | 'no' (ошибка).
 * written: true для режимов, где слово нужно писать.
 */
export function answer(srs, result, { written = false, now = Date.now() } = {}) {
  const prev = srs?.lv || 0;
  let lv;
  if (result === "ok") lv = Math.min(prev + 1, MAX_LEVEL);
  else if (result === "near") lv = Math.max(prev, 1);
  else lv = Math.max(1, Math.min(prev || 1, written ? RESET.written : RESET.read));
  return {
    lv,
    due: dueFor(lv, now),
    last: now,
    reps: (srs?.reps || 0) + 1,
    lapses: (srs?.lapses || 0) + (result === "no" && prev > 0 ? 1 : 0),
  };
}

/** Перевод карточек старого формата (FSRS, версии 1–2) в уровни. */
export function fromLegacy(f, now = Date.now()) {
  if (!f || f.state === 0) return { ...newSrs(f?.due ?? now), lapses: f?.lapses || 0 };
  let lv;
  if (f.state === 1 || f.state === 3) lv = f.step >= 1 ? 2 : 1;
  else {
    const days = Math.max(1, Math.round(((f.due || now) - (f.last || now)) / 86400000));
    lv = 3;
    WAITS.forEach((w, i) => w.days && w.days <= days && (lv = i + 1));
  }
  return { lv, due: f.due ?? now, last: f.last ?? null, reps: f.reps || 0, lapses: f.lapses || 0 };
}
