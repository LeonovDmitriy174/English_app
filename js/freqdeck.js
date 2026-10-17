// freqdeck.js — «Пополнить словарь»: частотный список, порядок проверки, тесты по тысячам. Чистые функции без DOM (tests/freqdeck.test.mjs).
//
// Идея. Слова идут в порядке частоты, от самых частых. По каждому слову один вопрос в привычном виде (английское слово, четыре
// перевода). Что делает ответ:
//   верно, слова нет в словаре   → слово добавляется сразу «знакомым» (ADD_LEVEL, "Знаю"); если ответили очень медленно, то SLOW_LEVEL
//   верно, слово уже в словаре    → ничего не меняется
//   неверно, слова нет в словаре  → слово добавляется как новое
//   неверно, слово уже в словаре  → его уровень падает на два (как при любой ошибке, levels.js); новое слово остаётся новым
// Закончить можно в любой момент; следующий заход начинается на OVERLAP слова раньше места, где остановились (после 100 слов с 98-го),
// чтобы было видно, что вы идёте по списку дальше. После каждой тысячи доступен тест: EXAM_SIZE случайных слов этой тысячи, нужно
// не меньше PASS_SHARE верных. Не сдали — ничего не откатывается, приложение лишь советует повторить слова и пересдать.
//
// Откуда список. Порядок слов задаёт файл data/freq.json (его собирает tools/build_freq.py из вашего словаря и частот слов wordfreq,
// формы слова складываются: walk + walked + walking). Свой список (например, выгрузка с сайта, которым вы пользуетесь) главнее:
// если он загружен, берётся только он. Пока нет ни того ни другого, слова упорядочены по частоте из словаря (она округлена до 0,1,
// поэтому порядок внутри одной ступени условный).
import { KNOWN, LADDER, WAITS, dueInDays } from "./levels.js";

export const SIZE = 5000; // сколько слов в списке
export const BLOCK = 1000; // после каждой такой порции тест
export const OVERLAP = 2; // на сколько слов раньше места остановки начинается следующий заход
export const ADD_LEVEL = KNOWN; // верный ответ: слово сразу «знакомое» (3 дня между повторами)
export const SLOW_LEVEL = 4; // верный, но очень медленный ответ: слово ещё «учится» (сутки)
export const MIN_LIST = 50; // в списке короче этого проверять нечего (в словаре почти нет слов с переводом)
export const EXAM_SIZE = 200;
export const PASS_SHARE = 0.95;
export const FREQ_TASK = "freq"; // метка этих ответов в журнале (js/progress.js не считает их «повторениями»)

// ── Служебные слова ─────────────────────────────────────────────────────────
// В список идут только содержательные слова (существительные, глаголы, прилагательные, наречия). Предлоги, союзы, местоимения,
// артикли и другие определители, вспомогательные и модальные глаголы, числительные, вопросительные слова, междометия и
// чисто грамматические наречия (not, very, too) исключены. Список правится здесь: между маркерами одно слово через пробел.
// FUNCTION-WORDS-BEGIN
const FUNCTION_SRC = `
a an the this that these those some any no every each all both either neither another other such many much more most less least few fewer
several enough
i me my mine myself you your yours yourself yourselves he him his himself she her hers herself it its itself we us our ours ourselves
they them their theirs themselves who whom whose which what whatever whoever whichever whomever someone somebody something anyone anybody
anything everyone everybody everything nobody nothing none one ones oneself
of in on at by for with about against between into through during before after above below to from under over onto upon within without
across along around behind beside besides beyond near toward towards inside outside despite throughout except per via till until since
unlike among amongst beneath up down out off
and or but nor so yet because although though while whereas if unless whether than as
be am is are was were been being have has had having do does did done doing can could may might must shall should will would ought cannot
one two three four five six seven eight nine ten eleven twelve thirteen fourteen fifteen sixteen seventeen eighteen nineteen twenty thirty
forty fifty sixty seventy eighty ninety hundred thousand million billion zero first second third fourth fifth
how when where why there here then not no yes very too also just only even however therefore thus hence moreover whenever wherever
please okay ok oh ah hey hi hello wow yeah yep nope uh um hmm huh ha hah ooh aw alas
s t ll re ve d m
`;
// FUNCTION-WORDS-END
export const FUNCTION_WORDS = new Set(FUNCTION_SRC.split(/\s+/).filter(Boolean));

