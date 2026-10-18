// levels.js — уровни освоения слова и расписание повторений. Всё считается само.
//
// У каждой карточки есть уровень. Чем выше уровень, тем реже слово возвращается:
//
//   уровень   1       2      3       4      5      6      7      8      9       10
//   через     10 мин  1 час  12 час  1 дн.  2 дн.  3 дн.  5 дн.  7 дн.  14 дн.  28 дн.
//
// Ступеней десять, потому что запоминание идёт долго: слово, которое выучено «на сегодня», завтра
// обычно уже забыто, а частые мелкие шаги в первые сутки (10 минут, час, полдня) не дают ему
// «взлететь» за один день. «Знаю» начинается с шестого уровня (3 дня), «Освоено» это десятый (28 дней).
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
// Сроки в днях выставляются на 4:00 утра ближайших к «ровно n суток» суток: «через 1 день» это от 12 до 36 часов
// (утреннее повторение вернётся завтра в 4:00, вечернее послезавтра в 4:00), «через 2 дня» от 36 до 60 часов и так далее.
// Так срок не бывает короче половины своего значения, и вечернее повторение не возвращается уже ранним утром.
//
// Лестница менялась: у карточек есть метка v (LADDER). Карточки без метки считаются записанными по прежней лестнице
// из десяти ступеней (1 мин, 10 мин, 1, 3, 7, 14, 30, 60, 120, 240 дн.) и переводятся при запуске (migrateSrs).
//
// Время пользователю не показывается: в интерфейсе есть только индикатор уровня.

const MIN = 60000;
const HOUR = 3600000;
const DAY = 86400000;

export const WAITS = [
  { min: 10 },
  { min: 60 },
  { min: 720 },
  { days: 1 },
  { days: 2 },
  { days: 3 },
  { days: 5 },
  { days: 7 },
  { days: 14 },
  { days: 28 },
];
export const MAX_LEVEL = WAITS.length;
/** Сколько точек показывает индикатор: по точке на уровень, на последнем уровне слово «освоено». */
export const PIPS = MAX_LEVEL;
/** С какого уровня слово «Знаю» (между повторами три дня): с него идёт счёт «Выучено слов». */
export const KNOWN = 6;
/** Версия лестницы, которой записаны уровни карточки (srs.v) и строки журнала (v). */
export const LADDER = 2;
/** На сколько уровней падает карточка при ошибке. */
export const PENALTY = 2;
/** Ниже какого уровня ошибка карточку не опускает (в письменных режимах мягче: писать труднее, чем узнавать). */
export const FLOOR = { read: 1, written: 2 };
export const ROLLOVER = 4; // сутки начинаются в 4:00 по местному времени

/** Сколько ошибок после того, как слово уже было выучено, делает слово «трудным». */
export const LEECH_LAPSES = 4;

export const newSrs = (now = Date.now()) => ({ lv: 0, due: now, last: null, reps: 0, lapses: 0, v: LADDER });
export const isNew = (srs) => !srs || srs.lv === 0;
export const isMastered = (srs) => !!srs && srs.lv >= MAX_LEVEL;
/**
 * Трудное слово: ошибок накопилось много, а освоено оно пока не до конца. Слово, которое наконец усвоилось
 * (дошло до последнего уровня, 28 дней), из трудных уходит само.
 */
export const isLeech = (srs) => !!srs && srs.lapses >= LEECH_LAPSES && !isMastered(srs);

/** Учебный день по местному времени, «ГГГГ-ММ-ДД»: сутки начинаются в 4:00, поэтому ночное повторение входит в предыдущий день. */
export function studyDay(ts = Date.now(), rollover = ROLLOVER) {
  // По часам на стене, а не вычитанием четырёх часов: в ночь перевода часов четыре часа назад это уже не 0:00 того же дня
  const d = new Date(ts);
  if (d.getHours() < rollover) d.setDate(d.getDate() - 1);
  const p = (n) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

/**
 * Срок через n суток: 4:00, ближайшее к моменту «ровно через n×24 часа». Сутки начинаются в 4:00, поэтому у учебного дня
 * этого момента берётся либо его начало, либо начало следующего. Срок всегда между n−½ и n+½ суток от now, а значит
 * не убывает с ростом n и не бывает короче половины своего значения.
 */
export function dueInDays(now, n, rollover = ROLLOVER) {
  const target = new Date(now + n * DAY);
  const day = new Date(target.getTime() - rollover * HOUR);
  // 4:00 именно по часам, даже если в эту ночь переводят часы
  const at = (k) => new Date(day.getFullYear(), day.getMonth(), day.getDate() + k, rollover, 0, 0, 0).getTime();
  const [from, to] = [at(0), at(1)];
  return target.getTime() - from <= to - target.getTime() ? from : to;
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
    v: LADDER,
  };
}

