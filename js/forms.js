// forms.js — задание «Форма слова»: в предложении из книги стоит одна из форм слова (grew, grown, growing),
// и её нужно выбрать из четырёх. Чистые функции без DOM, проверяются в Node (tests/forms.test.mjs).
//
// Формы строим по правилам и по таблице неправильных форм (lex.js). Верный вариант всегда настоящий: это слово,
// которое стоит в самом предложении. Выдумывать приходится только неверные варианты, поэтому для слов, у которых
// форму по правилам не построить (длинные прилагательные, существительные), задание не даётся вовсе.
import { irregularForms } from "./lex.js";

const CONSONANT = "bcdfghjklmnpqrstvwxz";
const isCons = (ch) => !!ch && CONSONANT.includes(ch);
const isVowel = (ch) => !!ch && "aeiou".includes(ch);

/** Грубый счёт слогов: достаточно, чтобы отличить односложное слово от длинного. */
export const syllables = (w) => (w.toLowerCase().replace(/e$/, "").match(/[aeiouy]+/g) || []).length || 1;

// Многосложные глаголы, у которых перед окончанием удваивается последняя буква (ударение на последнем слоге).
const DOUBLING = new Set(["begin", "forget", "prefer", "refer", "occur", "admit", "permit", "commit", "submit", "control", "regret", "equip", "upset", "compel", "expel", "transfer", "outrun", "rebel", "repel", "propel", "patrol", "unplug", "overrun"]);

/** Удваивается ли последняя буква перед -ed, -ing, -er, -est: стоп → stopped, но visit → visited. */
function doubles(w) {
  const n = w.length;
  if (n < 3) return false;
  const [a, b, c] = [w[n - 3], w[n - 2], w[n - 1]];
  if (!(isCons(a) || (a === "u" && w[n - 4] === "q")) || !isVowel(b) || !isCons(c) || "wxy".includes(c)) return false;
  return syllables(w) === 1 || DOUBLING.has(w) || isInvariant(w);
}

const endsWithConsY = (w) => w.length > 1 && w.endsWith("y") && isCons(w[w.length - 2]);

function thirdPerson(w) {
  if (/(s|x|z|ch|sh|o)$/.test(w)) return `${w}es`;
  if (endsWithConsY(w)) return `${w.slice(0, -1)}ies`;
  return `${w}s`;
}

function ingForm(w) {
  if (w.endsWith("ie")) return `${w.slice(0, -2)}ying`;
  if (w.endsWith("e") && !/(ee|ye|oe)$/.test(w)) return `${w.slice(0, -1)}ing`;
  if (doubles(w)) return `${w}${w[w.length - 1]}ing`;
  return `${w}ing`;
}

function edForm(w) {
  if (w.endsWith("e")) return `${w}d`;
  if (endsWithConsY(w)) return `${w.slice(0, -1)}ied`;
  if (doubles(w)) return `${w}${w[w.length - 1]}ed`;
  return `${w}ed`;
}

const uniq = (list) => [...new Set(list)];

// Глаголы, у которых таблица неправильных форм уже содержит всё нужное, а правила только мешают.
const OWN_TABLE = new Set(["have", "do", "go"]);
// Неправильные глаголы, у которых прошедшее время совпадает с начальной формой: put, а не «putted».
const INVARIANT = new Set(["put", "cut", "set", "hit", "let", "shut", "hurt", "cost", "quit", "split", "spread", "burst", "cast", "rid", "bet", "read", "bid", "shed", "thrust", "offset", "forecast", "broadcast"]);
// Приставки, с которыми глагол ведёт себя как без них: overcome → overcame, reset → reset.
const PREFIXES = ["over", "under", "out", "up", "re", "with", "mis", "fore", "un"];

const isInvariant = (w) => INVARIANT.has(w) || PREFIXES.some((p) => w.startsWith(p) && INVARIANT.has(w.slice(p.length)));

/** Неправильные формы глагола (в том числе с приставкой): { own, forms } или null, если глагол правильный. */
function irregularVerb(w) {
  const direct = irregularForms(w);
  if (direct.length) return { own: OWN_TABLE.has(w), forms: direct };
  for (const p of PREFIXES) {
    const rest = w.slice(p.length);
    if (!w.startsWith(p) || rest.length < 2) continue;
    const forms = irregularForms(rest);
    if (forms.length) return { own: OWN_TABLE.has(rest), forms: forms.map((f) => p + f) };
  }
  return null;
}
const SKIP_VERBS = new Set(["be"]); // am, is, are, was, were: вариантов слишком много, и все верны в разных предложениях
const ADJ_IRREGULAR = { good: ["better", "best"], bad: ["worse", "worst"] };
const ADJ_NO_COMPARATIVE = /(ful|less|ous|ing|ed|ive|al|ic|ish|ent|ant|able|ible|ary|ory)$/;

