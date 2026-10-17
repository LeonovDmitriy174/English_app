// families.js — задание «Семья слов»: в предложении из книги пропущено слово, а варианты однокоренные
// (growth, grow, grower, growing): нужно выбрать ту часть речи, которая подходит к предложению. Чистые функции
// без DOM, проверяются в Node (tests/families.test.mjs). Сами семьи лежат в js/familydata.js.
//
// Верный вариант всегда настоящий: это слово, которое стоит в самом предложении. Неверными берутся члены той же семьи
// с другой частью речи (у существительного: глагол, прилагательное, наречие, «человек»), поэтому второй подходящий
// вариант почти невозможен. Слова одной части речи в вопрос вместе не попадают: «decision» и «decider» подошли бы одинаково.
import { FAMILY_LINES } from "./familydata.js";

/** Короткие подписи частей речи для списка семьи после ответа. */
export const CLASS_LABEL = { v: "гл.", n: "сущ.", p: "сущ. (человек)", adj: "прил.", adv: "нареч." };
const CLASS_ORDER = ["v", "n", "p", "adj", "adv"];

let cache = null;

/** Разобранные семьи: { list: [{ id, members: [{ w, cls: [..] }] }], byWord: Map слово → семья }. */
export function families() {
  if (cache) return cache;
  const list = [];
  const byWord = new Map();
  for (const line of FAMILY_LINES.split("\n")) {
    const members = [];
    for (const tok of line.trim().split(/\s+/)) {
      const dot = tok.lastIndexOf(".");
      if (!tok || dot < 1) continue;
      members.push({ w: tok.slice(0, dot), cls: tok.slice(dot + 1).split(",") });
    }
    if (members.length < 3) continue;
    const fam = { id: list.length, members };
    list.push(fam);
    for (const m of members) byWord.set(m.w, fam);
  }
  cache = { list, byWord };
  return cache;
}

/** Семья слова или null. */
export const familyOf = (word) => families().byWord.get(String(word ?? "").toLowerCase()) || null;

/** Классы по части речи из словаря («noun, verb», «adj», «v»): [] если ничего не распознано. */
export function classesOfPos(pos) {
  const out = new Set();
  for (const t of String(pos || "").toLowerCase().split(/[^a-z]+/)) {
    if (t === "n" || t === "noun") out.add("n"), out.add("p");
    else if (t === "v" || t === "verb") out.add("v");
    else if (t === "adj" || t === "adjective") out.add("adj");
    else if (t === "adv" || t === "adverb") out.add("adv");
  }
  return [...out];
}

const shuffle = (list, rnd) => {
  const a = [...list];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rnd() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
};

const escape = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

/** Слово карточки в семье и классы, подходящие и к словарю: null, если семьи нет или часть речи не сходится. */
function placeOf(card) {
  if (!card || card.t !== "w" || /\s/.test(card.w || "")) return null;
  const fam = familyOf(card.w);
  if (!fam) return null;
  const me = fam.members.find((m) => m.w === card.w.toLowerCase());
  const known = classesOfPos(card.pos);
  if (known.length && !me.cls.some((c) => known.includes(c))) return null; // «lead» как существительное (свинец) в семье глагола
  return { fam, me };
}

/** Бывает ли у карточки семья вообще (не смотрит на предложения). */
export const canHaveFamily = (card) => !!placeOf(card);

/**
 * Вопрос «какое слово подходит». ctx — предложение из книги, где слово карточки стоит в начальной форме.
 * has(слово) — есть ли у слова своя статья в словаре (неверные варианты берутся только из таких: после ответа
 * для них показывается перевод). Возвращает { options: [{ text, ok }], answer, rows } или null, если хороших вариантов
 * не набралось (нужно хотя бы три). rows — слова семьи для разбора после ответа: [{ w, cls, me }].
 * Заглавная буква вариантов повторяет заглавную в предложении, чтобы по ней нельзя было угадать.
 */
export function familyQuestion(card, ctx, { has = () => true, rnd = Math.random } = {}) {
  const place = placeOf(card);
  if (!place || !ctx || typeof ctx.s !== "string") return null;
  const surface = ctx.s.slice(ctx.a, ctx.b);
  const low = surface.toLowerCase();
  if (!/^[A-Za-z]+$/.test(surface) || low !== card.w.toLowerCase()) return null;
  const upper = surface[0] !== low[0];
  if (upper && !/^[\s"“”'‘’(\[—–-]*$/.test(ctx.s.slice(0, ctx.a))) return null; // заглавная посреди предложения: скорее имя
  const { fam, me } = place;
  const rest = `${ctx.s.slice(0, ctx.a)} ${ctx.s.slice(ctx.b)}`;
  const mine = new Set(me.cls);
  const cands = fam.members.filter((m) => m !== me && m.cls.every((c) => !mine.has(c)) && has(m.w) && !new RegExp(`\\b${escape(m.w)}\\b`, "i").test(rest));
  if (cands.length < 2) return null;
  // сначала по одному слову каждой части речи, потом остальные: четыре варианта должны быть как можно разнообразнее
  const byClass = new Map();
  for (const m of shuffle(cands, rnd)) {
    const key = m.cls[0];
    if (!byClass.has(key)) byClass.set(key, []);
    byClass.get(key).push(m);
  }
  const picked = [];
  for (const group of shuffle([...byClass.values()], rnd)) picked.push(group.shift());
  for (const group of byClass.values()) picked.push(...group);
  const wrong = picked.slice(0, 3);
  const cap = (s) => (upper ? s[0].toUpperCase() + s.slice(1) : s);
  const options = shuffle([{ text: cap(low), ok: true }, ...wrong.map((m) => ({ text: cap(m.w), ok: false }))], rnd);
  const rows = fam.members
    .filter((m) => m === me || has(m.w))
    .map((m) => ({ w: m.w, cls: m.cls, me: m === me }))
    .sort((a, b) => Math.min(...a.cls.map((c) => CLASS_ORDER.indexOf(c))) - Math.min(...b.cls.map((c) => CLASS_ORDER.indexOf(c))));
  return { options, answer: cap(low), rows };
}

/** Предложения, из которых получается вопрос про семью слов. */
export const familyContexts = (pool, card, opts = {}) => (canHaveFamily(card) ? pool.filter((c) => familyQuestion(card, c, { ...opts, rnd: () => 0 })) : []);

/** Подпись частей речи слова семьи: «гл., сущ.». */
export const classLabel = (cls) => cls.map((c) => CLASS_LABEL[c]).filter(Boolean).join(", ");
