// analysis.js — автоматический разбор книги: сколько слов знает словарь, какие фразы встречаются,
// какие слова не нашлись и какие из них, скорее всего, имена. Работает на устройстве, без интернета.
//
// Запускается сам: при добавлении книги и при смене словаря (по подписи словаря).
import { tokenize, findPhrases } from "./lex.js";
import { chapterBlocks } from "./epub.js";

const yieldNow = () => new Promise((r) => setTimeout(r, 0));
const OPENERS = /[\s"“”„«»'‘’()[\]—–-]/;
const SENTENCE_END = /[.!?…:]/;
/** Сколько самых частых слов и фраз книги запоминается в разборе. */
export const TOP_ENTRIES = 500;

/** Версия разбора: растёт, когда в разбор добавляется что-то новое. Книги, разобранные раньше, разбираются заново. */
export const ANALYSIS_VERSION = 2;

/** Подпись разбора: словарь и версия разбора. Когда она меняется, книги разбираются заново. */
export const statsSignature = (glossary) => `v${ANALYSIS_VERSION}.${dictSignature(glossary)}`;

/** Подпись словаря: меняется, когда в словаре изменились слова. */
export function dictSignature(glossary) {
  const list = glossary.list;
  let acc = 0;
  for (let i = 0; i < list.length; i += 37) {
    const w = list[i].id;
    for (let k = 0; k < w.length; k++) acc = (Math.imul(acc, 31) + w.charCodeAt(k)) | 0;
  }
  return `${list.length}:${(acc >>> 0).toString(36)}`;
}

/** Слово стоит не в начале предложения (значит, заглавная буква у него не от грамматики). */
export function isMidSentence(text, start) {
  let i = start - 1;
  while (i >= 0 && OPENERS.test(text[i])) i--;
  if (i < 0) return false;
  return !SENTENCE_END.test(text[i]);
}

const isCapitalized = (raw) => raw[0] !== raw[0].toLowerCase() && raw.slice(1) === raw.slice(1).toLowerCase();
const isLower = (raw) => raw === raw.toLowerCase();

/** Накопитель для разбора: слова с их счётчиками, фразы и общее число слов. */
export const newCounter = () => ({ surf: new Map(), phrases: { pv: new Map(), id: new Map(), w: new Map() }, tokens: 0, covered: 0 });

/** Добавляет в накопитель один абзац текста. */
export function addText(acc, text, glossary) {
  const toks = tokenize(text);
  const inPhrase = new Set();
  for (const m of findPhrases(glossary, toks, text)) {
    m.idxs.forEach((i) => inPhrase.add(i));
    const bucket = acc.phrases[m.entry.t] || acc.phrases.w;
    bucket.set(m.entry.id, (bucket.get(m.entry.id) || 0) + 1);
  }
  toks.forEach((t, i) => {
    acc.tokens += 1;
    const inside = inPhrase.has(i);
    const entry = inside ? null : glossary.lookupWord(t.raw);
    const known = inside || !!entry;
    if (known) acc.covered += 1;
    let rec = acc.surf.get(t.surf);
    if (!rec) acc.surf.set(t.surf, (rec = { n: 0, cov: 0, caps: 0, low: 0, free: 0, id: "" }));
    rec.n += 1;
    if (entry) {
      rec.free += 1; // слово само по себе, не часть фразы
      rec.id = entry.id;
    }
    if (known) rec.cov += 1;
    if (isLower(t.raw)) rec.low += 1;
    else if (isCapitalized(t.raw) && isMidSentence(text, t.start)) rec.caps += 1;
  });
}

/** Итог разбора из накопителя: то, что хранится вместе с книгой. */
export function summarize(acc, glossary) {
  const { surf, phrases, tokens, covered } = acc;
  // Имя собственное: слово встречается с заглавной буквы внутри предложения и ни разу строчными
  const names = [];
  let nameTokens = 0;
  let nameCovered = 0;
  const unknown = [];
  const counts = new Map(); // запись словаря -> сколько раз встретилась (слова без имён, фразы отдельно)
  let uniqueUnknown = 0;
  for (const [w, r] of surf) {
    if (r.caps > 0 && r.low === 0) {
      names.push(w);
      nameTokens += r.n;
      nameCovered += r.cov;
    } else {
      if (r.cov === 0) {
        uniqueUnknown += 1;
        unknown.push([w, r.n]);
      }
      if (r.id && r.free) counts.set(r.id, (counts.get(r.id) || 0) + r.free);
    }
  }
  for (const bucket of Object.values(phrases)) for (const [id, n] of bucket) counts.set(id, (counts.get(id) || 0) + n);
  // самые частые слова и фразы книги: по ним собирается список «Слова этой книги» (js/bookwords.js)
  const top = [...counts]
    .filter(([, n]) => n >= 2)
    .sort((a, b) => b[1] - a[1] || (a[0] < b[0] ? -1 : 1))
    .slice(0, TOP_ENTRIES);
  unknown.sort((a, b) => b[1] - a[1] || (a[0] < b[0] ? -1 : 1));

  const base = tokens - nameTokens;
  const sum = (m) => [...m.values()].reduce((a, b) => a + b, 0);
  return {
    sig: statsSignature(glossary),
    at: Date.now(),
    tokens,
    unique: surf.size - names.length,
    coverage: base > 0 ? (covered - nameCovered) / base : 0,
    uniqueUnknown,
    unknown: unknown.slice(0, 400),
    top,
    names: names.slice(0, 3000),
    phrases: {
      pv: { unique: phrases.pv.size, total: sum(phrases.pv) },
      id: { unique: phrases.id.size, total: sum(phrases.id) },
    },
  };
}

/**
 * Разбирает все главы книги. Возвращает статистику для хранения вместе с книгой.
 * onProgress(доля 0..1) вызывается после каждой главы.
 */
export async function analyzeBook(book, zip, glossary, onProgress) {
  const acc = newCounter();
  for (let c = 0; c < book.chapters.length; c++) {
    let html;
    try {
      html = await zip.text(book.chapters[c].href);
    } catch {
      continue;
    }
    let blocks = 0;
    for (const { el } of chapterBlocks(html)) {
      addText(acc, el.textContent, glossary);
      if (++blocks % 60 === 0) await yieldNow();
    }
    onProgress?.((c + 1) / book.chapters.length);
    await yieldNow();
  }
  return summarize(acc, glossary);
}
