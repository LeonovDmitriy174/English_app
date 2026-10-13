// charts.js — данные для графиков: календарь занятий, кривая «Выучено слов», чтение по дням, карта книги и темп чтения.
// Чистые функции без DOM (tests/charts.test.mjs); рисует их js/views/charts.js.
//
// Везде одно правило: показываем то, что уже сделано. Ни целей, ни планок, ни времени следующих повторений: кривая слов не упирается в «потолок»,
// шкала растёт вместе со словарём. Прогноз есть только у книги («в таком темпе дочитаете…») и считается по вашему же темпу.
import { studyDay, KNOWN, levelInLadder } from "./levels.js";
import { lastDays } from "./progress.js";
import { readOn, wordsOn, fmtDuration, MIN_ACTIVE_SEC } from "./activity.js";
import { bookWords, wordsRead, isFinished, readFraction, chapterIndex, fmtWords } from "./reading.js";

export const LEARNED = KNOWN; // с какого уровня слово «выучено»: «Знаю» и выше (groupOf в progress.js)
export const HEAT_WEEKS = 17; // сколько недель в календаре занятий
export const HEAT_SEC_PER_REVIEW = 30; // для насыщенности цвета полминуты чтения равны одному повторению
export const PACE_DAYS = 14; // за сколько последних дней считается темп чтения
export const PACE_MIN_DAYS = 3; // меньше дней данных — темп не показываем
export const PACE_MIN_WORDS = 600; // меньше слов — тоже

const MONTHS_SHORT = ["янв", "фев", "мар", "апр", "май", "июн", "июл", "авг", "сен", "окт", "ноя", "дек"];
const MONTHS_GEN = ["января", "февраля", "марта", "апреля", "мая", "июня", "июля", "августа", "сентября", "октября", "ноября", "декабря"];
const MONTHS_PREP = ["январе", "феврале", "марте", "апреле", "мае", "июне", "июле", "августе", "сентябре", "октябре", "ноябре", "декабре"];
const WEEKDAYS = ["пн", "вт", "ср", "чт", "пт", "сб", "вс"]; // с понедельника

export const plural = (n, f) => {
  const a = n % 10;
  const b = n % 100;
  return f[b > 10 && b < 20 ? 2 : a === 1 ? 0 : a >= 2 && a <= 4 ? 1 : 2];
};

// ── Даты ────────────────────────────────────────────────────────────────────
// Учебные дни — строки «ГГГГ-ММ-ДД». Арифметику ведём по номерам суток в UTC, чтобы переводы часов ничего не сдвигали.
export const dayNumber = (day) => Date.UTC(+day.slice(0, 4), +day.slice(5, 7) - 1, +day.slice(8, 10)) / 86400000;
export const dayOfNumber = (n) => new Date(n * 86400000).toISOString().slice(0, 10);
const weekdayOf = (day) => (new Date(dayNumber(day) * 86400000).getUTCDay() + 6) % 7; // понедельник = 0

/** «12 окт». */
export const fmtDayShort = (day) => `${+day.slice(8, 10)} ${MONTHS_SHORT[+day.slice(5, 7) - 1]}`;
/** «пн, 12 октября». */
export const fmtDayLong = (day) => `${WEEKDAYS[weekdayOf(day)]}, ${+day.slice(8, 10)} ${MONTHS_GEN[+day.slice(5, 7) - 1]}`;

// ── Шкала и линия ───────────────────────────────────────────────────────────
/** Шаг делений шкалы 1, 2, 5, 10, 20, 50…: не меньше 1. */
export function niceStep(raw) {
  const r = Math.max(1, raw);
  const p = Math.pow(10, Math.floor(Math.log10(r)));
  for (const m of [1, 2, 5, 10]) if (m * p >= r) return m * p;
  return 10 * p;
}

/** Линия «М x y L x y …» по точкам [{x, y}] с одним знаком после запятой. */
export const linePath = (pts) => pts.map((p, i) => `${i ? "L" : "M"}${p.x.toFixed(1)} ${p.y.toFixed(1)}`).join("");

// ── Календарь занятий ───────────────────────────────────────────────────────
/**
 * Календарь занятий за weeks недель: колонки — недели с понедельника, строки — дни недели; последняя колонка кончается сегодняшним днём.
 * Возвращает { cells, weeks, months, activeDays }. Клетка: { day, col, row, n (повторений), sec (чтения), active, level 0…4 }.
 * День «занятый», как и для серии: хотя бы одно повторение или минута чтения. Насыщенность 1…4 — по месту дня среди занятых дней
 * календаря (четверти), поэтому цвет читается при любом темпе: у новичка и у того, кто повторяет сотни слов в день.
 */
