// fsrs.js — расписание повторений: «лесенка» первых интервалов + алгоритм FSRS-5.
//
// Как это работает:
//  1. Новая карточка проходит шаги обучения: 1 мин → 10 мин.
//  2. Дальше идёт лесенка в днях: 1 → 3 → 7 → 14 (DEFAULTS.ladder). Это простые и предсказуемые
//     интервалы: «Хорошо» — следующая ступень, «Легко» — через ступень, «Трудно» — та же ступень,
//     «Снова» — минутный шаг и возврат на две ступени назад.
//  3. После последней ступени интервал считает FSRS-5 по стабильности памяти конкретной карточки
//     (обычно 1–2 месяца, затем дольше, максимум год).
// Стабильность и сложность по формулам FSRS обновляются при каждом ответе, в том числе на лесенке,
// поэтому переход к FSRS получается плавным.
//
// Реализовано по публичному описанию алгоритма с параметрами по умолчанию.
// Файл самостоятельный: без зависимостей, работает офлайн.
// ВАЖНО: часть FSRS написана вручную и пока не сверена с эталонной библиотекой
// ts-fsrs (в моей среде нет доступа к npm). tests/fsrs.test.mjs проверяет свойства алгоритма
// (доля запоминания 90 % при интервале = стабильности, порядок интервалов Трудно < Хорошо < Легко).

export const W = [
  0.40255, 1.18385, 3.173, 15.69105, 7.1949, 0.5345, 1.4604, 0.0046, 1.54575, 0.1192,
  1.01925, 1.9395, 0.11, 0.29605, 2.2698, 0.2315, 2.9898, 0.51655, 0.6621,
];

export const Rating = { Again: 1, Hard: 2, Good: 3, Easy: 4 };
export const State = { New: 0, Learning: 1, Review: 2, Relearning: 3 };

export const DECAY = -0.5;
export const FACTOR = 19 / 81;
const DAY = 86400000;
const MIN = 60000;
const HOUR = 3600000;

export const DEFAULTS = {
  retention: 0.9,
  maxInterval: 365,
  learningSteps: [1, 10], // минуты
  relearningSteps: [10],
  ladder: [1, 3, 7, 14], // дни; пустой список = чистый FSRS
  rollover: 4, // «новые сутки» начинаются в 4:00 по местному времени
};

const clamp = (x, lo, hi) => Math.min(hi, Math.max(lo, x));

export function newState(now = Date.now()) {
  return { state: State.New, due: now, stability: 0, difficulty: 0, reps: 0, lapses: 0, last: null, step: 0, rung: 0 };
}

/** Доля вероятного припоминания через t дней при стабильности s. */
export const retrievability = (t, s) => Math.pow(1 + (FACTOR * t) / s, DECAY);

/** Интервал в днях для желаемой доли припоминания r. */
export const intervalFor = (s, r = DEFAULTS.retention) => (s / FACTOR) * (Math.pow(r, 1 / DECAY) - 1);

const initStability = (g) => Math.max(W[g - 1], 0.1);
const initDifficulty = (g) => clamp(W[4] - Math.exp(W[5] * (g - 1)) + 1, 1, 10);

function nextDifficulty(d, g) {
  const delta = -W[6] * (g - 3);
  const damped = d + (delta * (10 - d)) / 9;
  return clamp(W[7] * initDifficulty(4) + (1 - W[7]) * damped, 1, 10);
}

function recallStability(d, s, r, g) {
  const hard = g === Rating.Hard ? W[15] : 1;
  const easy = g === Rating.Easy ? W[16] : 1;
  return s * (1 + Math.exp(W[8]) * (11 - d) * Math.pow(s, -W[9]) * (Math.exp(W[10] * (1 - r)) - 1) * hard * easy);
}

function forgetStability(d, s, r) {
  const sf = W[11] * Math.pow(d, -W[12]) * (Math.pow(s + 1, W[13]) - 1) * Math.exp(W[14] * (1 - r));
  return Math.min(sf, s);
}

function shortTermStability(s, g) {
  const next = s * Math.exp(W[17] * (g - 3 + W[18]));
  return g >= Rating.Good ? Math.max(next, s) : next;
}

