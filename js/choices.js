// choices.js — варианты ответа для режима «Выбор»: один верный перевод и три неверных.
// Чистые функции без DOM, проверяются в Node (tests/choices.test.mjs).
//
// Два вида вопросов: «выбрать перевод» (buildChoices) и «выбрать английское слово» (buildWordChoices:
// слово по переводу и слово по предложению с пропуском).
//
// Неверные варианты берутся из словаря и из ваших карточек. Чтобы вопрос не решался «по виду»:
//  - тот же тип записи (слово, фразовый глагол, идиома) и тот же вид текста (перевод, автоперевод
//    определения или английское определение), иначе короткий перевод среди длинных определений выдаёт ответ;
//  - по возможности та же часть речи и похожая длина;
//  - ни одного общего слова с верным ответом: «собака» не может стоять рядом с «пёс, собака».

/** Каким текстом отвечаем на карточку: русский перевод, автоперевод определения или английское определение. */
export const kindOf = (e) => (e.ru ? "ru" : e.rm ? "rm" : "en");

/** Есть ли у записи текст нужного вида (для автоперевода нужно, чтобы настоящего перевода не было). */
const hasKind = (e, kind) => (kind === "any" ? true : kind === "ru" ? !!e.ru : kind === "rm" ? !e.ru && !!e.rm : !!e.en);

const clip = (s, n) => (s.length <= n ? s : s.slice(0, n).replace(/[\s,;:-]+\S*$/, "") + "…");

/** Как вариант выглядит на кнопке: первые два смысла, не длиннее 90 знаков. */
export function optionText(e, kind) {
  const full = e[kind] || "";
  if (kind === "ru") return clip(full.split(";").slice(0, 2).map((x) => x.trim()).join("; "), 90);
  return clip(full, 110);
}

const words = (s) => new Set(s.toLowerCase().match(/\p{L}{3,}/gu) || []);
const share = (a, b) => [...a].some((w) => b.has(w));
const posOf = (e) => (e.pos || "").split(/[ ,]/)[0];

const SAMPLE = 160;
const poolCache = new WeakMap();
/** Записи словаря одного типа с текстом нужного вида; считаем один раз на словарь. */
function glossaryPool(glossary, t, kind) {
  let c = poolCache.get(glossary);
  if (!c || c.len !== glossary.list.length) poolCache.set(glossary, (c = { len: glossary.list.length, byKey: new Map() }));
  const key = `${t}:${kind}`;
  if (!c.byKey.has(key)) c.byKey.set(key, glossary.list.filter((e) => e.t === t && hasKind(e, kind)));
  return c.byKey.get(key);
}

function shuffle(arr, rng) {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

/**
 * Собирает варианты ответа для карточки.
 * glossary — объект Glossary (список list), cards — карточки пользователя (Map или массив).
 * Возвращает { options: [{text, ok}], kind } или null, если подходящих неверных вариантов не нашлось.
 */
export function buildChoices(card, glossary, cards = [], { rng = Math.random, count = 3 } = {}) {
  const kind = kindOf(card);
  const right = optionText(card, kind);
  if (!right) return null;
  const rightWords = words(card[kind]);
  const mine = (cards instanceof Map ? [...cards.values()] : cards).filter((c) => c.t === card.t && hasKind(c, kind));
  const base = glossaryPool(glossary, card.t, kind);

  // Небольшой словарь просматриваем целиком; из большого берём случайную выборку, а не перебираем все записи
  const candidates = [...mine];
  if (base.length <= SAMPLE) candidates.push(...base);
  else {
    const seen = new Set();
    for (let n = 0; n < SAMPLE * 2 && seen.size < SAMPLE; n++) seen.add(base[Math.floor(rng() * base.length)]);
    candidates.push(...seen);
  }

  const taken = new Set([right.toLowerCase()]);
  const scored = [];
  for (const e of candidates) {
    if (e.w === card.w && e.t === card.t) continue;
    const text = optionText(e, kind);
    if (!text || taken.has(text.toLowerCase())) continue;
    if (share(rightWords, words(e[kind]))) continue;
    const score = (posOf(e) === posOf(card) ? 0 : 60) + Math.abs(text.length - right.length) + rng() * 12;
    scored.push({ text, score });
  }
  scored.sort((a, b) => a.score - b.score);

  const picked = [];
  for (const s of scored) {
    const k = s.text.toLowerCase();
    if (taken.has(k)) continue;
    taken.add(k);
    picked.push(s.text);
    if (picked.length === count) break;
  }
  if (picked.length < 1) return null;
  const options = shuffle([{ text: right, ok: true }, ...picked.map((text) => ({ text, ok: false }))], rng);
  return { options, kind };
}

/** Перевод или определение как вопрос «какое это слово»: до трёх смыслов, не длиннее 140 знаков. */
export function promptText(card) {
  const kind = kindOf(card);
  const full = card[kind] || "";
  if (kind === "en") return clip(full, 140);
  return clip(full.split(";").slice(0, 3).map((x) => x.trim()).join("; "), 140);
}

const gloss = (e) => e.ru || e.rm || e.en || "";

/**
 * Варианты «какое слово подходит»: верное слово и три неверных английских слова (или фразы) того же типа.
 * Неверные берутся из словаря и ваших карточек; предпочтительны слова той же части речи, похожей длины и с тем же
 * началом (так нужно смотреть на смысл, а не на первую букву). Слова с тем же смыслом (общие слова в переводе) не берутся,
 * чтобы верный вариант всегда был один.
 * Возвращает { options: [{text, ok}], kind: "word" } или null.
 */
export function buildWordChoices(card, glossary, cards = [], { rng = Math.random, count = 3 } = {}) {
  if (!card.w) return null;
  const mine = (cards instanceof Map ? [...cards.values()] : cards).filter((c) => c.t === card.t);
  const base = glossaryPool(glossary, card.t, "any");
  const candidates = [...mine];
  if (base.length <= SAMPLE) candidates.push(...base);
  else {
    const seen = new Set();
    for (let n = 0; n < SAMPLE * 2 && seen.size < SAMPLE; n++) seen.add(base[Math.floor(rng() * base.length)]);
    candidates.push(...seen);
  }
  const mean = words(gloss(card));
  const lw = card.w.toLowerCase();
  const taken = new Set([lw]);
  const scored = [];
  for (const e of candidates) {
    const w = (e.w || "").toLowerCase();
    if (!w || taken.has(w)) continue;
    if (mean.size && share(mean, words(gloss(e)))) continue;
    const score = (posOf(e) === posOf(card) ? 0 : 60) + Math.abs(w.length - lw.length) + (w[0] === lw[0] ? -6 : 0) + (w.slice(0, 3) === lw.slice(0, 3) ? -6 : 0) + rng() * 12;
    scored.push({ text: e.w, key: w, score });
  }
  scored.sort((a, b) => a.score - b.score);
  const picked = [];
  for (const sc of scored) {
    if (taken.has(sc.key)) continue;
    taken.add(sc.key);
    picked.push(sc.text);
    if (picked.length === count) break;
  }
  if (!picked.length) return null;
  const options = shuffle([{ text: card.w, ok: true }, ...picked.map((text) => ({ text, ok: false }))], rng);
  return { options, kind: "word" };
}
