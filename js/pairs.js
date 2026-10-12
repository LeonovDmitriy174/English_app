// pairs.js — разминка «Пары»: пять слов и пять переводов, нужно соединить. Чистые функции без DOM (tests/pairs.test.mjs).
// Разминка не влияет на уровни: она только помогает вспомнить слова перед повторением.

export const PAIRS = 5;
export const MIN_PAIRS = 3;
const MAX_MEANING = 28; // длиннее перевод не помещается в кнопку

/** Короткий перевод для кнопки: первое значение до «;», а если оно длинное, до первой запятой. null, если коротко не получилось. */
export function shortMeaning(card) {
  const raw = card.ru || card.rm || "";
  let seg = raw.split(";")[0].trim();
  if (seg.length > MAX_MEANING) seg = seg.split(",")[0].trim();
  return seg && seg.length <= MAX_MEANING ? seg : null;
}

const shuffle = (list, rnd) => {
  const a = [...list];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rnd() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
};

/**
 * Выбирает до n карточек для разминки из списка (он уже упорядочен по важности: сначала то, что пора повторять).
 * Берутся карточки с коротким переводом, без одинаковых слов и одинаковых переводов.
 * Возвращает [{ id, w, ru }] или null, если подходящих меньше MIN_PAIRS.
 */
export function pickPairs(cards, { n = PAIRS, rnd = Math.random } = {}) {
  const words = new Set();
  const meanings = new Set();
  const usable = [];
  for (const c of cards) {
    const ru = shortMeaning(c);
    const key = ru?.toLowerCase();
    if (!ru || words.has(c.w.toLowerCase()) || meanings.has(key)) continue;
    words.add(c.w.toLowerCase());
    meanings.add(key);
    usable.push({ id: c.id, w: c.w, ru });
  }
  if (usable.length < MIN_PAIRS) return null;
  // из первых нескольких важных карточек выбираем случайные, чтобы разминка не повторялась слово в слово
  return shuffle(usable.slice(0, n * 3), rnd).slice(0, n);
}

/** Порядок переводов в правом столбце: перемешан и не совпадает с порядком слов (иначе соединять нечего). */
export function rightOrder(pairs, rnd = Math.random) {
  const ids = pairs.map((p) => p.id);
  if (ids.length < 2) return ids;
  let order = shuffle(ids, rnd);
  for (let tries = 0; tries < 8 && order.every((id, i) => id === ids[i]); tries++) order = shuffle(ids, rnd);
  if (order.every((id, i) => id === ids[i])) order = [...ids.slice(1), ids[0]];
  return order;
}
