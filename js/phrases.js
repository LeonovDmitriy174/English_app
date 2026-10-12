// phrases.js — задание «Частица или слово во фразе»: у фразового глагола пропущена частица (give ___ → up),
// у идиомы пропущено главное слово (a piece of ___ → cake). Чистые функции без DOM, проверяются в Node (tests/phrases.test.mjs).
//
// Перевод фразы показывается как подсказка, поэтому ответ однозначен. Неверные варианты берём из самого словаря:
// у фразового глагола это частицы его «братьев» (give in, give out, give away), у идиомы слова из других идиом.
// Вариант, который складывается в другую настоящую идиому, в неверные не попадает.
import { tokenize } from "./lex.js";

/** Частицы по частоте: из них добираются неверные варианты. */
export const PARTICLES = ["up", "out", "off", "on", "in", "down", "over", "away", "back", "through", "around", "along", "about", "after", "for", "into", "with", "by", "apart", "ahead", "aside", "forward", "together", "at", "to"];
const PARTICLE_SET = new Set(PARTICLES);

// Служебные слова и местоимения: пропускать их в идиоме бессмысленно, и в неверные варианты они не годятся.
const STOP = new Set(
  "a an the of to in on at as with for by up out off from into and or but it its is are was be been do does did have has had not no so if than that this these those what all one one's your my his her their our me you him them us i he she we they who whom how when where why something someone somebody anything oneself yourself himself themselves".split(" "),
);

const SAMPLE = 400; // сколько слов других идиом просматривается при подборе неверных вариантов

const shuffle = (list, rnd) => {
  const a = [...list];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rnd() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
};
const uniq = (list) => [...new Set(list)];
const words = (phrase) => String(phrase).toLowerCase().split(/\s+/).filter(Boolean);

// Слова других идиом и все известные фразы считаются один раз на словарь.
const cache = new WeakMap();
function indexOf(entries) {
  let c = cache.get(entries);
  if (c) return c;
  const phrases = new Set();
  const idiomWords = new Set();
  for (const e of entries) {
    if (e.t !== "pv" && e.t !== "id") continue;
    for (const p of [e.w, ...(e.m || [])]) phrases.add(words(p).join(" "));
    if (e.t === "id") for (const w of words(e.w)) if (/^[a-z']{3,}$/.test(w) && !STOP.has(w)) idiomWords.add(w);
  }
  c = { phrases, idiomWords: [...idiomWords] };
  cache.set(entries, c);
  return c;
}

/** Номер слова идиомы, которое стоит пропустить: последнее значимое слово. -1, если такого нет. */
export function blankIndex(tokens) {
  for (let i = tokens.length - 1; i >= 0; i--) if (/^[a-z']{3,}$/.test(tokens[i]) && !STOP.has(tokens[i])) return i;
  return -1;
}

/** Может ли быть такое задание у карточки (без учёта словаря: хватит ли вариантов, выяснится при построении). */
export function canAskPhrase(card) {
  const toks = words(card.w);
  if (toks.length < 2) return false;
  if (card.t === "pv") return PARTICLE_SET.has(toks[toks.length - 1]);
  if (card.t === "id") return blankIndex(toks) >= 0;
  return false;
}

/** Где в предложении стоит пропускаемое слово: сдвиги [от, до) последнего слова фразы или null, если предложение не подходит. */
function lastWordSpan(ctx, card) {
  const toks = tokenize(ctx.s.slice(ctx.a, ctx.b));
  const want = words(card.w);
  if (toks.length !== want.length || toks[toks.length - 1].surf !== want[want.length - 1]) return null;
  const t = toks[toks.length - 1];
  return { from: ctx.a + t.start, to: ctx.a + t.end };
}

/**
 * Вопрос по фразовому глаголу или идиоме. entries — все записи словаря (откуда берутся неверные варианты),
 * ctx — предложение из книги с фразовым глаголом (необязательно: без него показывается сама фраза с пропуском).
 * Возвращает { kind, before, after, answer, options: [{ text, ok }], sentence } или null, если вариантов не набралось.
 */
export function phraseQuestion({ card, entries, ctx = null, rnd = Math.random }) {
  if (!canAskPhrase(card)) return null;
  const toks = words(card.w);
  const { phrases, idiomWords } = indexOf(entries);
  let answer;
  let wrong;
  let before;
  let after;
  let sentence = false;

  if (card.t === "pv") {
    answer = toks[toks.length - 1];
    const stem = toks.slice(0, -1);
    const siblings = entries.filter((e) => e.t === "pv" && e.id !== card.id).map((e) => words(e.w)).filter((t) => t.length === toks.length && t.slice(0, -1).join(" ") === stem.join(" ")).map((t) => t[t.length - 1]).filter((p) => PARTICLE_SET.has(p));
    wrong = uniq([...shuffle(siblings, rnd), ...shuffle(PARTICLES.slice(0, 14), rnd), ...PARTICLES.slice(14)]).filter((p) => p !== answer);
    const span = ctx && lastWordSpan(ctx, card);
    if (span) {
      before = ctx.s.slice(0, span.from);
      after = ctx.s.slice(span.to);
      sentence = true;
    } else {
      before = `${stem.join(" ")} `;
      after = "";
    }
  } else {
    const i = blankIndex(toks);
    answer = toks[i];
    const fits = (w) => !phrases.has([...toks.slice(0, i), w, ...toks.slice(i + 1)].join(" "));
    // в большом словаре идиом тысячи: смотрим случайные несколько сотен слов, этого хватает с запасом
    const from = idiomWords.length <= SAMPLE ? idiomWords : Array.from({ length: SAMPLE }, () => idiomWords[Math.floor(rnd() * idiomWords.length)]);
    // слова близкой длины выглядят похоже и не выдают ответ
    const near = uniq(from).filter((w) => w !== answer && fits(w)).sort((a, b) => Math.abs(a.length - answer.length) - Math.abs(b.length - answer.length) || rnd() - 0.5);
    wrong = shuffle(near.slice(0, 12), rnd);
    const shown = card.w.split(/\s+/).filter(Boolean); // слова так, как они записаны в карточке
    before = i ? `${shown.slice(0, i).join(" ")} ` : "";
    after = i < shown.length - 1 ? ` ${shown.slice(i + 1).join(" ")}` : "";
  }

  if (wrong.length < 3) return null;
  const options = shuffle([{ text: answer, ok: true }, ...wrong.slice(0, 3).map((text) => ({ text, ok: false }))], rnd);
  return { kind: card.t, before, after, answer, options, sentence };
}
