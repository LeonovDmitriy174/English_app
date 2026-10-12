// modes.js — задания повторения и «лесенка»: какое задание подходит слову на его уровне.
// Чистые функции без DOM, проверяются в Node (tests/modes.test.mjs).
//
// Режимов четыре (так они называются в приложении), а внутри каждого есть задания разной трудности:
//
//   Выбор                 choice          слово → выбрать перевод
//                         choiceBack      перевод → выбрать английское слово
//   Слово в предложении   clozeChoice     предложение с пропуском → выбрать слово
//                         cloze           предложение с пропуском → вписать слово
//   Написание             spell           перевод или определение → написать слово
//   Слух                  listenChoice    услышать слово → выбрать перевод
//                         listenType      услышать слово → написать
//
// Слову на низком уровне достаются лёгкие задания (узнать), на высоком трудные (вспомнить и написать):
//
//   уровень слова   задания
//   0 (новое)       choice
//   1               choice, choiceBack, listenChoice
//   2               choiceBack, listenChoice, clozeChoice
//   3               clozeChoice, spell, cloze
//   4 и выше        spell, cloze, listenType
//
// Что в какой «ступени» — задаёт ранг задания (rank): 1 самое лёгкое, 5 самое трудное. Ступень уровня — это
// диапазон рангов (band). Из включённых режимов берутся задания своей ступени; если таких нет, то ближайшие.
//
// Потолок (cap): задания с выбором из вариантов поднимают слово не выше своего потолка. Угадать верный вариант
// из четырёх можно и не зная слова, поэтому выше 3 уровня (больше суток между повторами) слово растёт только
// от заданий, где его нужно вспомнить самому: написать, вписать в предложение, написать на слух.

export const MODES = [
  { key: "choice", name: "Выбор", short: "Слово и четыре варианта", desc: "Слово и четыре варианта: перевод, а на средних уровнях наоборот", tasks: ["choice", "choiceBack"] },
  { key: "cloze", name: "Слово в предложении", short: "Пропуск в предложении из книги", desc: "Выбрать или вписать слово в предложение из книги", tasks: ["clozeChoice", "cloze"] },
  { key: "spell", name: "Написание", short: "Перевод на экране, слово пишете сами", desc: "Видите перевод или определение и пишете слово", tasks: ["spell"] },
  { key: "listen", name: "Слух", short: "Слушаете слово и отвечаете", desc: "Слушаете слово и выбираете перевод или пишете его", tasks: ["listenChoice", "listenType"] },
];

export const TASKS = {
  choice: { rank: 1, cap: 3, written: false },
  listenChoice: { rank: 2, cap: 3, written: false },
  choiceBack: { rank: 2, cap: 3, written: false },
  clozeChoice: { rank: 3, cap: 4, written: false },
  spell: { rank: 4, cap: Infinity, written: true },
  cloze: { rank: 4, cap: Infinity, written: true },
  listenType: { rank: 5, cap: Infinity, written: true },
};

export const DEFAULT_MIX = MODES.map((m) => m.key);
export const MODE_KEYS = new Set(DEFAULT_MIX);

/** Список режимов Микса из настроек: только известные, без повторов, не пустой (иначе все). */
export function normalizeMix(list) {
  const out = (Array.isArray(list) ? list : []).filter((k, i, a) => MODE_KEYS.has(k) && a.indexOf(k) === i);
  return out.length ? out : [...DEFAULT_MIX];
}

/** Ступень трудности для слова с уровнем lv: диапазон рангов заданий [от, до]. */
export function band(lv = 0) {
  if (lv <= 0) return [1, 1];
  if (lv === 1) return [1, 2];
  if (lv === 2) return [2, 3];
  if (lv === 3) return [3, 4];
  return [4, 5];
}

export const capOf = (task) => TASKS[task]?.cap ?? Infinity;
export const isWritten = (task) => !!TASKS[task]?.written;

/** Режим, к которому относится задание (для подписей и статистики). */
export const modeOf = (task) => MODES.find((m) => m.tasks.includes(task))?.key;

/**
 * Какое задание дать слову. modes — ключи включённых режимов; can(task) говорит, возможно ли задание для этой карточки
 * (нет предложения из книги, нет озвучки и т. п.); rnd нужен только тестам.
 * Новое слово без режимов узнавания всё равно начинается с выбора: незнакомое слово писать нельзя.
 */
export function pickTask({ lv = 0, modes = DEFAULT_MIX, can = () => true, rnd = Math.random } = {}) {
  const enabled = MODES.filter((m) => modes.includes(m.key))
    .flatMap((m) => m.tasks)
    .filter((t) => can(t));
  if (lv <= 0 && !enabled.some((t) => TASKS[t].rank <= 3)) return "choice";
  if (!enabled.length) return "choice";
  const [lo, hi] = band(lv);
  const dist = (t) => (TASKS[t].rank < lo ? lo - TASKS[t].rank : Math.max(0, TASKS[t].rank - hi));
  const best = Math.min(...enabled.map(dist));
  const pool = enabled.filter((t) => dist(t) === best);
  return pool[Math.floor(rnd() * pool.length) % pool.length];
}

/** Запасное задание, если выбранное не удалось построить (нет подходящих вариантов и т. п.). */
export const FALLBACK = { choiceBack: "choice", clozeChoice: "choice", listenChoice: "choice", choice: "spell", cloze: "spell", listenType: "spell", spell: null };
