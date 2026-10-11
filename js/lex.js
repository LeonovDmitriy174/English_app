// lex.js — токенизация, приведение к начальной форме, словарь, поиск фраз.
// Чистые функции без DOM: модуль проверяется в Node (tests/lex.test.mjs).

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
strike: struck
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
`;

const IRREGULAR = new Map();
for (const line of IRREGULAR_SRC.trim().split("\n")) {
  const [lemma, rest] = line.split(":");
  for (const f of rest.trim().split(/\s+/)) {
    if (!IRREGULAR.has(f)) IRREGULAR.set(f, []);
    IRREGULAR.get(f).push(lemma.trim());
  }
}

/** Возможные начальные формы слова в порядке убывания вероятности. */
export function lemmaCandidates(raw) {
  const out = [];
  const add = (x) => {
    if (x && x.length > 1 && !out.includes(x)) out.push(x);
  };
  let w = norm(raw);
  add(w);
  w = w.replace(/'s$/, "").replace(/s'$/, "s").replace(/n't$/, "").replace(/'(ll|re|ve|d|m)$/, "");
  if (w.endsWith("'")) w = w.slice(0, -1);
  add(w);
  const irr = IRREGULAR.get(w);
  if (irr) irr.forEach(add);

  const undouble = (b) => (b.length > 2 && b[b.length - 1] === b[b.length - 2] ? b.slice(0, -1) : null);

  if (w.endsWith("ies")) add(w.slice(0, -3) + "y");
  if (w.endsWith("ves")) {
    add(w.slice(0, -3) + "f");
    add(w.slice(0, -3) + "fe");
  }
  if (w.endsWith("es")) add(w.slice(0, -2));
  if (w.endsWith("s") && !w.endsWith("ss")) add(w.slice(0, -1));
  if (w.endsWith("ied")) add(w.slice(0, -3) + "y");
  if (w.endsWith("ed")) {
    const b = w.slice(0, -2);
    add(b);
    add(w.slice(0, -1));
    add(undouble(b));
  }
  if (w.endsWith("ing") && w.length > 4) {
    const b = w.slice(0, -3);
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
    add(b);
    add(w.slice(0, -1));
    add(undouble(b));
    if (w.endsWith("ier")) add(w.slice(0, -3) + "y");
  }
  if (w.endsWith("est") && w.length > 5) {
    const b = w.slice(0, -3);
    add(b);
    add(w.slice(0, -2));
    add(undouble(b));
    if (w.endsWith("iest")) add(w.slice(0, -4) + "y");
  }
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

const candsOf = (tok) => (tok.c ??= new Set(lemmaCandidates(tok.raw)));

// ── Словарь ───────────────────────────────────────────────────────────────
export class Glossary {
  constructor(entries) {
    this.list = entries.map((e) => ({ ...e, id: `${e.t}:${e.w}` }));
    this.byId = new Map(this.list.map((e) => [e.id, e]));
    this.words = new Map(); // слово или доп. форма -> запись (одиночные слова)
    this.firstIndex = new Map(); // первый токен шаблона -> [{entry, pat, sep}]
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

  /** Запись одиночного слова по форме из текста (или null). */
  lookupWord(raw) {
    for (const c of lemmaCandidates(raw)) {
      const e = this.words.get(c);
      if (e) return e;
    }
    return null;
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
