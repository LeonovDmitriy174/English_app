// levels.js — уровни освоения слова и расписание повторений. Всё считается само.
//
// У каждой карточки есть уровень. Чем выше уровень, тем реже слово возвращается:
//
//   уровень   1       2        3      4      5      6      7       8       9       10
//   через     1 мин   10 мин   1 дн.  3 дн.  7 дн.  14 дн. 30 дн.  60 дн.  120 дн. 240 дн.
//
// Правила (управлять уровнями вручную нельзя, это сделано намеренно):
//  - верный ответ: уровень растёт на единицу;
//  - ошибка: уровень падает на два (PENALTY), но не ниже первого; слово, которое вы знали хорошо,
//    не теряет всё из-за одной ошибки, а слово на низких уровнях возвращается к первому;
//    в письменных режимах (написание, слово в предложении) ниже второго уровня не падает,
//    потому что писать сложнее, чем узнавать;
//  - повторная ошибка по тому же слову в том же заходе уровень не снижает: штраф уже получен (repeat);
//  - почти верный ответ (опечатка, другая форма слова) и верный ответ с подсказкой:
//    уровень не меняется, слово вернётся через тот же срок;
//  - у заданий с выбором из вариантов есть потолок (modes.js): верный ответ поднимает слово
//    не выше него, а выше слово растёт только от заданий, где его нужно вспомнить самому.
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
/** На сколько уровней падает карточка при ошибке. */
export const PENALTY = 2;
/** Ниже какого уровня ошибка карточку не опускает (в письменных режимах мягче: писать труднее, чем узнавать). */
export const FLOOR = { read: 1, written: 2 };
export const ROLLOVER = 4; // сутки начинаются в 4:00 по местному времени

/** Сколько ошибок после того, как слово уже было выучено, делает слово «трудным». */
export const LEECH_LAPSES = 4;

export const newSrs = (now = Date.now()) => ({ lv: 0, due: now, last: null, reps: 0, lapses: 0 });
export const isNew = (srs) => !srs || srs.lv === 0;
export const isMastered = (srs) => !!srs && srs.lv > PIPS;
/**
 * Трудное слово: ошибок накопилось много, а освоено оно пока не до конца. Слово, которое наконец усвоилось
 * (дошло до уровня выше последней точки индикатора), из трудных уходит само.
 */
export const isLeech = (srs) => !!srs && srs.lapses >= LEECH_LAPSES && !isMastered(srs);

/** Учебный день по местному времени, «ГГГГ-ММ-ДД»: сутки начинаются в 4:00, поэтому ночное повторение входит в предыдущий день. */
export function studyDay(ts = Date.now(), rollover = ROLLOVER) {
  const d = new Date(ts - rollover * HOUR);
  const p = (n) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

/** Срок через n суток: 4:00 нужного дня по местному времени. */
function dueInDays(now, n, rollover = ROLLOVER) {
  const d = new Date(now - rollover * HOUR);
  d.setHours(0, 0, 0, 0);
  d.setDate(d.getDate() + n);
  d.setHours(rollover, 0, 0, 0); // именно 4:00 по часам, даже если в эту ночь переводят часы
  return d.getTime();
}

/** Когда повторить карточку, достигшую уровня lv. */
export function dueFor(lv, now = Date.now()) {
  const w = WAITS[Math.min(Math.max(lv, 1), MAX_LEVEL) - 1];
  return w.min ? now + w.min * MIN : dueInDays(now, w.days);
}

/**
 * Применить ответ. result: 'ok' (верно) | 'near' (почти, или верно с подсказкой) | 'no' (ошибка).
 * written: true для режимов, где слово нужно писать. cap: выше какого уровня это задание слово не поднимает.
 * repeat: это повторная ошибка по слову в том же заходе (js/session.js): штраф уже был, уровень и счёт срывов не меняются.
 */
export function answer(srs, result, { written = false, now = Date.now(), cap = MAX_LEVEL, repeat = false } = {}) {
  const prev = srs?.lv || 0;
  let lv;
  // потолок не отбирает уровни: слово выше потолка просто остаётся на своём
  if (result === "ok") lv = Math.min(prev + 1, MAX_LEVEL, Math.max(cap, prev));
  else if (result === "near" || (result === "no" && repeat && prev > 0)) lv = Math.max(prev, 1);
  else {
    const from = prev || 1;
    lv = Math.min(from, Math.max(written ? FLOOR.written : FLOOR.read, from - PENALTY));
  }
  return {
    lv,
    due: dueFor(lv, now),
    last: now,
    reps: (srs?.reps || 0) + 1,
    lapses: (srs?.lapses || 0) + (result === "no" && prev > 0 && !repeat ? 1 : 0),
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
