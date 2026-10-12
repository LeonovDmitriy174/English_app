// hints.js — подсказки для режимов «Написание» и «Слух». Чистые функции, проверяются в Node (tests/hints.test.mjs).
import { tokenize, lemmaCandidates } from "./lex.js";

const LETTER = /\p{L}/u;

/** Сколько букв в слове или фразе. */
export const letterCount = (word) => [...word].filter((c) => LETTER.test(c)).length;

/** Сколько ступеней подсказки есть у слова: открываем не больше половины букв (но минимум одну). */
export const maxHints = (word) => Math.max(1, Math.floor(letterCount(word) / 2));

/**
 * Подсказка ступени n: открыты первые n букв, остальные скрыты, пробелы и знаки на месте.
 * «give up», 1 → «g _ _ _   _ _»; «grow», 2 → «g r _ _».
 */
export function hintMask(word, n) {
  let seen = 0;
  const parts = [...word].map((c) => {
    if (c === " ") return " ";
    if (!LETTER.test(c)) return c;
    return seen++ < n ? c : "_";
  });
  return parts.join(" ").replace(/ {2,}/g, "   ");
}

/** Короткие слова-частицы в фразах не закрываем: «___ up» подсказывает смысл, не выдавая слова целиком. */
const PARTICLES = new Set(["up", "down", "in", "out", "on", "off", "over", "away", "back", "at", "to", "with", "for", "about", "into", "through", "around", "of", "the", "a", "an", "one", "someone", "something", "your", "my", "his", "her", "their", "its", "our"]);

/**
 * Закрывает слово (во всех формах) в тексте, например в английском определении: «to grow bigger» → «to ___ bigger».
 * Находит формы через те же правила, что и словарь (grew, grown, growing → grow). Возвращает { text, masked }.
 */
export function maskWord(text, word, blank = "___") {
  const parts = word
    .toLowerCase()
    .split(/\s+/)
    .filter((p) => p && (p.length > 3 || !PARTICLES.has(p)) && !(PARTICLES.has(p) && word.includes(" ")));
  if (!parts.length) return { text, masked: 0 };
  const keys = new Set(parts);
  const toks = tokenize(text);
  let out = "";
  let at = 0;
  let masked = 0;
  for (const t of toks) {
    const hit = keys.has(t.surf) || lemmaCandidates(t.raw).some((c) => keys.has(c));
    if (!hit) continue;
    out += text.slice(at, t.start) + blank;
    at = t.end;
    masked += 1;
  }
  return { text: out + text.slice(at), masked };
}
