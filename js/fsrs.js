// fsrs.js — расписание интервального повторения по алгоритму FSRS-5.
//
// Реализовано по публичному описанию алгоритма с параметрами по умолчанию.
// Файл самостоятельный: без зависимостей, работает офлайн.
// ВАЖНО: реализация написана вручную и пока не сверена с эталонной библиотекой
// ts-fsrs (в моей среде нет доступа к npm). Сверка запланирована: tests/fsrs.test.mjs
// проверяет свойства алгоритма (доля запоминания 90 % при интервале = стабильности,
// порядок интервалов Трудно < Хорошо < Легко и т. д.).

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

export const DEFAULTS = {
  retention: 0.9,
  maxInterval: 365,
  learningSteps: [1, 10], // минуты
  relearningSteps: [10],
};

const clamp = (x, lo, hi) => Math.min(hi, Math.max(lo, x));

export function newState(now = Date.now()) {
  return { state: State.New, due: now, stability: 0, difficulty: 0, reps: 0, lapses: 0, last: null, step: 0 };
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

/** Результаты для всех четырёх ответов: { 1: card, 2: card, 3: card, 4: card }. */
export function outcomes(card, now = Date.now(), options = {}) {
  const opts = { ...DEFAULTS, ...options };
  const res = {};
  for (const g of [1, 2, 3, 4]) {
    const mem = updateMemory(card, g, now);
    const next = { ...card, ...mem, reps: card.reps + 1, last: now };
    if (card.state === State.Review) {
      if (g === Rating.Again) {
        next.lapses = card.lapses + 1;
        next.state = State.Relearning;
        next.step = 0;
        next.due = now + opts.relearningSteps[0] * MIN;
      } else {
        next.state = State.Review;
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
        next.state = State.Review;
        next.step = 0;
      }
    }
    res[g] = next;
  }
  // Для карточек в состоянии Review: интервалы Трудно < Хорошо < Легко (минимум на сутки)
  const need = [];
  for (const g of [2, 3, 4]) if (res[g].state === State.Review) need.push(g);
  let prev = 0;
  for (const g of need) {
    let days = reviewIntervalDays(res[g].stability, opts);
    if (days <= prev) days = Math.min(prev + 1, opts.maxInterval);
    prev = days;
    res[g].due = now + days * DAY;
  }
  return res;
}

/** Применить ответ g к карточке. */
export function review(card, g, now = Date.now(), options = {}) {
  return outcomes(card, now, options)[g];
}

/** Подпись интервала до следующего показа: «10 мин», «3 дн.» и т. п. */
export function formatWait(ms) {
  const m = Math.round(ms / MIN);
  if (m < 60) return `${Math.max(m, 1)} мин`;
  const h = Math.round(ms / (60 * MIN));
  if (h < 24) return `${h} ч`;
  const d = Math.round(ms / DAY);
  if (d < 30) return `${d} дн.`;
  const mo = Math.round(d / 30);
  if (mo < 12) return `${mo} мес.`;
  return `${(d / 365).toFixed(1).replace(".", ",")} г.`;
}
