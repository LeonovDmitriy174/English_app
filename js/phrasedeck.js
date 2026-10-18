// phrasedeck.js — «Разговорные фразы»: колода фраз для живой речи и её проверка в формате «Топ слов по частотности».
// Чистые функции без DOM, проверяются в Node (tests/phrasedeck.test.mjs). Сами фразы лежат в js/phrasedata.js.
//
// Проверка такая же, как у частотных слов: фраза и четыре перевода. Верный ответ добавляет фразу в словарь «знакомой»,
// неверный как новую; если фраза уже есть в словаре, правила те же (js/freqdeck.js, decide). Фразы не зависят от общего
// словаря: у каждой свой перевод и пример, поэтому колода работает и тогда, когда полный словарь не собран.
// Что проверено, запоминается по фразам, а не по номеру: можно идти по темам в любом порядке и вернуться к любой.
import { PHRASE_GROUPS } from "./phrasedata.js";

/** Ключ фразы: строчные буквы, один вид апострофа, одинарные пробелы. */
export const phraseKey = (s) =>
  String(s ?? "")
    .toLowerCase()
    .replace(/[’‘`´]/g, "'")
    .replace(/\s+/g, " ")
    .trim();

let cache = null;

/**
 * Колода: { groups: [{ key, name, items }], items: [запись], byId: Map, glossary: { list } }.
 * Запись похожа на запись словаря (её принимает saveCard): id «id:ключ», тип id (идиома), часть речи «phrase».
 * glossary — «словарь» из одних фраз: из него choices.js берёт неверные переводы.
 */
export function phraseDeck(groups = PHRASE_GROUPS) {
  if (cache && groups === PHRASE_GROUPS) return cache;
  const items = [];
  const byId = new Map();
  const out = groups.map((g) => {
    const list = [];
    for (const raw of g.lines.split("\n")) {
      const line = raw.trim();
      if (!line) continue;
      const [w, ru, ex] = line.split("|").map((x) => x.trim());
      const id = `id:${phraseKey(w)}`;
      if (!w || !ru || !ex || byId.has(id)) continue;
      const entry = { id, t: "id", w, pos: "phrase", ru, en: "", ex, group: g.key };
      byId.set(id, entry);
      list.push(entry);
      items.push(entry);
    }
    return { key: g.key, name: g.name, items: list };
  });
  const deck = { groups: out, items, byId, glossary: { list: items } };
  if (groups === PHRASE_GROUPS) cache = deck;
  return deck;
}

// ── Состояние ───────────────────────────────────────────────────────────────
/** Что хранится (kv «phrasedeck»): { v, done: { id фразы: 1 } }. */
export const emptyState = () => ({ v: 1, done: {} });

const MAX_DONE = 5000;

export function normalizeState(raw) {
  const s = emptyState();
  const done = raw && typeof raw === "object" && raw.done && typeof raw.done === "object" ? raw.done : {};
  for (const id of Object.keys(done)) {
    if (!done[id] || !/^id:.{1,80}$/.test(id)) continue;
    s.done[id] = 1;
    if (Object.keys(s.done).length >= MAX_DONE) break;
  }
  return s;
}

/** Слияние двух состояний (копия данных): проверенное хотя бы там остаётся проверенным. */
export function mergeStates(a, b) {
  const x = normalizeState(a);
  const y = normalizeState(b);
  return { v: 1, done: { ...x.done, ...y.done } };
}

export const markDone = (state, id) => ((state.done[id] = 1), state);

/** Сколько фраз проверено в колоде (фразы, которых в колоде уже нет, не считаются). */
export const doneCount = (state, deck) => deck.items.filter((e) => state.done[e.id]).length;

/** Сводка для экрана: всего, проверено, по темам. */
export function overview(state, deck) {
  const groups = deck.groups.map((g) => {
    const checked = g.items.filter((e) => state.done[e.id]).length;
    return { key: g.key, name: g.name, size: g.items.length, checked, complete: checked >= g.items.length };
  });
  const done = groups.reduce((n, g) => n + g.checked, 0);
  return { total: deck.items.length, done, groups, finished: deck.items.length > 0 && done >= deck.items.length };
}

/**
 * Очередь для захода: ещё не проверенные фразы по порядку тем. scope — ключ темы или "all". Если проверено всё, берётся всё заново
 * (restart: true), чтобы кнопка «Пройти заново» работала и для одной темы, и для всей колоды.
 */
export function queueFor(deck, state, scope = "all", { restart = false } = {}) {
  const pool = scope === "all" ? deck.items : deck.groups.find((g) => g.key === scope)?.items || [];
  return restart ? [...pool] : pool.filter((e) => !state.done[e.id]);
}

/** Какая тема идёт следующей после scope по порядку и ещё не пройдена до конца (null, если такой нет). */
export function nextGroup(deck, state, scope) {
  const at = deck.groups.findIndex((g) => g.key === scope);
  for (let i = 1; i <= deck.groups.length; i++) {
    const g = deck.groups[(at + i) % deck.groups.length];
    if (g.key !== scope && g.items.some((e) => !state.done[e.id])) return g;
  }
  return null;
}

/** Пример с выделенной фразой: [до, фраза, после] или null, если фразы в примере нет. */
export function splitExample(entry) {
  const ex = entry.ex || "";
  const i = ex.toLowerCase().replace(/[’‘`´]/g, "'").indexOf(phraseKey(entry.w));
  return i < 0 ? null : [ex.slice(0, i), ex.slice(i, i + entry.w.length), ex.slice(i + entry.w.length)];
}