export function activityGrid(log, activity, now = Date.now(), weeks = HEAT_WEEKS) {
  const row = weekdayOf(studyDay(now));
  const days = lastDays(now, (weeks - 1) * 7 + row + 1);
  const reviews = new Map(days.map((d) => [d, 0]));
  for (const e of log || []) {
    const d = studyDay(e.t);
    if (reviews.has(d)) reviews.set(d, reviews.get(d) + 1);
  }
  const cells = days.map((day, i) => {
    const n = reviews.get(day);
    const sec = readOn(activity, day);
    const active = n > 0 || sec >= MIN_ACTIVE_SEC;
    return { day, col: Math.floor(i / 7), row: i % 7, n, sec, active, score: active ? n + sec / HEAT_SEC_PER_REVIEW : 0, level: 0 };
  });
  const scores = cells.filter((c) => c.active).map((c) => c.score);
  for (const c of cells) {
    if (!c.active) continue;
    const share = scores.filter((s) => s <= c.score).length / scores.length;
    c.level = share <= 0.25 ? 1 : share <= 0.5 ? 2 : share <= 0.75 ? 3 : 4;
  }
  // подписи месяцев над колонками: в колонке, где начинается новый месяц; если две подписи ближе трёх колонок, остаётся более поздняя
  const found = [];
  for (let col = 0; col < weeks; col++) {
    const m = +cells[col * 7].day.slice(5, 7) - 1;
    if (!found.length || found[found.length - 1].month !== m) found.push({ col, month: m, label: MONTHS_SHORT[m] });
  }
  const months = [];
  for (let i = found.length - 1; i >= 0; i--) if (!months.length || months[0].col - found[i].col >= 3) months.unshift(found[i]);
  return { cells, weeks, months, activeDays: cells.filter((c) => c.active).length };
}

/** Подпись к дню календаря и к столбику: «пн, 12 октября: 34 повторения, чтение 18 мин» или «…: занятий не было». */
export function describeDay(cell) {
  const parts = [cell.n && `${cell.n} ${plural(cell.n, ["повторение", "повторения", "повторений"])}`, cell.sec >= MIN_ACTIVE_SEC && `чтение ${fmtDuration(cell.sec)}`].filter(Boolean);
  return `${fmtDayLong(cell.day)}: ${parts.length ? parts.join(", ") : "занятий не было"}`;
}

// ── Выучено слов ────────────────────────────────────────────────────────────
/**
 * Когда каждое нынешнее «выученное» слово (уровень «Знаю» и выше, без «не повторять») стало выученным: день, когда оно впервые
 * получило такой уровень по журналу ответов; если в журнале этого нет (слово пришло из копии без журнала), день последнего ответа или добавления.
 * Возвращает { per: Map день → сколько слов, total } или null, если выученных слов нет. Слово, которое упало ниже «Знаю», в кривую не входит:
 * последняя точка всегда равна числу «Выучено слов» на главной.
 */
function learnedDates(cards, log, now) {
  const learned = new Map();
  for (const c of cards) if (!c.skip && (c.srs?.lv || 0) >= LEARNED) learned.set(c.id ?? c, c);
  if (!learned.size) return null;
  const first = new Map();
  for (const e of log || []) {
    // строки журнала, записанные по прежней лестнице (без v), переводятся на нынешнюю
    if (!(levelInLadder(e.lv, e.v) >= LEARNED) || !learned.has(e.id)) continue;
    const t = first.get(e.id);
    if (t === undefined || e.t < t) first.set(e.id, e.t);
  }
  const today = studyDay(now);
  const per = new Map();
  for (const [id, c] of learned) {
    let day = studyDay(first.get(id) ?? c.srs.last ?? c.added ?? now);
    if (day > today) day = today; // строки «ГГГГ-ММ-ДД» сравниваются как даты
    per.set(day, (per.get(day) || 0) + 1);
  }
  return { per, total: learned.size, today };
}

/**
 * Кривая «Выучено слов»: накопленное число по дням от дня перед первым выученным словом до сегодня (но не короче двух недель);
 * за больше чем 120 дней точки берутся раз в неделю. Точка: { day, t (номер суток), n }. Цели и потолка нет: шкала подбирается по данным.
 * Возвращает { points, total, step, max } или null, если выученных слов ещё нет. step — шаг делений шкалы, max — верх шкалы (всегда выше total).
 */
export function learnedSeries(cards, log, now = Date.now()) {
  const info = learnedDates(cards, log, now);
  if (!info) return null;
  const nums = [...info.per.keys()].map(dayNumber);
  const end = dayNumber(info.today);
  const start = Math.min(Math.min(...nums) - 1, end - 14);
  const at = (n) => {
    const day = dayOfNumber(n);
    let sum = 0;
    for (const [d, k] of info.per) if (d <= day) sum += k;
    return { day, t: n, n: sum };
  };
  const ts = [];
  if (end - start <= 120) for (let n = start; n <= end; n++) ts.push(n);
  else {
    for (let n = end; n > start; n -= 7) ts.unshift(n);
    ts.unshift(start);
  }
  const step = niceStep(info.total / 3);
  const max = step * Math.ceil((info.total * 1.08 + 0.001) / step);
  return { points: ts.map(at), total: info.total, step, max };
}

