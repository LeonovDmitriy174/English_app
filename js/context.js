// context.js — предложения для задания «Слово в предложении». Чистые функции проверяются в Node (tests/context.test.mjs).
//
// Откуда берутся предложения для пропуска:
//   1. те, что вы сохранили при чтении (card.ctx);
//   2. найденные в ваших книгах (card.found): приложение просматривает загруженные книги и запоминает до
//      нескольких других предложений с этим словом или фразой, чтобы не заучивать одно и то же предложение;
//   3. пример из словаря (card.ex), если слово в нём есть.
// Каждый раз берётся не то предложение, что было в прошлый раз.
import { tokenize, findPhrases, lemmaCandidates, sentencesOf } from "./lex.js";
import { chapterBlocks, prettyTitle } from "./epub.js";

const wc = (s) => (s.trim() ? s.trim().split(/\s+/).length : 0);
const yieldNow = () => new Promise((r) => setTimeout(r, 0));

/** Сколько предложений в запасе у карточки считается достаточным: больше искать не нужно. */
export const ENOUGH = 6;
/** Сколько найденных в книгах предложений хранится у карточки. */
export const MAX_FOUND = 5;
const MIN_WORDS = 5; // короче предложение не даёт контекста для пропуска
const MAX_WORDS = 30; // длиннее тяжело читать на телефоне

/** Предложение годится для пропуска: слово на месте и в пропуске столько же слов, сколько в слове карточки. */
export function usable(ctx, card) {
  if (!ctx || typeof ctx.s !== "string" || !(ctx.b > ctx.a) || ctx.b > ctx.s.length) return false;
  return wc(ctx.s.slice(ctx.a, ctx.b)) === wc(card.w);
}

/** Слово или фраза карточки в предложении: { a, b } или null. */
export function findSpan(sentence, card, glossary) {
  const toks = tokenize(sentence);
  if (card.t === "w") {
    const t = toks.find((tok) => {
      const e = glossary.lookupWord(tok.raw);
      return e ? e.id === card.id || tok.surf === card.w : tok.surf === card.w || lemmaCandidates(tok.raw).includes(card.w);
    });
    return t ? { a: t.start, b: t.end } : null;
  }
  const m = findPhrases(glossary, toks, sentence).find((x) => x.entry.id === card.id);
  return m ? { a: toks[m.idxs[0]].start, b: toks[m.idxs[m.idxs.length - 1]].end } : null;
}

/** Пример из словаря как предложение для пропуска (или null, если слова в примере нет). */
export function exampleContext(card, glossary) {
  const ex = typeof card.ex === "string" ? card.ex.trim() : "";
  if (!ex) return null;
  let span = null;
  if (glossary) span = findSpan(ex, card, glossary);
  if (!span && !/\s/.test(card.w) && card.t === "w") {
    const t = tokenize(ex).find((tok) => tok.surf === card.w || lemmaCandidates(tok.raw).includes(card.w));
    if (t) span = { a: t.start, b: t.end };
  }
  if (!span) {
    const i = ex.toLowerCase().indexOf(card.w.toLowerCase());
    const edge = (k) => !k || !/\p{L}/u.test(k);
    if (i >= 0 && edge(ex[i - 1]) && edge(ex[i + card.w.length])) span = { a: i, b: i + card.w.length };
  }
  return span ? { s: ex, a: span.a, b: span.b, book: "", ch: "", example: true } : null;
}

/** В предложении слово стоит в той же форме, что и в карточке («grow», а не «grew»). */
export const exactForm = (ctx, card) => ctx.s.slice(ctx.a, ctx.b).toLowerCase() === card.w.toLowerCase();

/**
 * Все предложения, из которых можно сделать пропуск для карточки. Слишком короткие берутся, только если других нет.
 * exact: только предложения, где слово в начальной форме (для выбора из вариантов: варианты показываются в начальной форме).
 */
