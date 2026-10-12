// bookwords.js — «Слова этой книги»: частые слова и фразы книги, которых ещё нет в вашем словаре.
// Список берётся из разбора книги (js/analysis.js, поле top). Чистые функции без DOM: проверяются в Node (tests/bookwords.test.mjs).

/**
 * Слова, которые в словаре выше этой частоты (шкала Zipf, 0–8), считаются известными любому, кто читает по-английски
 * («time», «house»), и в список не попадают. Для фраз частоты нет: они показываются всегда.
 */
export const COMMON_ZIPF = 5;
/** Короче трёх букв слова («a», «I», «to») в список не попадают. */
const MIN_LETTERS = 3;

/**
 * Кандидаты на добавление: [{ entry, n }], самые частые в книге первыми.
 * top — разбор книги [[id, сколько раз], …] по убыванию; cards — карточки пользователя (Map по id);
 * known — id слов, которые пользователь пометил «Знаю».
 * Слова без перевода не предлагаются: добавлять нечего.
 */
export function bookWords({ top, glossary, cards, known, maxZ = COMMON_ZIPF } = {}) {
  const out = [];
  for (const [id, n] of top || []) {
    if (cards?.has(id) || known?.has(id)) continue;
    const entry = glossary?.byId.get(id);
    if (!entry || !(entry.ru || entry.rm)) continue;
    if (entry.t === "w") {
      if (entry.w.length < MIN_LETTERS) continue;
      if (Number.isFinite(entry.z) && entry.z > maxZ) continue;
    }
    out.push({ entry, n });
  }
  return out;
}

/** Есть ли в словаре данные о частоте слов (без них в списке попадаются и самые простые слова). */
export const hasFrequency = (glossary) => !!glossary?.list.some((e) => e.t === "w" && Number.isFinite(e.z));

/** «встречается 12 раз» с правильным склонением. */
export function timesText(n) {
  const a = n % 10;
  const b = n % 100;
  const word = b > 10 && b < 20 ? "раз" : a >= 2 && a <= 4 ? "раза" : "раз";
  return `встречается ${n} ${word}`;
}