/** Последние n дней кривой одним массивом чисел — для маленького графика на главной. null, если выученных слов нет. */
export function learnedRecent(cards, log, now = Date.now(), n = 30) {
  const info = learnedDates(cards, log, now);
  if (!info) return null;
  return lastDays(now, n).map((day) => {
    let sum = 0;
    for (const [d, k] of info.per) if (d <= day) sum += k;
    return sum;
  });
}

/** Ближайшая к доле f (0…1) времени точка кривой: индекс. */
export function nearestPoint(points, f) {
  const t0 = points[0].t;
  const want = t0 + Math.min(1, Math.max(0, f)) * (points[points.length - 1].t - t0);
  let best = 0;
  for (let i = 1; i < points.length; i++) if (Math.abs(points[i].t - want) < Math.abs(points[best].t - want)) best = i;
  return best;
}

/** «12 окт: 187 слов». */
export const describePoint = (p) => `${fmtDayShort(p.day)}: ${p.n} ${plural(p.n, ["слово", "слова", "слов"])}`;

// ── Чтение по дням ──────────────────────────────────────────────────────────
/** Чтение за последние n дней: [{ day, n (секунд), sec }] от старого к новому. n и sec одно и то же число: поле n общее со столбиками повторений. */
export function readByDay(activity, now = Date.now(), n = 14) {
  return lastDays(now, n).map((day) => ({ day, n: readOn(activity, day), sec: readOn(activity, day) }));
}

// ── Карта книги и темп чтения ───────────────────────────────────────────────
/**
 * Карта книги: полоска из глав, ширина по длине главы (в знаках). Прочитанные главы залиты, текущая — до места, где вы остановились.
 * Возвращает { segs: [{ x, w, fill }] (доли ширины, сумма w = 1), ch, total, pct, finished }.
 */
export function bookMap(book) {
  const chapters = book?.chapters || [];
  const total = chapters.length;
  const chars = chapters.map((c) => c.chars || 0);
  const sum = chars.reduce((a, b) => a + b, 0);
  const finished = isFinished(book);
  const ch = chapterIndex(book);
  const within = Number.isFinite(book?.progress?.f) ? Math.min(1, Math.max(0, book.progress.f)) : book?.progress?.p ? 0.5 : 0;
  let x = 0;
  const segs = chapters.map((_, i) => {
    const w = sum ? chars[i] / sum : 1 / total;
    const seg = { x, w, fill: finished || i < ch ? 1 : i === ch ? within : 0 };
    x += w;
    return seg;
  });
  return { segs, ch, total, pct: finished ? 100 : Math.round(readFraction(book) * 100), finished };
}

/**
 * Темп чтения: сколько слов в день вы читали за последние PACE_DAYS дней — от первого дня, за который слова записаны, до сегодня
 * (нечитанные дни внутри считаются нулями). null, пока данных мало: меньше PACE_MIN_DAYS дней или PACE_MIN_WORDS слов.
 */
export function readingPace(activity, now = Date.now(), window = PACE_DAYS) {
  const days = lastDays(now, window);
  const first = days.findIndex((d) => wordsOn(activity, d) > 0);
  if (first < 0) return null;
  const span = days.length - first;
  const words = days.slice(first).reduce((sum, d) => sum + wordsOn(activity, d), 0);
  if (span < PACE_MIN_DAYS || words < PACE_MIN_WORDS) return null;
  return { perDay: words / span, span, words };
}

/** Когда дочитаете книгу при этом темпе: { days, left } или null (темпа нет, книга прочитана). days — число суток, округлено вверх. */
export function finishEstimate(book, pace) {
  if (!pace || !(pace.perDay > 0) || isFinished(book)) return null;
  const left = bookWords(book) - wordsRead(book);
  if (!(left > 0)) return null;
  return { days: Math.ceil(left / pace.perDay), left };
}

/** Слов в день для текста: до тысячи — до десятков («820»), дальше «1,4 тыс.». */
const fmtPace = (perDay) => (perDay < 1000 ? String(Math.max(10, Math.round(perDay / 10) * 10)) : fmtWords(perDay));

/**
 * Фраза про темп: «В таком темпе (около 820 слов в день) дочитаете примерно в марте 2027». Без темпа — подсказка, откуда он возьмётся.
 * now нужен только для названия месяца и года.
 */
export function paceLine(pace, est, now = Date.now()) {
  if (!pace) return "Темп чтения появится после нескольких дней чтения: он считается по прочитанным словам.";
  if (!est) return "";
  const rate = `около ${fmtPace(pace.perDay)} слов в день`;
  if (est.days > 730) return `В таком темпе (${rate}) это больше двух лет.`;
  const d = new Date(now);
  const to = new Date(d.getFullYear(), d.getMonth(), d.getDate() + est.days);
  if (est.days <= 1) return `В таком темпе (${rate}) дочитаете завтра.`;
  if (est.days <= 45) return `В таком темпе (${rate}) дочитаете примерно ${to.getDate()} ${MONTHS_GEN[to.getMonth()]}.`;
  return `В таком темпе (${rate}) дочитаете примерно в ${MONTHS_PREP[to.getMonth()]} ${to.getFullYear()}.`;
}