export function contextPool(card, glossary, { exact = false } = {}) {
  const seen = new Set();
  const all = [];
  for (const c of [...(card.ctx || []), ...(card.found || []), exampleContext(card, glossary)]) {
    if (!c || seen.has(c.s) || !usable(c, card) || (exact && !exactForm(c, card))) continue;
    seen.add(c.s);
    all.push(c);
  }
  const good = all.filter((c) => wc(c.s) >= 4);
  return good.length ? good : all;
}

/** Предложение для пропуска: случайное, но не то, что было в прошлый раз (last — его текст). */
export function pickContext(card, { glossary, last = null, rnd = Math.random, exact = false } = {}) {
  const pool = contextPool(card, glossary, { exact });
  if (!pool.length) return null;
  const fresh = pool.length > 1 ? pool.filter((c) => c.s !== last) : pool;
  return fresh[Math.floor(rnd() * fresh.length) % fresh.length];
}

// ── Поиск других предложений в книгах ─────────────────────────────────────

/**
 * Просматривает текст и собирает предложения со словами и фразами нужных карточек.
 * wanted: Map id → { card, known: Set<предложения, которые у карточки уже есть> };
 * bucket: Map id → { seen, picks } — копится между вызовами (случайная выборка по k предложений на карточку).
 */
export function collectFromText(text, info, wanted, glossary, bucket, { rnd = Math.random, k = 3, phrases = true } = {}) {
  // слова, которых нет в словаре (ваши собственные карточки), ищем по самому слову
  const own = [...wanted].filter(([id, w]) => w.card.t === "w" && !glossary.byId.has(id));
  for (const s of sentencesOf(text)) {
    const n = wc(s);
    if (n < MIN_WORDS || n > MAX_WORDS) continue;
    const toks = tokenize(s);
    const ids = new Set();
    for (const t of toks) {
      const e = glossary.lookupWord(t.raw);
      if (e && wanted.has(e.id)) ids.add(e.id);
    }
    for (const [id, w] of own) {
      if (toks.some((t) => t.surf === w.card.w || lemmaCandidates(t.raw).includes(w.card.w))) ids.add(id);
    }
    if (phrases) for (const m of findPhrases(glossary, toks, s)) if (wanted.has(m.entry.id)) ids.add(m.entry.id);
    for (const id of ids) {
      const { card, known } = wanted.get(id);
      if (known.has(s)) continue;
      const span = findSpan(s, card, glossary);
      if (!span) continue;
      const ctx = { s, a: span.a, b: span.b, ...info };
      if (!usable(ctx, card)) continue;
      const b = bucket.get(id) || { seen: 0, picks: [] };
      bucket.set(id, b);
      b.seen += 1;
      if (b.picks.length < k) b.picks.push(ctx);
      else {
        const j = Math.floor(rnd() * b.seen); // равномерная выборка: каждое найденное предложение имеет равный шанс остаться
        if (j < k) b.picks[j] = ctx;
      }
    }
  }
}

/** Просматривает книгу целиком. Возвращает Map id → найденные предложения. Работает в фоне, уступая экрану. */
export async function scanBook({ book, zip, wanted, glossary, rnd = Math.random, k = 3 }) {
  const bucket = new Map();
  const phrases = [...wanted.values()].some((w) => w.card.t !== "w");
  for (let c = 0; c < book.chapters.length; c++) {
    let html;
    try {
      html = await zip.text(book.chapters[c].href);
    } catch {
      continue;
    }
    const info = { book: book.title, bookId: book.id, ch: prettyTitle(book.chapters[c].title) };
    let n = 0;
    for (const { kind, el } of chapterBlocks(html)) {
      if (kind === "h") continue;
      collectFromText(el.textContent, info, wanted, glossary, bucket, { rnd, k, phrases });
      if (++n % 40 === 0) await yieldNow();
    }
    await yieldNow();
  }
  return new Map([...bucket].map(([id, b]) => [id, b.picks]));
}

/** Соединяет найденные предложения с уже имеющимися: не больше MAX_FOUND, свежие вытесняют самые старые. */
export const mergeFound = (found = [], picks = []) => {
  const seen = new Set(found.map((c) => c.s));
  return [...found, ...picks.filter((c) => !seen.has(c.s))].slice(-MAX_FOUND);
};