function reviewIntervalDays(s, opts) {
  return clamp(Math.round(intervalFor(s, opts.retention)), 1, opts.maxInterval);
}

/** Обновляет стабильность и сложность после ответа. Возвращает новые значения. */
function updateMemory(card, g, now) {
  if (card.state === State.New || !card.stability) {
    return { stability: initStability(g), difficulty: initDifficulty(g) };
  }
  const t = Math.max(0, (now - card.last) / DAY);
  const d = nextDifficulty(card.difficulty, g);
  if (t < 1) return { stability: Math.max(shortTermStability(card.stability, g), 0.1), difficulty: d };
  const r = retrievability(t, card.stability);
  const stability = g === Rating.Again ? forgetStability(card.difficulty, card.stability, r) : recallStability(card.difficulty, card.stability, r, g);
  return { stability: Math.max(stability, 0.1), difficulty: d };
}

/** Начало «логических» суток (в 4:00 по местному времени) для момента t, в миллисекундах. */
function dayStart(t, rollover) {
  const d = new Date(t - rollover * HOUR);
  d.setHours(0, 0, 0, 0);
  return d.getTime();
}

/** Срок через n дней: в 4:00 нужного дня, чтобы карточка была готова с самого утра, а не «через 24 часа ровно». */
function dueInDays(now, n, rollover) {
  const d = new Date(now - rollover * HOUR);
  d.setHours(0, 0, 0, 0);
  d.setDate(d.getDate() + n);
  return d.getTime() + rollover * HOUR;
}

/**
 * Ступень лесенки, на которой стоит карточка (0 … ladder.length; последнее значение = «дальше решает FSRS»).
 * Для карточек, сохранённых до появления лесенки, ступень выводится из фактического интервала.
 */
function rungOf(card, ladder) {
  if (Number.isInteger(card.rung)) return clamp(card.rung, 0, ladder.length);
  if (card.state !== State.Review || card.last == null) return 0;
  const days = (card.due - card.last) / DAY;
  let r = 0;
  ladder.forEach((d, i) => {
    if (days >= d) r = i;
  });
  if (ladder.length && days >= ladder[ladder.length - 1]) r = ladder.length;
  return r;
}

