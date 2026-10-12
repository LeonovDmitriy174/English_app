// dictsearch.js — поиск слов в общем словаре для окна «Добавить слово».
// По-английски: слово целиком, его формы («went» найдёт go), начало слова, слово внутри фразы, опечатки.
// По-русски: по переводам («бежал» найдёт run, flee и другие). Какой язык, видно по буквам запроса.
// Чистые функции без DOM: проверяются в Node (tests/dictsearch.test.mjs).
import { lemmaCandidates, tokenize, findPhrases } from "./lex.js";
import { ruStem } from "./rustem.js";

export const MAX_RESULTS = 80;

/** 'ru' | 'en' | null по буквам запроса (если есть кириллица, считаем русским). */
export function langOf(text) {
  const s = String(text || "");
  if (/\p{Script=Cyrillic}/u.test(s)) return "ru";
  if (/\p{Script=Latin}/u.test(s)) return "en";
  return null;
}

const ARTICLES = /^(?:to|a|an|the)\s+(?=\S)/;

/**
 * Приводит запрос к виду для поиска. full — запрос целиком, core — без начального «to», «a», «an», «the»
 * («to give up» ищется и как «to give up» целиком, и как «give up»).
 */
export function cleanQuery(text, lang = langOf(text)) {
  let s = String(text || "").toLowerCase().replace(/[’‘`]/g, "'");
  if (lang === "ru") s = s.replace(/ё/g, "е").replace(/[^\p{L}\s-]/gu, " ");
  else s = s.replace(/[^\p{L}\s'-]/gu, " ");
  s = s.replace(/(^|\s)[-']+|[-']+(?=\s|$)/g, "$1").replace(/\s+/g, " ").trim();
  const core = lang === "en" ? s.replace(ARTICLES, "") : s;
  return { full: s, core, words: core ? core.split(" ") : [] };
}

// ── Опечатки ──────────────────────────────────────────────────────────────
/** Расстояние до k правок (вставка, удаление, замена, перестановка соседних букв) или Infinity, если оно больше k. */
export function editDistance(a, b, k) {
  const m = a.length;
  const n = b.length;
  if (Math.abs(m - n) > k) return Infinity;
  let prev2 = null;
  let prev = Array.from({ length: n + 1 }, (_, j) => j);
  for (let i = 1; i <= m; i++) {
    const cur = [i];
    let low = i;
    for (let j = 1; j <= n; j++) {
      let v = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
      if (prev2 && i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1]) v = Math.min(v, prev2[j - 2] + 1);
      cur[j] = v;
      if (v < low) low = v;
    }
    if (low > k) return Infinity;
    prev2 = prev;
    prev = cur;
  }
  return prev[n] <= k ? prev[n] : Infinity;
}

// ── Индекс словаря ────────────────────────────────────────────────────────
const indexes = new WeakMap();

function indexFor(glossary) {
  let ix = indexes.get(glossary);
  if (ix) return ix;
  ix = { byHead: new Map(), singles: [], phrases: [], ru: null };
  for (const e of glossary.list) {
    if (!ix.byHead.has(e.w)) ix.byHead.set(e.w, []);
    ix.byHead.get(e.w).push(e);
    (e.w.includes(" ") ? ix.phrases : ix.singles).push(e);
  }
  indexes.set(glossary, ix);
  return ix;
}

/** Русские переводы записи по смыслам: «бегать; бежать (быстро)» → ["бегать", "бежать"]. */
export function ruVariants(text) {
  return String(text || "")
    .toLowerCase()
    .replace(/ё/g, "е")
    .replace(/\([^)]*\)/g, " ")
    .split(/[;,]/)
    .map((v) => v.replace(/[^\p{L}\s-]/gu, " ").replace(/\s+/g, " ").trim())
    .filter(Boolean);
}

/** Достраивает русский индекс (переводы по смыслам для каждой записи). until: до какого момента (performance.now) можно работать. */
function buildRu(ix, glossary, until = Infinity) {
  const r = (ix.ru ??= { rows: [], pos: 0, done: false });
  const list = glossary.list;
  while (r.pos < list.length) {
    const e = list[r.pos++];
    const own = e.ru || "";
    const vars = ruVariants(own || e.rm);
    if (vars.length) r.rows.push({ e, vars, auto: !own, join: vars.join("|") });
    if ((r.pos & 255) === 0 && performance.now() > until) return false;
  }
  r.done = true;
  return true;
}

function ruRows(ix, glossary) {
  if (!ix.ru?.done) buildRu(ix, glossary);
  return ix.ru.rows;
}

/**
 * Готовит русский индекс заранее, небольшими порциями, чтобы окно не замирало (на словаре из десятков тысяч записей это пара
 * сотен миллисекунд). Если русский запрос придёт раньше, индекс достроится сразу.
 */
export async function prepareSearch(glossary, sliceMs = 8) {
  if (!glossary?.list?.length) return;
  const ix = indexFor(glossary);
  while (!buildRu(ix, glossary, performance.now() + sliceMs)) await new Promise((r) => setTimeout(r, 0));
}

// ── Оценки ────────────────────────────────────────────────────────────────
const zOf = (e) => (Number.isFinite(e.z) ? e.z : 0);
/** Мелкая добавка к оценке: частые слова выше, слова выше фраз, короткие выше длинных. Не перекрывает разницу между уровнями. */
const tie = (e) => zOf(e) * 3 + (e.t === "w" ? 4 : 0) - Math.min(e.w.length, 24) * 0.25;

class Hits {
  constructor() {
    this.map = new Map();
  }
  add(entry, kind, score, via = "") {
    const old = this.map.get(entry.id);
    if (!old || score > old.score) this.map.set(entry.id, { entry, kind, via, score });
  }
  sorted() {
    return [...this.map.values()].sort((a, b) => b.score - a.score || a.entry.w.length - b.entry.w.length || (a.entry.w < b.entry.w ? -1 : 1));
  }
}

// ── Поиск по-английски ────────────────────────────────────────────────────
function searchEnglish(glossary, q) {
  const ix = indexFor(glossary);
  const hits = new Hits();
  const { full, core, words } = q;
  if (!core) return [];
  const forms = (word, base) => {
    // само слово как форма другого: «went», «children», «running»
    const direct = glossary.words.get(word);
    const seen = new Set();
    const put = (e, score) => {
      if (!e || e.w === word || seen.has(e.id)) return;
      seen.add(e.id);
      hits.add(e, "form", score + tie(e) / 100, word);
    };
    put(direct, base);
    lemmaCandidates(word).forEach((c, i) => put(glossary.words.get(c), base - 5 - i));
    // слово бывает и формой другого («left» от leave)
    for (const e of ix.byHead.get(word) || []) for (const l of e.of || []) (ix.byHead.get(l) || []).forEach((x) => put(x, base - 20));
  };

  // 1. слово или фраза целиком
  for (const e of ix.byHead.get(full) || []) hits.add(e, "exact", 1000 + tie(e));
  if (core !== full) for (const e of ix.byHead.get(core) || []) hits.add(e, "exact", 990 + tie(e));

  // 2. формы слова и фразы, найденные в тексте запроса
  if (words.length === 1) forms(core, 900);
  else {
    const toks = tokenize(core);
    for (const m of findPhrases(glossary, toks, core)) hits.add(m.entry, "form", 900 + tie(m.entry) / 100, core);
  }

  // 3. начало слова, слово внутри фразы
  if (core.length >= 2) {
    const inside = " " + core;
    for (const e of glossary.list) {
      if (e.w === core) continue;
      if (e.w.startsWith(core)) hits.add(e, "prefix", 600 + tie(e));
      else if (e.w.includes(inside)) hits.add(e, "phrase", 400 + tie(e));
    }
    // несколько слов запроса в любом порядке: «break leg» → break a leg
    if (words.length > 1) {
      for (const e of ix.phrases) {
        const parts = e.w.split(" ");
        if (words.every((x) => parts.some((p) => p.startsWith(x)))) hits.add(e, "phrase", 300 + tie(e));
      }
    }
    // часть слова («ight» → light): только когда начал слов не хватило
    if (core.length >= 3 && hits.map.size < 8) {
      for (const e of glossary.list) if (e.w.includes(core)) hits.add(e, "part", 150 + tie(e));
    }
  }

  // 4. опечатки: только когда настоящих совпадений мало
  const good = [...hits.map.values()].filter((x) => x.score >= 400).length;
  if (words.length === 1 && core.length >= 4 && good < 3) {
    const k = core.length >= 8 ? 2 : 1;
    for (const e of ix.singles) {
      const d = editDistance(core, e.w, k);
      if (d !== Infinity && d > 0 && !hits.map.has(e.id)) hits.add(e, "near", 100 - d * 20 + tie(e));
    }
  }
  return hits.sorted();
}

// ── Поиск по-русски ───────────────────────────────────────────────────────
/**
 * Основа для поиска по началу слова. Совсем короткие основы («уч» от «учился») ненадёжны, тогда берём начало слова целиком.
 * exact: слова из одной-двух букв ищутся только целиком.
 */
export function ruQueryStem(word) {
  const s = ruStem(word);
  if (word.length <= 2) return { stem: word, exact: true };
  if (s.length >= 3) return { stem: s, exact: false };
  return { stem: word.slice(0, Math.max(3, word.length - 3)), exact: false };
}

/** Насколько вариант перевода подходит под запрос: 0 — совсем нет, 100 — совпал целиком. */
function matchVariant(v, q, qs) {
  if (v === q.core) return 100;
  const vw = v.split(" ");
  const last = q.words.length - 1;
  if (q.words.length === 1) {
    for (const w of vw) {
      if (!w.startsWith(qs.stem)) continue;
      const extra = w.length - qs.stem.length;
      if (qs.exact && extra > 0) continue;
      if (vw.length === 1) return extra <= 3 ? 90 : 55;
      return extra <= 3 ? 65 : 35;
    }
    return 0;
  }
  // несколько слов: подряд и по порядку (последнее слово можно по основе), либо все слова без порядка
  const head = q.words.slice(0, last).join(" ");
  const padded = " " + v;
  if (padded.includes(" " + head + " " + qs.stem)) return 75;
  if (q.words.every((w, i) => vw.some((x) => x.startsWith(i === last ? qs.stem : w)))) return 45;
  return 0;
}

function searchRussian(glossary, q) {
  if (!q.core) return [];
  const rows = ruRows(indexFor(glossary), glossary);
  const hits = new Hits();
  const qs = ruQueryStem(q.words[q.words.length - 1]);
  // самое длинное слово запроса быстро отсеивает записи: если его начала нет в переводах, остальное не проверяем
  const lastWord = q.words[q.words.length - 1];
  const longestWord = q.words.reduce((a, b) => (b.length > a.length ? b : a));
  const probe = longestWord === lastWord ? qs.stem : longestWord;
  for (const r of rows) {
    if (!r.join.includes(probe)) continue;
    let best = 0;
    for (let i = 0; i < r.vars.length; i++) {
      const s = matchVariant(r.vars[i], q, qs);
      if (s) best = Math.max(best, s + (i === 0 ? 2 : 0));
    }
    if (!best) continue;
    // автоперевод определения (rm) менее надёжен, чем словарный перевод
    hits.add(r.e, best >= 90 ? "ru" : "ru-part", best - (r.auto ? 30 : 0) - Math.min(r.vars.length, 12) * 0.4 + tie(r.e) * 0.6);
  }
  return hits.sorted();
}

/**
 * Ищет в словаре. Возвращает { lang, query, items, total }.
 * items: [{ entry, kind, via, score }], лучшие первыми. kind: exact | form | prefix | phrase | part | near | ru | ru-part.
 * via: слово из запроса, если запись найдена как его форма.
 */
export function searchDictionary(glossary, text, { limit = MAX_RESULTS } = {}) {
  const lang = langOf(text);
  if (!lang || !glossary?.list?.length) return { lang, query: "", items: [], total: 0 };
  const q = cleanQuery(text, lang);
  if (!q.core) return { lang, query: "", items: [], total: 0 };
  const all = lang === "ru" ? searchRussian(glossary, q) : searchEnglish(glossary, q);
  return { lang, query: q.core, items: all.slice(0, limit), total: all.length };
}

// ── Своё слово ────────────────────────────────────────────────────────────
/** Своё английское слово: одно слово из латинских букв (можно с ' и -). Возвращает слово или null. */
export function ownWord(text) {
  const w = String(text || "").trim().replace(/[’‘`]/g, "'");
  return /^[A-Za-z]+(?:['-][A-Za-z]+)*$/.test(w) ? w : null;
}

/**
 * Запись для своего слова. Заглавная буква сохраняется (это имя), в остальном слово приводится к нижнему регистру.
 * Идентификатор всегда строчный, как у слов из словаря.
 */
export function ownEntry(word, ru) {
  const w = ownWord(word);
  if (!w) return null;
  const tr = String(ru || "").replace(/\s+/g, " ").trim().slice(0, 200);
  if (!tr) return null;
  const shown = w[0] !== w[0].toLowerCase() ? w : w.toLowerCase();
  return { id: `w:${w.toLowerCase()}`, t: "w", w: shown, pos: "", ru: tr, en: "", ex: "", custom: true };
}
