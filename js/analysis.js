// analysis.js — автоматический разбор книги: сколько слов знает словарь, какие фразы встречаются,
// какие слова не нашлись и какие из них, скорее всего, имена. Работает на устройстве, без интернета.
//
// Запускается сам: при добавлении книги и при смене словаря (по подписи словаря).
import { tokenize, findPhrases } from "./lex.js";
import { chapterBlocks } from "./epub.js";

const yieldNow = () => new Promise((r) => setTimeout(r, 0));
const OPENERS = /[\s"“”„«»'‘’()[\]—–-]/;
const SENTENCE_END = /[.!?…:]/;

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

/**
 * Разбирает все главы книги. Возвращает статистику для хранения вместе с книгой.
 * onProgress(доля 0..1) вызывается после каждой главы.
 */
export async function analyzeBook(book, zip, glossary, onProgress) {
  const surf = new Map(); // слово (нижний регистр) -> { n, cov, caps, low }
  const phrases = { pv: new Map(), id: new Map(), w: new Map() };
  let tokens = 0;
  let covered = 0;

  for (let c = 0; c < book.chapters.length; c++) {
    let html;
    try {
      html = await zip.text(book.chapters[c].href);
    } catch {
      continue;
    }
    let blocks = 0;
    for (const { el } of chapterBlocks(html)) {
      const text = el.textContent;
      const toks = tokenize(text);
      const inPhrase = new Set();
      for (const m of findPhrases(glossary, toks, text)) {
        m.idxs.forEach((i) => inPhrase.add(i));
        const bucket = phrases[m.entry.t] || phrases.w;
        bucket.set(m.entry.id, (bucket.get(m.entry.id) || 0) + 1);
      }
      toks.forEach((t, i) => {
        tokens += 1;
        const known = inPhrase.has(i) || !!glossary.lookupWord(t.raw);
        if (known) covered += 1;
        let rec = surf.get(t.surf);
        if (!rec) surf.set(t.surf, (rec = { n: 0, cov: 0, caps: 0, low: 0 }));
        rec.n += 1;
        if (known) rec.cov += 1;
        if (isLower(t.raw)) rec.low += 1;
        else if (isCapitalized(t.raw) && isMidSentence(text, t.start)) rec.caps += 1;
      });
      if (++blocks % 60 === 0) await yieldNow();
    }
    onProgress?.((c + 1) / book.chapters.length);
    await yieldNow();
  }

  // Имя собственное: слово встречается с заглавной буквы внутри предложения и ни разу строчными
  const names = [];
  let nameTokens = 0;
  let nameCovered = 0;
  const unknown = [];
  let uniqueUnknown = 0;
  for (const [w, r] of surf) {
    if (r.caps > 0 && r.low === 0) {
      names.push(w);
      nameTokens += r.n;
      nameCovered += r.cov;
    } else if (r.cov === 0) {
      uniqueUnknown += 1;
      unknown.push([w, r.n]);
    }
  }
  unknown.sort((a, b) => b[1] - a[1] || (a[0] < b[0] ? -1 : 1));

  const base = tokens - nameTokens;
  const sum = (m) => [...m.values()].reduce((a, b) => a + b, 0);
  return {
    sig: dictSignature(glossary),
    at: Date.now(),
    tokens,
    unique: surf.size - names.length,
    coverage: base > 0 ? (covered - nameCovered) / base : 0,
    uniqueUnknown,
    unknown: unknown.slice(0, 400),
    names: names.slice(0, 3000),
    phrases: {
      pv: { unique: phrases.pv.size, total: sum(phrases.pv) },
      id: { unique: phrases.id.size, total: sum(phrases.id) },
    },
  };
}
