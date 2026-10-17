// coverage.js — охват слов: какую долю слов книги (или главы) вы знаете и сколько слов не хватает, чтобы читать без словаря.
// Считается на устройстве по разбору книги (js/analysis.js: freq, base, outside) и по вашему словарю. Чистые функции (tests/coverage.test.mjs).
//
// «Знаете» слово, если оно: служебное (the, of, in: их не проверяет «Пополнить словарь», они считаются известными), помечено «Знаю»
// в окне «Слова этой книги», в словаре и дошло до уровня «Знаю» (6) или выше, либо это имя, которое вы убрали из повторения.
// Слово из словаря с более низким уровнем «учится»: в охват знаний оно пока не входит. Имена собственные в охват не считаются совсем.
// Слова, которых нет в словаре приложения, остаются неизвестными: их доля называется «нет в словаре».
import { KNOWN } from "./levels.js";
import { FUNCTION_WORDS } from "./freqdeck.js";

/** Какой охват нужен, чтобы читать книгу почти без словаря. */
export const TARGET = 0.95;

/** Состояние слова для читателя: «known», «learning» (в словаре, но ещё не «Знаю») или «unknown». */
export function wordState(entry, { cards, known } = {}) {
  if (!entry) return "unknown";
  if (entry.t === "w" && FUNCTION_WORDS.has(entry.w)) return "known";
  if (known?.has(entry.id)) return "known";
  const card = cards?.get(entry.id);
  if (!card) return "unknown";
  if (card.skip || (card.srs?.lv || 0) >= KNOWN) return "known";
  return "learning";
}

/**
 * Охват книги по её разбору. stats — book.stats (нужны freq, base, outside), glossary — словарь с byId, cards — карточки (Map),
 * known — Set слов с отметкой «Знаю». Возвращает null, если разбор старый (без freq) или в книге нет слов.
 *   share, learningShare, outsideShare — доли слов текста (без имён): знаете / учите / нет в словаре;
 *   need — сколько слов (самых частых из ещё не известных) нужно выучить до target, needInDict — из них уже лежат в словаре;
 *   need === null, если до target не дотянуть (слишком много слов, которых нет в словаре); need === 0, если уже достигнут;
 *   rest — слова, которых вы ещё не знаете, самые частые первыми: [{ entry, n, learning }]; occ — Map «id слова → сколько раз в тексте».
 */
export function bookCoverage({ stats, glossary, cards, known, target = TARGET } = {}) {
  const base = stats?.base;
  if (!Array.isArray(stats?.freq) || !(base > 0) || !glossary?.byId) return null;
  let have = 0;
  let learning = 0;
  let outside = stats.outside || 0;
  const rest = [];
  const occ = new Map();
  for (const [id, n] of stats.freq) {
    const entry = glossary.byId.get(id);
    if (!entry) {
      outside += n; // слова, которых в словаре уже нет (словарь сменился)
      continue;
    }
    occ.set(id, n);
    const state = wordState(entry, { cards, known });
    if (state === "known") have += n;
    else {
      if (state === "learning") learning += n;
      rest.push({ entry, n, learning: state === "learning" });
    }
  }
  const goal = Math.ceil(base * target);
  let need = 0;
  let needInDict = 0;
  if (have < goal) {
    const reach = have + rest.reduce((s, r) => s + r.n, 0);
    if (reach < goal) need = null;
    else {
      let sum = have;
      for (const r of rest) {
        sum += r.n;
        need += 1;
        if (r.learning) needInDict += 1;
        if (sum >= goal) break;
      }
    }
  }
  return { base, share: have / base, learningShare: learning / base, outsideShare: outside / base, need, needInDict, rest, occ };
}

/** Прирост охвата от выученных слов ids: доля слов текста, которые они закрывают. cov — результат bookCoverage. */
export function gainOf(cov, ids) {
  if (!cov) return 0;
  let n = 0;
  for (const id of new Set(ids)) n += cov.occ.get(id) || 0;
  return n / cov.base;
}

/**
 * Охват главы. ids — слова главы по порядку (id записи словаря или "" для слова без записи), без имён. Возвращает { total, share }.
 */
export function chapterCoverage(ids, glossary, { cards, known } = {}) {
  let have = 0;
  for (const id of ids) if (id && wordState(glossary?.byId.get(id), { cards, known }) === "known") have += 1;
  return { total: ids.length, share: ids.length ? have / ids.length : 0 };
}

// ── Подписи ─────────────────────────────────────────────────────────────────
/** Доля целым числом процентов; округление вниз, чтобы 94,7% не выглядело как достигнутые 95%. */
export const pct = (share) => `${Math.min(100, Math.floor(share * 100 + 1e-9))}%`;

/** Прирост: «+0,3%», меньше десятой доли — «меньше 0,1%». */
export function gainText(share) {
  const v = share * 100;
  if (v <= 0) return "";
  if (v < 0.05) return "меньше 0,1%";
  return `+${v.toFixed(1).replace(".", ",")}%`;
}

const plural = (n, f) => {
  const a = n % 10;
  const b = n % 100;
  return f[b > 10 && b < 20 ? 2 : a === 1 ? 0 : a >= 2 && a <= 4 ? 1 : 2];
};
const fmt = (n) => n.toLocaleString("ru-RU").replace(/ /g, " ");

/** Сколько слов не хватает до цели одной строкой: «1 240 слов (86 уже в словаре)», «достигнуто» или «недостижимо». */
export function needText(cov, target = TARGET) {
  if (!cov) return "";
  if (cov.need === 0) return "достигнуто";
  if (cov.need === null) return `недостижимо: в словаре нет ${pct(cov.outsideShare)} слов книги`;
  const inDict = cov.needInDict ? ` (${cov.needInDict} уже в словаре)` : "";
  return `${fmt(cov.need)} ${plural(cov.need, ["слово", "слова", "слов"])}${inDict}`;
}