/** Результаты для всех четырёх ответов: { 1: card, 2: card, 3: card, 4: card }. */
export function outcomes(card, now = Date.now(), options = {}) {
  const opts = { ...DEFAULTS, ...options };
  const L = opts.ladder;
  const top = L.length ? L[L.length - 1] : 1;
  const rung = rungOf(card, L);
  const res = {};
  const days = {}; // для ответов, после которых карточка уходит на повторение через N суток

  // Сколько суток карточка прождала в прошлый раз (календарные сутки)
  const prevDays = card.last == null ? top : Math.max(1, Math.round((dayStart(card.due, opts.rollover) - dayStart(card.last, opts.rollover)) / DAY));

  // «Хорошо» — ступень выше, «Легко» — через одну. Когда ступени кончились, интервал даёт FSRS, но с ограничениями ради надёжности:
  // не короче top×1,5 («Хорошо») / top×2 («Легко») и не длиннее, чем ×3 / ×4 от прошлого интервала.
  const pick = (g, eff, stability, base = top) => {
    const n = eff + (g === Rating.Easy ? 2 : 1);
    if (n < L.length) return { days: L[n], rung: n };
    const easy = g === Rating.Easy;
    const floor = L.length ? Math.ceil(top * (easy ? 2 : 1.5)) : 1;
    const cap = L.length ? Math.max(floor, Math.ceil(base * (easy ? 4 : 3))) : Infinity;
    return { days: Math.min(Math.max(reviewIntervalDays(stability, opts), floor), cap), rung: L.length };
  };

  for (const g of [1, 2, 3, 4]) {
    const mem = updateMemory(card, g, now);
    const next = { ...card, ...mem, reps: card.reps + 1, last: now, rung };
    if (card.state === State.Review) {
      if (g === Rating.Again) {
        next.lapses = card.lapses + 1;
        next.state = State.Relearning;
        next.step = 0;
        next.due = now + opts.relearningSteps[0] * MIN;
        next.rung = Math.max(0, rung - 2); // куда вернёмся после переобучения
      } else {
        // Если ответили позже срока и интервал следующей ступени уже прошёл, считаем, что карточка стоит выше
        const elapsed = (now - (card.last ?? now)) / DAY;
        let eff = rung;
        if (rung < L.length) L.forEach((d, i) => i >= rung && d <= elapsed && (eff = i));
        const p =
          g === Rating.Hard
            ? rung < L.length
              ? { days: L[rung], rung }
              : { days: Math.min(Math.max(reviewIntervalDays(next.stability, opts), top), Math.max(prevDays, top)), rung }
            : pick(g, eff, next.stability, prevDays);
        next.state = State.Review;
        next.step = 0;
        next.rung = p.rung;
        days[g] = p.days;
      }
    } else {
      const steps = card.state === State.Relearning ? opts.relearningSteps : opts.learningSteps;
      const isNew = card.state === State.New;
      const cur = isNew ? 0 : card.step; // первый показ новой карточки считается шагом 0
      if (g === Rating.Again) {
        next.state = card.state === State.Relearning ? State.Relearning : State.Learning;
        next.step = 0;
        next.due = now + steps[0] * MIN;
      } else if (g === Rating.Hard) {
        next.state = card.state === State.Relearning ? State.Relearning : State.Learning;
        next.step = cur;
        const wait = isNew && steps.length > 1 ? (steps[0] + steps[1]) / 2 : steps[cur];
        next.due = now + Math.round(wait) * MIN;
      } else if (g === Rating.Good && cur + 1 < steps.length) {
        next.state = card.state === State.Relearning ? State.Relearning : State.Learning;
        next.step = cur + 1;
        next.due = now + steps[next.step] * MIN;
      } else {
        // выпуск из обучения на лесенку: «Хорошо» — первая ступень (или та, куда возвращаемся), «Легко» — следующая
        const p = pick(g, rung - 1, next.stability);
        next.state = State.Review;
        next.step = 0;
        next.rung = p.rung;
        days[g] = p.days;
      }
    }
    res[g] = next;
  }

  // Интервалы в сутках: Трудно < Хорошо < Легко, срок выставляется на 4:00 нужного дня
  let prev = 0;
  for (const g of [2, 3, 4]) {
    if (days[g] == null) continue;
    let d = Math.min(days[g], opts.maxInterval);
    if (d <= prev) d = Math.min(prev + 1, opts.maxInterval);
    prev = d;
    res[g].due = dueInDays(now, d, opts.rollover);
  }
  return res;
}

/** Применить ответ g к карточке. */
export function review(card, g, now = Date.now(), options = {}) {
  return outcomes(card, now, options)[g];
}

/** Подпись интервала в миллисекундах: «10 мин», «3 ч», «3 дн.» и т. п. */
export function formatWait(ms) {
  const m = Math.round(ms / MIN);
  if (m < 60) return `${Math.max(m, 1)} мин`;
  const h = Math.round(ms / (60 * MIN));
  if (h < 24) return `${h} ч`;
  return formatDays(Math.round(ms / DAY));
}

function formatDays(d) {
  if (d < 30) return `${d} дн.`;
  const mo = Math.round(d / 30);
  if (mo < 12) return `${mo} мес.`;
  return `${(d / 365).toFixed(1).replace(".", ",")} г.`;
}

/**
 * Подпись до срока `due`: минуты и часы для коротких шагов, а всё, что дальше, считается в календарных днях
 * («1 дн.» = завтра, даже если до 4:00 завтрашнего утра осталось пять часов).
 */
export function formatDue(due, now = Date.now(), rollover = DEFAULTS.rollover) {
  const ms = due - now;
  if (ms < 3 * HOUR) return formatWait(ms);
  const days = Math.round((dayStart(due, rollover) - dayStart(now, rollover)) / DAY);
  return days < 1 ? formatWait(ms) : formatDays(days);
}
