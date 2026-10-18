// lex.js — токенизация, приведение к начальной форме, словарь, поиск фраз.
// Чистые функции без DOM: модуль проверяется в Node (tests/lex.test.mjs).

import { fixEntry } from "./dictfixes.js";

const APOS = /[’‘`]/g;
export const norm = (s) => s.toLowerCase().replace(APOS, "'");
export const WORD_RE = /\p{L}+(?:['’]\p{L}+)*/gu;

// ── Неправильные формы: «начальная: формы…» ───────────────────────────────
const IRREGULAR_SRC = `
be: am is are was were been being
have: has had having
do: does did done doing
go: goes went gone going
awake: awoke awoken
bear: bore born borne
beat: beaten
become: became
begin: began begun
bend: bent
bind: bound
bite: bit bitten
bleed: bled
blow: blew blown
break: broke broken
breed: bred
bring: brought
build: built
burn: burnt
buy: bought
catch: caught
choose: chose chosen
come: came
creep: crept
deal: dealt
dig: dug
draw: drew drawn
dream: dreamt
drink: drank drunk
drive: drove driven
eat: ate eaten
fall: fell fallen
feed: fed
feel: felt
fight: fought
find: found
flee: fled
fling: flung
fly: flew flown
forbid: forbade forbidden
forget: forgot forgotten
forgive: forgave forgiven
freeze: froze frozen
get: got gotten
give: gave given
grind: ground
grow: grew grown
hang: hung
hear: heard
hide: hid hidden
hold: held
keep: kept
kneel: knelt
know: knew known
lay: laid
lead: led
lean: leant
leap: leapt
learn: learnt
leave: left
lend: lent
lie: lay lain
light: lit
lose: lost
make: made
mean: meant
meet: met
pay: paid
ride: rode ridden
ring: rang rung
rise: rose risen
run: ran
say: said
see: saw seen
seek: sought
sell: sold
send: sent
shake: shook shaken
shear: shorn
shine: shone
shoot: shot
show: shown
shrink: shrank shrunk shrunken
sing: sang sung
sink: sank sunk
sit: sat
sleep: slept
slide: slid
speak: spoke spoken
spend: spent
spin: spun
spit: spat
spring: sprang sprung
stand: stood
steal: stole stolen
stick: stuck
sting: stung
strike: struck stricken
swear: swore sworn
sweep: swept
swim: swam swum
swing: swung
take: took taken
teach: taught
tear: tore torn
tell: told
think: thought
throw: threw thrown
understand: understood
wake: woke woken
wear: wore worn
weep: wept
win: won
wind: wound
write: wrote written
man: men
woman: women
child: children
foot: feet
tooth: teeth
mouse: mice
person: people
knife: knives
wife: wives
life: lives
leaf: leaves
wolf: wolves
shelf: shelves
half: halves
good: better best
bad: worse worst
mistake: mistook mistaken
misunderstand: misunderstood
overtake: overtook overtaken
rebuild: rebuilt
remake: remade
slay: slew slain
speed: sped
undo: undid undone
weave: wove woven
withhold: withheld
bacterium: bacteria
criterion: criteria
phenomenon: phenomena
fungus: fungi
louse: lice
millennium: millennia
stratum: strata
alumnus: alumni
`;

const IRREGULAR = new Map();
for (const line of IRREGULAR_SRC.trim().split("\n")) {
  const [lemma, rest] = line.split(":");
  for (const f of rest.trim().split(/\s+/)) {
    if (!IRREGULAR.has(f)) IRREGULAR.set(f, []);
    IRREGULAR.get(f).push(lemma.trim());
  }
}

const FORMS_OF = new Map(); // начальная форма -> её неправильные формы
for (const [form, lemmas] of IRREGULAR) for (const l of lemmas) FORMS_OF.set(l, [...(FORMS_OF.get(l) || []), form]);

/** Неправильные формы слова из таблицы («grow» → grew, grown). Пустой список, если слово правильное или его нет в таблице. */
export const irregularForms = (lemma) => [...(FORMS_OF.get(norm(lemma)) || [])];

// Корень из одного слога, оканчивающийся на «согласная–гласная–согласная» (hat, star, us, writ, smil): у такого слова форма без удвоения, значит, слово кончалось на немую «e».
const silentE = (b) => /(?:^|[^aeiou])[aeiou][^aeiouwxy]$/.test(b) && (b.match(/[aeiouy]+/g) || []).length === 1;

/** Слово без притяжательного «’s» и сокращений: «that’s» → that, «isn’t» → is, «they’ll» → they. */
const stripClitic = (raw) => {
  let w = norm(raw).replace(/'s$/, "").replace(/s'$/, "s").replace(/n't$/, "").replace(/'(ll|re|ve|d|m)$/, "");
  if (w.endsWith("'")) w = w.slice(0, -1);
  return w;
};

// Отрицания, у которых «n’t» отрезается не по правилу (can’t → ca, won’t → wo). Нужны для поиска слова; для поиска фраз не годятся:
// «can’t do» не должно находить прилагательное can-do.
const NEGATIVE = { "can't": "can", "won't": "will", "shan't": "shall", "ain't": "be" };

/** Как слово написано в тексте: оно само и оно без «’s», «n’t» и т. п. */
const surfaceForms = (raw) => {
  const n = norm(raw);
  return [...new Set([n, NEGATIVE[n] || stripClitic(raw)])];
};

/** Возможные начальные формы слова в порядке убывания вероятности. */
export function lemmaCandidates(raw) {
  const out = [];
  // Односимвольными бывают только слова «a» и «I»; обрезанные окончания короче двух букв отбрасываем.
  const add = (x, short = false) => {
    if (x && (x.length > 1 || short) && !out.includes(x)) out.push(x);
  };
  const first = norm(raw);
  add(first, first === "a" || first === "i");
  const w = stripClitic(raw);
  add(w, w === "a" || w === "i");
  const irr = IRREGULAR.get(w);
  if (irr) irr.forEach(add);

  const undouble = (b) => (b.length > 2 && b[b.length - 1] === b[b.length - 2] ? b.slice(0, -1) : null);

  // Множественное число и «-s» у глагола. Срез «s» идёт раньше среза «es»: eyes → eye (а не ey), cares → care (а не car), uses → use (а не us).
  // Лишь после «ss» отрезаем «es» целиком (boss-es), иначе «bosse» уже не слово. Лишние варианты безвредны: несуществующее слово в словаре не найдётся.
  if (w.endsWith("ies")) {
    if (w.length <= 5) add(w.slice(0, -1)); // lies, ties, dies: «tie» вероятнее, чем «ty»
    add(w.slice(0, -3) + "y");
  }
  if (w.endsWith("ves")) {
    add(w.slice(0, -3) + "f");
    add(w.slice(0, -3) + "fe");
  }
  if (w.endsWith("sses")) add(w.slice(0, -2));
  if (w.endsWith("s") && !w.endsWith("ss")) add(w.slice(0, -1));
  if (w.endsWith("es")) add(w.slice(0, -2));
  if (w.endsWith("ied")) add(w.slice(0, -3) + "y");
  // Корень из одного слога и одной согласной на конце (hat, star, us, writ) в формах с «-ed», «-ing», «-er», «-est» удваивает её (hatted, starring).
  // Поэтому hated, staring, using, writing идут от hate, stare, use, write, а не от hat, star, us, writ.
  if (w.endsWith("ed")) {
    const b = w.slice(0, -2);
    if (silentE(b)) add(w.slice(0, -1));
    add(b);
    add(w.slice(0, -1));
    add(undouble(b));
  }
  if (w.endsWith("ing") && w.length > 4) {
    const b = w.slice(0, -3);
    if (silentE(b)) add(b + "e");
    add(b);
    add(b + "e");
    add(undouble(b));
    if (w.endsWith("ying")) add(w.slice(0, -4) + "ie");
  }
  if (w.endsWith("ly") && w.length > 4) {
    add(w.slice(0, -2));
    if (w.endsWith("ily")) add(w.slice(0, -3) + "y");
    if (w.endsWith("bly") || w.endsWith("ply")) add(w.slice(0, -1) + "e");
  }
  if (w.endsWith("er") && w.length > 4) {
    const b = w.slice(0, -2);
    if (silentE(b)) add(w.slice(0, -1));
    add(b);
    add(w.slice(0, -1));
    add(undouble(b));
    if (w.endsWith("ier")) add(w.slice(0, -3) + "y");
  }
  if (w.endsWith("est") && w.length > 5) {
    const b = w.slice(0, -3);
    if (silentE(b)) add(w.slice(0, -2));
    add(b);
    add(w.slice(0, -2));
    add(undouble(b));
    if (w.endsWith("iest")) add(w.slice(0, -4) + "y");
  }
  // В самом конце: «picked» должно сначала искаться как pick, а не как pic
  if (w.endsWith("cked")) add(w.slice(0, -3));
  if (w.endsWith("cking")) add(w.slice(0, -4));
  return out;
}

// ── Токены ────────────────────────────────────────────────────────────────
export function tokenize(text) {
  const out = [];
  for (const m of text.matchAll(WORD_RE)) {
    out.push({ raw: m[0], surf: norm(m[0]), start: m.index, end: m.index + m[0].length });
  }
  return out;
}

/**
 * Формы, которые в книгах чаще живут своей жизнью, чем как форма глагола или существительного: left hand, the ground, a bit, people.
 * Они остаются при своей записи, даже если стоят в таблице неправильных форм.
 */
const OWN_ENTRY = new Set(
  ("left ground rose bit born being doing people better best worse worst leaves lives bound wound " +
    "clothes means thanks pants jeans trousers glasses scissors goods news arms customs manners remains sweets greens").split(" "),
);

const isPlural = (w) => /[^s]s$/.test(w) && !w.includes("'");

const openPosOf = (pos) => (pos || "").toLowerCase().split(/[\s,;/]+/).filter((p) => ["noun", "verb", "adjective", "adverb", "n", "v", "adj", "adv"].includes(p));

/** Начальной формой может быть существительное, глагол, прилагательное или наречие (не междометие, не местоимение). Без пометки части речи годится. */
const isOpenPos = (pos) => !(pos || "").trim() || openPosOf(pos).length > 0;

/** Все самостоятельные части речи записи входят и в начальную форму (heads — noun, head — noun, verb). */
const posFits = (pos, lemmaPos) => {
  const mine = openPosOf(pos);
  const theirs = openPosOf(lemmaPos);
  return mine.length > 0 && mine.every((p) => theirs.includes(p));
};

const candsOf = (tok) => (tok.c ??= new Set(lemmaCandidates(tok.raw)));

// ── Словарь ───────────────────────────────────────────────────────────────
export class Glossary {
  constructor(entries) {
    this.list = entries.map((e) => ({ ...fixEntry(e), id: `${e.t}:${e.w}` }));
    this.byId = new Map(this.list.map((e) => [e.id, e]));
    this.words = new Map(); // слово или доп. форма -> запись (одиночные слова)
    this.firstIndex = new Map(); // первый токен шаблона -> [{entry, pat, sep}]
    this.lemmas = new Map(); // запись -> её начальная форма или null (см. lemmaOf)
    for (const e of this.list) {
      const pats = (e.m && e.m.length ? e.m : [e.w]).map((p) => p.split(/\s+/));
      const multi = pats.some((p) => p.length > 1);
      if (e.t === "w" && !multi) {
        this.words.set(e.w, e);
        (e.f || []).forEach((f) => this.words.set(f, e));
      } else {
        for (const pat of pats) {
          const key = pat[0];
          if (!this.firstIndex.has(key)) this.firstIndex.set(key, []);
          this.firstIndex.get(key).push({ entry: e, pat, sep: !!e.sep && pat.length === 2 });
        }
      }
    }
  }

  /**
   * Начальная форма, к которой ведёт запись, или null (запись остаётся как есть). Нужна, потому что словарь собран из Викисловаря
   * и у формы часто есть собственная запись с чужим смыслом: said — «упомянутый», saw — «пила», found — «основывать», are — «ар».
   * Ведём к начальной форме в двух случаях:
   *   1. форма есть в таблице неправильных форм (is → be, said → say), если её нет в OWN_ENTRY;
   *   2. у записи нет русского перевода и пометка Викисловаря «форма слова» подтверждается правилами окончаний (abandoned → abandon).
   * Пометке «форма слова» без такой проверки верить нельзя: в ней his → hi, beach → bitch, run → rin.
   */
  lemmaOf(e) {
    if (e.t !== "w") return null;
    let r = this.lemmas.get(e);
    if (r === undefined) {
      r = this.findLemma(e);
      this.lemmas.set(e, r);
    }
    return r;
  }

  findLemma(e) {
    if (OWN_ENTRY.has(e.w)) return null;
    const names = [...(IRREGULAR.get(e.w) || [])];
    const verified = (e.of || []).filter((l) => lemmaCandidates(e.w).includes(l));
    if (!e.ru) {
      names.push(...verified);
      // «Standard spelling of color» (colour, centre, programme): в словаре перевода у такого написания нет, он у основного
      const variant = /\bspelling of ([a-z][a-z-]*)\b/i.exec(e.en || "");
      if (variant) names.push(variant[1].toLowerCase());
    } else if (isPlural(e.w)) {
      // У слова с переводом: множественное число, у которого в Викисловаре записан особый смысл (heads — «орёл», minutes — «протокол», words — «ссора»).
      // В тексте это почти всегда обычное множественное число, поэтому ведём к единственному, если часть речи подходит.
      for (const l of verified) if (posFits(e.pos, this.words.get(l)?.pos)) names.push(l);
    }
    for (const name of names) {
      const L = this.words.get(name);
      if (L && L !== e && L.w === name && L.t === "w" && L.ru && isOpenPos(L.pos)) return L;
    }
    return null;
  }

  /**
   * Начальные формы из пометки «форма слова», которые подтверждают правила окончаний или таблица неправильных форм
   * (для подсказки «Может быть и формой слова»). his → hi, run → rin, its → it подсказкой не бывают: правила окончаний их «подтверждают»,
   * но междометие hi или местоимение it не начальная форма для his и its.
   */
  formOf(e) {
    if (!isOpenPos(e.pos)) return [];
    const cands = lemmaCandidates(e.w);
    const irr = IRREGULAR.get(e.w) || [];
    return (e.of || []).filter((l) => (cands.includes(l) || irr.includes(l)) && isOpenPos(this.words.get(l)?.pos));
  }

  /** Запись одиночного слова по форме из текста (или null). */
  lookupWord(raw) {
    const forms = surfaceForms(raw);
    let spare = null; // сокращение без перевода (that’s, isn’t): берём, только если слова без сокращения в словаре нет
    const cands = lemmaCandidates(raw);
    const neg = NEGATIVE[norm(raw)];
    if (neg && !cands.includes(neg)) cands.splice(1, 0, neg); // can’t → can, won’t → will
    for (const c of cands) {
      const e = this.words.get(c);
      if (!e) continue;
      // К начальной форме ведём только то, что написано в тексте: «founded» не должно превращаться в find через found
      if (!forms.includes(c)) return e;
      // Запись с апострофом не годится, если у неё нет перевода или слово попало к ней лишь как «другая форма» (it’s записано у its)
      if (c.includes("'") && (!e.ru || e.w !== c)) {
        spare ??= e;
        continue;
      }
      return this.lemmaOf(e) || e;
    }
    return spare;
  }
}

// ── Поиск фраз в абзаце ───────────────────────────────────────────────────
const POSS = new Set(["my", "your", "his", "her", "its", "our", "their"]);
const GAP_STOP = new Set(["to", "of", "in", "on", "at", "and", "but", "that", "which", "when", "as", "for", "with", "from", "by", "or", "if", "so", "because", "than"]);
const TIGHT = /^[\s-]*$/;

function matchTok(p, tok) {
  if (p === "*") return true;
  if (p === "@") return POSS.has(tok.surf) || tok.surf.endsWith("'s");
  return tok.surf === p || candsOf(tok).has(p);
}

const adjacent = (tokens, text, i, j) => TIGHT.test(text.slice(tokens[i].end, tokens[j].start));

function matchAt(tokens, text, i, pat, sep) {
  const n = pat.length;
  if (!matchTok(pat[0], tokens[i])) return null;
  let ok = true;
  for (let k = 1; k < n; k++) {
    const j = i + k;
    if (j >= tokens.length || !adjacent(tokens, text, j - 1, j) || !matchTok(pat[k], tokens[j])) {
      ok = false;
      break;
    }
  }
  if (ok) return Array.from({ length: n }, (_, k) => i + k);
  if (sep) {
    for (let g = 1; g <= 3; g++) {
      const j = i + 1 + g;
      if (j >= tokens.length) break;
      let good = true;
      for (let k = i; k < j; k++) {
        if (!adjacent(tokens, text, k, k + 1)) {
          good = false;
          break;
        }
      }
      if (!good) break;
      for (let k = i + 1; k < j; k++) {
        if (GAP_STOP.has(tokens[k].surf)) {
          good = false;
          break;
        }
      }
      if (good && matchTok(pat[1], tokens[j])) return [i, j];
    }
  }
  return null;
}

/** Находит фразы в абзаце. Возвращает [{entry, idxs}] без пересечений, по порядку в тексте. */
export function findPhrases(glossary, tokens, text) {
  const found = [];
  for (let i = 0; i < tokens.length; i++) {
    const keys = new Set([tokens[i].surf, ...candsOf(tokens[i])]);
    for (const k of keys) {
      const list = glossary.firstIndex.get(k);
      if (!list) continue;
      for (const { entry, pat, sep } of list) {
        const idxs = matchAt(tokens, text, i, pat, sep);
        if (idxs) found.push({ entry, idxs, n: pat.length });
      }
    }
  }
  found.sort((a, b) => b.n - a.n || a.idxs[0] - b.idxs[0]);
  const used = new Set();
  const res = [];
  for (const m of found) {
    if (m.idxs.some((i) => used.has(i))) continue;
    m.idxs.forEach((i) => used.add(i));
    res.push({ entry: m.entry, idxs: m.idxs });
  }
  return res.sort((a, b) => a.idxs[0] - b.idxs[0]);
}

// ── Предложение вокруг позиции ────────────────────────────────────────────
const ABBR = /\b(?:Mr|Mrs|Ms|Dr|St|Prof|Jr|Sr|vs|etc)\./g;

/** [начало, конец) предложения, содержащего позицию pos. */
export function sentenceAt(text, pos) {
  const masked = text.replace(ABBR, (m) => m.slice(0, -1) + "\u0001");
  const re = /[^.!?…]+(?:[.!?…]+["”’')\]]*|$)\s*/g;
  let m;
  while ((m = re.exec(masked))) {
    const s = m.index;
    const e = s + m[0].length;
    if (pos >= s && pos < e) {
      let end = e;
      while (end > s && /\s/.test(text[end - 1])) end--;
      return [s, end];
    }
    if (m[0].length === 0) re.lastIndex++;
  }
  return [0, text.length];
}

/** Предложения текста по порядку (тот же способ деления, что у sentenceAt). */
export function* sentencesOf(text) {
  const masked = text.replace(ABBR, (m) => m.slice(0, -1) + "\u0001");
  const re = /[^.!?…]+(?:[.!?…]+["”’')\]]*|$)\s*/g;
  let m;
  while ((m = re.exec(masked))) {
    if (m[0].length === 0) {
      re.lastIndex++;
      continue;
    }
    let end = m.index + m[0].length;
    while (end > m.index && /\s/.test(text[end - 1])) end--;
    if (end > m.index) yield text.slice(m.index, end);
  }
}

// ── Расстояние Левенштейна (для режима «Написание») ───────────────────────
export function distance(a, b) {
  const m = a.length;
  const n = b.length;
  const d = Array.from({ length: m + 1 }, (_, i) => [i, ...Array(n).fill(0)]);
  for (let j = 1; j <= n; j++) d[0][j] = j;
  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      d[i][j] = Math.min(d[i - 1][j] + 1, d[i][j - 1] + 1, d[i - 1][j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
    }
  }
  return d[m][n];
}