// ── Переход со старых лестниц ──────────────────────────────────────────────
/**
 * Прежняя лестница (до версии 4.4): уровень → число суток (0 для минутных ступеней).
 * Уровень старой лестницы переводится в новый по тому, сколько повторений с перерывом слово уже прошло:
 *   старый 1 и 2 (минуты)        → 1 (10 мин): слово только увидели, с перерывом ещё не вспоминали
 *   старый 3 (1 день)            → 2 (1 час): прошло десятиминутное повторение, суточного ещё не было
 *   старый 4 (3 дня)             → 5 (2 дня): пройдено суточное повторение
 *   старый 5, 6 (7 и 14 дней)    → 7, 9 (5 и 14 дней)
 *   старый 7 и выше (30–240 дн.) → 10 (28 дней)
 * Срок следующего повторения при переводе не меняется (кроме слишком далёких: больше 28 суток вперёд не уходит).
 */
export const OLD_TO_NEW = [0, 1, 1, 2, 5, 7, 9, 10, 10, 10, 10];
const OLD_DAYS = [0, 0, 1, 3, 7, 14, 30, 60, 120, 240];

/** Уровень на лестнице версии v → уровень на нынешней. Версия 2 и выше: уровень уже нынешний. */
export function levelInLadder(lv, v) {
  const n = Math.max(0, Math.round(lv) || 0);
  return v >= LADDER ? Math.min(n, MAX_LEVEL) : OLD_TO_NEW[Math.min(n, OLD_TO_NEW.length - 1)];
}

/** Нужно ли переводить карточку на нынешнюю лестницу. */
export const needsMigration = (srs) => !!srs && !(srs.v >= LADDER);

/** Карточка на нынешней лестнице: уровень, срок и остальное; срок за пределом 28 суток подтягивается к нему. */
export function migrateSrs(srs, now = Date.now()) {
  if (!srs || !needsMigration(srs)) return srs;
  const lv = levelInLadder(srs.lv, 1);
  if (lv === 0) return { ...srs, lv: 0, v: LADDER };
  const farthest = now + 28 * DAY;
  const due = Number.isFinite(srs.due) ? Math.min(srs.due, farthest) : now;
  return { ...srs, lv, due, v: LADDER };
}

/**
 * Карточка с допустимыми значениями: уровень целый от 0 до MAX_LEVEL, срок и время ответа числа, счётчики целые и не меньше нуля.
 * Нужна на случай повреждённой копии или записи: срок NaN означал бы карточку, которая никогда не наступит. Целую карточку возвращает как есть.
 */
export function sanitizeSrs(srs, now = Date.now()) {
  if (!srs || typeof srs !== "object") return newSrs(now);
  const count = (n) => (Number.isInteger(n) && n >= 0 ? n : Math.max(0, Math.round(Number(n)) || 0));
  const lv = Math.min(count(srs.lv), MAX_LEVEL);
  const due = Number.isFinite(srs.due) ? srs.due : now;
  const last = Number.isFinite(srs.last) ? srs.last : null;
  const reps = count(srs.reps);
  const lapses = count(srs.lapses);
  const v = srs.v >= LADDER ? srs.v : LADDER;
  const same = lv === srs.lv && due === srs.due && last === srs.last && reps === srs.reps && lapses === srs.lapses && v === srs.v;
  return same ? srs : { ...srs, lv, due, last, reps, lapses, v };
}

/** Перевод карточек самого старого формата (FSRS, версии 1–2) сразу в нынешние уровни. */
export function fromLegacy(f, now = Date.now()) {
  if (!f || f.state === 0) return { ...newSrs(f?.due ?? now), lapses: f?.lapses || 0 };
  let old;
  if (f.state === 1 || f.state === 3) old = f.step >= 1 ? 2 : 1;
  else {
    const days = Math.max(1, Math.round(((f.due || now) - (f.last || now)) / DAY));
    old = 3;
    OLD_DAYS.forEach((d, i) => d && d <= days && (old = i + 1));
  }
  return { lv: levelInLadder(old, 1), due: f.due ?? now, last: f.last ?? null, reps: f.reps || 0, lapses: f.lapses || 0, v: LADDER };
}