/**
 * Какие части речи карточки нас интересуют: "v" и "adj". В словаре часть речи записана то коротко (v, adj),
 * то словами и через запятую («noun, verb»), поэтому разбираем и то и другое.
 */
export function kindsOf(pos) {
  const out = [];
  for (const t of String(pos || "").toLowerCase().split(/[^a-z]+/)) {
    const k = t === "v" || t === "verb" ? "v" : t === "adj" || t === "adjective" ? "adj" : null;
    if (k && !out.includes(k)) out.push(k);
  }
  return out.sort((a, b) => (a === "v" ? -1 : b === "v" ? 1 : 0)); // глагол первым
}

/** Формы слова одной части речи (kind: "v" | "adj"); [] там, где по правилам их не построить. */
function formsOfKind(w, kind) {
  if (!/^[a-z]+$/.test(w)) return [];
  if (kind === "v") {
    if (SKIP_VERBS.has(w)) return [];
    const irr = irregularVerb(w);
    if (irr?.own) return uniq([w, ...irr.forms]);
    if (isInvariant(w)) return uniq([w, thirdPerson(w), ingForm(w)]);
    return uniq([w, thirdPerson(w), ...(irr ? irr.forms : [edForm(w)]), ingForm(w)]);
  }
  if (ADJ_IRREGULAR[w]) return [w, ...ADJ_IRREGULAR[w]];
  if (syllables(w) > 2 || ADJ_NO_COMPARATIVE.test(w)) return [];
  if (endsWithConsY(w)) return [w, `${w.slice(0, -1)}ier`, `${w.slice(0, -1)}iest`];
  if (w.endsWith("e")) return [w, `${w}r`, `${w}st`];
  if (doubles(w)) return [w, `${w}${w[w.length - 1]}er`, `${w}${w[w.length - 1]}est`];
  return [w, `${w}er`, `${w}est`];
}

/**
 * Наборы форм слова по его частям речи: для глагола «начальная, -s, прошедшее, причастие, -ing»,
 * для прилагательного «начальная, -er, -est». Пустой список, если формы по правилам не построить.
 */
export function formSets(lemma, pos) {
  const w = String(lemma || "").toLowerCase();
  return kindsOf(pos).map((k) => formsOfKind(w, k)).filter((f) => f.length >= 2);
}

/** Формы слова для первой подходящей части речи (глагол, иначе прилагательное). */
export const wordForms = (lemma, pos) => formSets(lemma, pos)[0] || [];

/** Слово без удвоенных букв: «travelled» и «traveled» считаются одним написанием, чтобы не предлагать оба варианта. */
const collapse = (s) => s.replace(/(.)\1/g, "$1");

/** Слово в предложении: одна форма из букв, не начальная (иначе это обычное задание «Слово в предложении»). */
export function inflectedSpan(ctx, card) {
  const surface = ctx.s.slice(ctx.a, ctx.b);
  if (!/^[A-Za-z]+$/.test(surface)) return null;
  return surface.toLowerCase() === String(card.w).toLowerCase() ? null : surface;
}

/** Бывают ли у карточки формы вообще: одиночный глагол или прилагательное, для которого их можно построить. */
export const canHaveForms = (card) => card.t === "w" && !/\s/.test(card.w) && formSets(card.w, card.pos).some((f) => f.length >= 3);

const shuffle = (list, rnd) => {
  const a = [...list];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rnd() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
};

/**
 * Вопрос «какая форма подходит». ctx — предложение из книги со словом в какой-то форме.
 * Возвращает { options: [{ text, ok }], answer, lemma } или null, если хороших вариантов не набралось (нужно хотя бы три).
 * Форма из предложения должна быть среди построенных (иначе она не походила бы на неверные варианты и выдавала бы себя).
 * Заглавная буква варианта повторяет заглавную в предложении, чтобы по ней нельзя было угадать.
 */
export function formQuestion(card, ctx, { rnd = Math.random } = {}) {
  if (!canHaveForms(card)) return null;
  const surface = inflectedSpan(ctx, card);
  if (!surface) return null;
  const low = surface.toLowerCase();
  const same = collapse(low);
  const forms = formSets(card.w, card.pos).find((f) => f.some((x) => collapse(x) === same));
  if (!forms) return null;
  const wrong = forms.filter((f) => f !== low && collapse(f) !== same);
  if (wrong.length < 2) return null;
  const cap = (s) => (surface[0] !== low[0] ? s[0].toUpperCase() + s.slice(1) : s);
  const picked = shuffle(wrong, rnd).slice(0, 3);
  const options = shuffle([{ text: cap(low), ok: true }, ...picked.map((f) => ({ text: cap(f), ok: false }))], rnd);
  return { options, answer: cap(low), lemma: card.w };
}

/** Предложения, из которых получается вопрос про форму: слово стоит не в начальной форме, а форма известна. */
export const inflectedContexts = (pool, card) => (canHaveForms(card) ? pool.filter((c) => formQuestion(card, c, { rnd: () => 0 })) : []);