const OPEN_POS = new Set(["noun", "verb", "adjective", "adverb", "n", "v", "adj", "adv"]);

/** Содержательная ли часть речи. pos — строка словаря: «noun», «noun, verb», «n», «adjective»; пустая считается содержательной. */
export function isContentPos(pos) {
  const parts = String(pos || "").toLowerCase().split(/[\s,;/]+/).filter(Boolean);
  return !parts.length || parts.some((p) => OPEN_POS.has(p));
}

export const hasTranslation = (e) => !!(e && (e.ru || e.rm));

/** Годится ли запись словаря для списка: слово (не фраза), есть перевод, содержательная часть речи, не служебное слово. */
export const usable = (e) => !!e && e.t === "w" && hasTranslation(e) && isContentPos(e.pos) && !FUNCTION_WORDS.has(e.w) && /^[a-z][a-z'-]+$/.test(e.w);

// ── Свой список ─────────────────────────────────────────────────────────────
const WORD_IN_LINE = /[A-Za-z][A-Za-z'’-]*/;
const NUMBER_IN_LINE = /(?:^|[^A-Za-z\d.])(\d{1,6})(?![A-Za-z\d])/;
export const MAX_OWN_LINES = 50000;
const HEADER_WORDS = new Set(["word", "words", "lemma", "rank", "frequency", "freq", "count", "english", "term", "token", "number", "no"]);

/**
 * Разбирает выгрузку списка слов (txt, csv, tsv). В строке ищется слово и, если есть, номер по частоте: «time», «time 112», «112;time»,
 * «1,time,0.0047». Первая строка-заголовок («rank;word») пропускается. Если номера есть, слова упорядочиваются по ним (строки без номера идут после, в своём порядке), иначе порядок файла.
 * Повторы убираются, заголовки и пустые строки пропускаются. Возвращает { words, lines, skipped }.
 */
export function parseOwnList(text) {
  const rows = [];
  let lines = 0;
  let skipped = 0;
  for (const raw of String(text || "").split(/\r?\n/).slice(0, MAX_OWN_LINES)) {
    const line = raw.trim();
    if (!line || line.startsWith("#")) continue;
    lines += 1;
    if (lines === 1 && (line.match(/[A-Za-z]+/g) || []).every((t) => HEADER_WORDS.has(t.toLowerCase())) && /[A-Za-z]/.test(line)) {
      skipped += 1;
      continue;
    }
    const m = WORD_IN_LINE.exec(line);
    if (!m) {
      skipped += 1;
      continue;
    }
    const word = m[0].toLowerCase().replace(/’/g, "'").replace(/^['-]+|['-]+$/g, "");
    if (!word) {
      skipped += 1;
      continue;
    }
    const n = NUMBER_IN_LINE.exec(line);
    rows.push({ word, rank: n ? +n[1] : Infinity, at: rows.length });
  }
  if (rows.some((r) => Number.isFinite(r.rank))) rows.sort((a, b) => a.rank - b.rank || a.at - b.at);
  const seen = new Set();
  const words = [];
  for (const r of rows) {
    if (seen.has(r.word)) continue;
    seen.add(r.word);
    words.push(r.word);
  }
  return { words, lines, skipped };
}

// ── Порядок слов ────────────────────────────────────────────────────────────
/** Устойчивый «случайный» порядок слов с одинаковой частотой (не по алфавиту): хэш FNV-1a. */
function hash(s) {
  let x = 2166136261;
  for (let i = 0; i < s.length; i++) x = Math.imul(x ^ s.charCodeAt(i), 16777619) >>> 0;
  return x;
}

/** Записи словаря по списку слов, в том же порядке: только подходящие (usable), без повторов; форма слова приводится к записи. */
export function resolveWords(glossary, words, limit = SIZE) {
  const out = [];
  const seen = new Set();
  for (const w of words || []) {
    const e = glossary.byId.get(`w:${w}`) || glossary.lookupWord(w);
    if (!e || seen.has(e.id) || !usable(e)) continue;
    seen.add(e.id);
    out.push(e);
    if (out.length >= limit) break;
  }
  return out;
}

/** Слова словаря по убыванию частоты из словаря (запись z, шкала Zipf с шагом 0,1): запасной порядок, пока нет списка. */
export function rankFromDictionary(glossary, limit = SIZE) {
  return glossary.list
    .filter((e) => Number.isFinite(e.z) && usable(e))
    .sort((a, b) => b.z - a.z || hash(a.w) - hash(b.w))
    .slice(0, limit);
}

/**
 * Список для проверки. own — загруженный вами список { words }, file — data/freq.json { words }.
 * Приоритет такой: свой список (если загружен, то только он), затем файл, затем частота из словаря.
 * Возвращает { source: "own" | "file" | "dict", items: [записи словаря] }; номер слова в списке это индекс + 1.
 */
export function buildRanking({ glossary, own = null, file = null, limit = SIZE } = {}) {
  if (own?.words?.length) return { source: "own", items: resolveWords(glossary, own.words, limit) };
  if (file?.words?.length) return { source: "file", items: resolveWords(glossary, file.words, limit) };
  return { source: "dict", items: rankFromDictionary(glossary, limit) };
}

// ── Тысячи и тесты ──────────────────────────────────────────────────────────
export const blockCount = (total) => Math.ceil(Math.max(0, total) / BLOCK);
export const blockOf = (rank) => Math.ceil(rank / BLOCK);
export const blockRange = (k, total) => ({ k, from: (k - 1) * BLOCK + 1, to: Math.min(k * BLOCK, total) });

/** С какого слова начинается заход, если последним проверено done-е: на OVERLAP слов раньше (после 100-го с 98-го). */
export const startRank = (done) => (done > 0 ? Math.max(1, done - OVERLAP) : 1);

/** Тест: EXAM_SIZE случайных слов k-й тысячи. rng нужен только тестам. Возвращает [{ rank, entry }]. */
export function pickExam(items, k, rng = Math.random, n = EXAM_SIZE) {
  const { from, to } = blockRange(k, items.length);
  const pool = [];
  for (let r = from; r <= to; r++) pool.push({ rank: r, entry: items[r - 1] });
  for (let i = pool.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [pool[i], pool[j]] = [pool[j], pool[i]];
  }
  return pool.slice(0, n);
}

/** Итог теста: { share, pass }. Тест сдан при доле верных не меньше PASS_SHARE. */
export function examVerdict(ok, n) {
  const share = n > 0 ? ok / n : 0;
  return { share, pass: n > 0 && ok >= Math.ceil(n * PASS_SHARE - 1e-9) };
}

// ── Что делать с ответом ────────────────────────────────────────────────────
/**
 * Решение по слову. card — карточка словаря или undefined, ok — ответ верный, slow — верный, но очень медленный.
 * Возвращает { kind: "add" (lv) | "fresh" | "keep" | "drop" }.
 */
export function decide({ card, ok, slow = false }) {
  if (ok) return card ? { kind: "keep" } : { kind: "add", lv: slow ? SLOW_LEVEL : ADD_LEVEL };
  if (!card) return { kind: "fresh" };
  if (!card.srs || !(card.srs.lv > 0)) return { kind: "keep" }; // новое слово ниже не опустить
  return { kind: "drop" };
}

/**
 * Карточка для слова, добавленного верным ответом. Срок разведён на несколько дней, чтобы слова, добавленные за один заход,
 * не вернулись все в один день: для «знаю» от 3 до 5 суток, для остальных от своего срока до +1 суток.
 */
export function addedSrs(now = Date.now(), lv = ADD_LEVEL, rng = Math.random) {
  const days = WAITS[Math.min(Math.max(lv, 1), WAITS.length) - 1].days || 1;
  const extra = Math.floor(rng() * (lv >= KNOWN ? 3 : 2));
  return { lv, due: dueInDays(now, days + extra), last: now, reps: 1, lapses: 0, v: LADDER };
}

// ── Состояние ───────────────────────────────────────────────────────────────
/**
 * Что хранится (kv «freqdeck»): { v, done (номер слова, до которого дошла проверка), last (само это слово), tests }.
 * tests[k] = { pass, best (лучшая доля верных 0…1), tries, at } для k-й тысячи.
 */
export const emptyState = () => ({ v: 1, done: 0, last: "", tests: {} });

export function normalizeState(raw) {
  const s = emptyState();
  if (!raw || typeof raw !== "object") return s;
  if (Number.isFinite(raw.done) && raw.done > 0) s.done = Math.min(Math.round(raw.done), 100000);
  if (typeof raw.last === "string") s.last = raw.last.slice(0, 60);
  for (const [k, t] of Object.entries(raw.tests && typeof raw.tests === "object" ? raw.tests : {})) {
    if (!/^[1-9]\d{0,2}$/.test(k) || !t || typeof t !== "object") continue;
    const best = Number.isFinite(t.best) ? Math.min(1, Math.max(0, t.best)) : 0;
    s.tests[k] = { pass: !!t.pass, best, tries: Number.isFinite(t.tries) && t.tries > 0 ? Math.round(t.tries) : 1, at: Number.isFinite(t.at) ? t.at : 0 };
  }
  return s;
}

/** Слияние двух состояний (копия данных): дальше всех зашедшая проверка и лучшие результаты тестов. */
export function mergeStates(a, b) {
  const x = normalizeState(a);
  const y = normalizeState(b);
  const out = x.done >= y.done ? { ...x, tests: {} } : { ...y, tests: {} };
  for (const k of new Set([...Object.keys(x.tests), ...Object.keys(y.tests)])) {
    const p = x.tests[k];
    const q = y.tests[k];
    if (!p || !q) out.tests[k] = p || q;
    else out.tests[k] = { pass: p.pass || q.pass, best: Math.max(p.best, q.best), tries: Math.max(p.tries, q.tries), at: Math.max(p.at, q.at) };
  }
  return out;
}

/** Запомнить, что проверено слово номер rank. Меняет и возвращает состояние; назад не идёт. */
export function markChecked(state, rank, word) {
  if (rank > state.done) {
    state.done = rank;
    state.last = word;
  }
  return state;
}

/** Записать итог теста k-й тысячи. Меняет и возвращает состояние; сданный тест не «разсдаётся» неудачной пересдачей. */
export function recordExam(state, k, ok, n, now = Date.now()) {
  const { share, pass } = examVerdict(ok, n);
  const prev = state.tests[k];
  state.tests[k] = { pass: pass || !!prev?.pass, best: Math.max(share, prev?.best || 0), tries: (prev?.tries || 0) + 1, at: now };
  return state;
}

/**
 * Место в списке после того, как список мог измениться (собрали словарь заново, загрузили свой список): если слово, на котором
 * остановились, стоит теперь в другом месте, идём за ним, если исчезло, остаёмся на прежнем номере. Всегда в пределах списка.
 */
export function placeInList(state, items) {
  if (!state.done || !items.length) return 0;
  if (items[state.done - 1]?.w === state.last) return state.done;
  const at = state.last ? items.findIndex((e) => e.w === state.last) : -1;
  return at >= 0 ? at + 1 : Math.min(state.done, items.length);
}

/** Сводка для экрана: где остановились, по тысячам сколько проверено и как с тестом. */
export function overview(state, total) {
  const done = Math.min(state.done, total);
  const blocks = Array.from({ length: blockCount(total) }, (_, i) => {
    const r = blockRange(i + 1, total);
    const size = r.to - r.from + 1;
    const checked = Math.max(0, Math.min(size, done - (r.from - 1)));
    return { ...r, size, checked, complete: checked >= size, test: state.tests[r.k] || null };
  });
  return { done, total, next: startRank(done), blocks, finished: total > 0 && done >= total, mastered: blocks.length > 0 && blocks.every((b) => b.test?.pass) };
}
