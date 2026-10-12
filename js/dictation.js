// dictation.js — «Диктант»: звучит предложение из книги, вы его записываете, приложение разбирает ответ по словам.
// Чистые функции без DOM, проверяются в Node (tests/dictation.test.mjs).
//
// Оценка не должна наказывать за каждую мелочь: диктант трудный, а слово карточки в нём лишь одно из многих.
//   ok    слово карточки написано точно и верно не меньше 80% слов предложения;
//   near  слово карточки с опечаткой или верно не меньше половины слов (уровень не меняется);
//   no    слово не вспомнили и половина предложения мимо.
import { tokenize, distance, norm } from "./lex.js";

export const MIN_WORDS = 4;
export const MAX_WORDS = 14; // длиннее трудно удержать в памяти и записать на телефоне

const wc = (s) => tokenize(s).length;

/** Предложения, годящиеся для диктанта: не слишком короткие и длинные, без цифр (их озвучка читает по-своему). */
export const dictationPool = (pool) => pool.filter((c) => !/\d/.test(c.s) && wc(c.s) >= MIN_WORDS && wc(c.s) <= MAX_WORDS);

/** Предложение для диктанта: случайное, но не то, что было в прошлый раз. */
export function pickDictation(pool, { last = null, rnd = Math.random } = {}) {
  const ok = dictationPool(pool);
  if (!ok.length) return null;
  const fresh = ok.length > 1 ? ok.filter((c) => c.s !== last) : ok;
  return fresh[Math.floor(rnd() * fresh.length) % fresh.length];
}

/** Слова считаются опечаткой друг друга, если отличаются на одну букву (у длинных на две); совсем короткие слова не путаем. */
export function isTypo(a, b) {
  if (a === b || Math.min(a.length, b.length) < 3) return false;
  const d = distance(a, b);
  return d === 1 || (Math.max(a.length, b.length) >= 8 && d === 2);
}

const EXACT = 0;
const TYPO = 0.4;
const SUBST = 1;
const GAP = 1;

/**
 * Сравнивает записанное с предложением по словам (выравнивание по минимуму правок).
 * ctx — { s, a, b }: предложение и место слова карточки (его оценка весит больше остальных).
 * Возвращает:
 *   lead   текст перед первым словом (например, открывающая кавычка);
 *   parts  [{ kind: 'ok' | 'typo' | 'wrong' | 'miss' | 'extra', word, typed, key, tail }]
 *          word — слово предложения, typed — что написали, key — это слово карточки, tail — знаки после слова;
 *   n, exact, typo, extra, score, key ('ok' | 'typo' | 'no'), verdict ('ok' | 'near' | 'no').
 */
export function compareDictation(typed, ctx) {
  const target = tokenize(ctx.s);
  const said = tokenize(String(typed || ""));
  const n = target.length;
  const m = said.length;
  const keyIdx = new Set(target.map((t, i) => (t.end > ctx.a && t.start < ctx.b ? i : -1)).filter((i) => i >= 0));

  // d[i][j]: цена выравнивания первых i слов предложения и первых j записанных слов
  const cost = (i, j) => (target[i].surf === norm(said[j].raw) ? EXACT : isTypo(target[i].surf, norm(said[j].raw)) ? TYPO : SUBST);
  const d = Array.from({ length: n + 1 }, () => new Array(m + 1).fill(0));
  for (let i = 1; i <= n; i++) d[i][0] = i * GAP;
  for (let j = 1; j <= m; j++) d[0][j] = j * GAP;
  for (let i = 1; i <= n; i++) {
    for (let j = 1; j <= m; j++) d[i][j] = Math.min(d[i - 1][j - 1] + cost(i - 1, j - 1), d[i - 1][j] + GAP, d[i][j - 1] + GAP);
  }

  const parts = [];
  const tailOf = (i) => ctx.s.slice(target[i].end, i + 1 < n ? target[i + 1].start : ctx.s.length);
  let i = n;
  let j = m;
  while (i > 0 || j > 0) {
    if (i > 0 && j > 0 && Math.abs(d[i][j] - (d[i - 1][j - 1] + cost(i - 1, j - 1))) < 1e-9) {
      const c = cost(i - 1, j - 1);
      parts.push({ kind: c === EXACT ? "ok" : c === TYPO ? "typo" : "wrong", word: target[i - 1].raw, typed: said[j - 1].raw, key: keyIdx.has(i - 1), tail: tailOf(i - 1) });
      i--;
      j--;
    } else if (i > 0 && Math.abs(d[i][j] - (d[i - 1][j] + GAP)) < 1e-9) {
      parts.push({ kind: "miss", word: target[i - 1].raw, typed: "", key: keyIdx.has(i - 1), tail: tailOf(i - 1) });
      i--;
    } else {
      parts.push({ kind: "extra", word: "", typed: said[j - 1].raw, key: false, tail: "" });
      j--;
    }
  }
  parts.reverse();

  const count = (k) => parts.filter((p) => p.kind === k).length;
  const exact = count("ok");
  const typo = count("typo");
  const extra = count("extra");
  const score = (exact + typo * 0.5) / (n + extra || 1);
  const keyParts = parts.filter((p) => p.key);
  const key = !keyParts.length || keyParts.every((p) => p.kind === "ok") ? "ok" : keyParts.every((p) => p.kind === "ok" || p.kind === "typo") ? "typo" : "no";
  let verdict = "no";
  if (m && key === "ok" && score >= 0.8) verdict = "ok";
  else if (m && key !== "no" && score >= 0.5) verdict = "near";
  return { lead: n ? ctx.s.slice(0, target[0].start) : "", parts, n, exact, typo, extra, score, key, verdict };
}
