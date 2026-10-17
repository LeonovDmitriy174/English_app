import test from "node:test";
import assert from "node:assert/strict";
import { Glossary } from "../js/lex.js";
import { dueInDays, studyDay } from "../js/levels.js";
import {
  SIZE,
  MIN_LIST,
  BLOCK,
  OVERLAP,
  ADD_LEVEL,
  SLOW_LEVEL,
  EXAM_SIZE,
  FUNCTION_WORDS,
  isContentPos,
  usable,
  parseOwnList,
  resolveWords,
  rankFromDictionary,
  buildRanking,
  blockCount,
  blockOf,
  blockRange,
  startRank,
  pickExam,
  examVerdict,
  decide,
  addedSrs,
  emptyState,
  normalizeState,
  mergeStates,
  markChecked,
  recordExam,
  placeInList,
  overview,
} from "../js/freqdeck.js";

const seeded = (seed = 1) => () => ((seed = (seed * 1664525 + 1013904223) >>> 0) / 2 ** 32);
const w = (word, over = {}) => ({ t: "w", w: word, pos: "noun", ru: `перевод ${word}`, en: `a ${word}`, ...over });

test("размер списка пять тысяч, тест после каждой тысячи, перекрытие два слова", () => {
  assert.equal(SIZE, 5000);
  assert.equal(BLOCK, 1000);
  assert.equal(OVERLAP, 2);
  assert.equal(EXAM_SIZE, 200);
  assert.ok(MIN_LIST > 0 && MIN_LIST < BLOCK, "совсем короткий список не предлагается");
  assert.equal(ADD_LEVEL, 6);
  assert.equal(SLOW_LEVEL, 4);
});

test("служебные слова: предлоги, союзы, местоимения, артикли, вспомогательные глаголы и числительные исключены", () => {
  for (const f of ["the", "a", "of", "in", "with", "and", "but", "because", "he", "they", "this", "that", "be", "have", "do", "will", "would", "can", "not", "very", "one", "two", "first", "how", "what", "oh"]) {
    assert.ok(FUNCTION_WORDS.has(f), `${f} должно быть служебным`);
  }
  for (const c of ["time", "people", "like", "need", "make", "go", "good", "back", "away", "never", "always", "thing", "last", "work", "hand"]) {
    assert.ok(!FUNCTION_WORDS.has(c), `${c} содержательное слово`);
  }
});

test("часть речи: содержательные существительные, глаголы, прилагательные и наречия; предлоги и союзы нет", () => {
  for (const p of ["noun", "verb", "adjective", "adverb", "noun, verb", "n", "v", "adj", "adv", "preposition, adverb", "Noun"]) assert.ok(isContentPos(p), p);
  for (const p of ["preposition", "conjunction", "pronoun", "determiner", "article", "numeral", "interjection", "particle", "prep", "conj"]) assert.ok(!isContentPos(p), p);
  assert.ok(isContentPos(""), "без части речи слово не теряем");
  assert.ok(isContentPos(undefined));
});

test("usable: слово с переводом и содержательной частью речи; фразы, служебные слова и записи без перевода нет", () => {
  assert.ok(usable(w("time")));
  assert.ok(usable(w("tantrum", { ru: "", rm: "вспышка гнева" })), "автоперевод считается переводом");
  assert.ok(!usable(w("time", { ru: "", rm: "", en: "a period" })), "только определение: не спросить переводом");
  assert.ok(!usable(w("of", { pos: "preposition" })));
  assert.ok(!usable(w("have", { pos: "verb" })), "служебное слово даже с частью речи «verb»");
  assert.ok(!usable(w("kick the bucket", { t: "id" })));
  assert.ok(!usable(w("up", { pos: "preposition, adverb" })));
  assert.ok(!usable(w("x")), "односимвольные не берём");
  assert.ok(!usable(null));
});

test("свой список: слово в строке, с номером, CSV, заголовок и повторы", () => {
  const r = parseOwnList("word\nthe\ntime\nTime\n\n# комментарий\nyear\n");
  assert.deepEqual(r.words, ["the", "time", "year"], "заголовок пропущен, порядок файла, повтор убран, регистр сведён");
  const csv = parseOwnList("rank;word\n3;year\n1;time\n2;people\n");
  assert.deepEqual(csv.words, ["time", "people", "year"], "с номерами слова идут по номеру");
  const mixed = parseOwnList("1,time,0.0047\n2,people,0.0040\n3,year,0.0031");
  assert.deepEqual(mixed.words, ["time", "people", "year"]);
  const tabs = parseOwnList("112\ttime\n7\tpeople");
  assert.deepEqual(tabs.words, ["people", "time"]);
  const fancy = parseOwnList("don’t\n'quoted'\n-dash-\n");
  assert.deepEqual(fancy.words, ["don't", "quoted", "dash"]);
  assert.deepEqual(parseOwnList("rank\nword\ntime").words, ["word", "time"], "заголовок только в первой строке");
  assert.deepEqual(parseOwnList("time\nword\n").words, ["time", "word"], "обычное слово «word» не первой строкой остаётся словом");
});

test("свой список: строки без слова пропускаются и считаются, огромные номера не ломают разбор", () => {
  const r = parseOwnList("123\n---\ntime\n999999999 people");
  assert.deepEqual(r.words, ["time", "people"]);
  assert.equal(r.skipped, 2);
  assert.deepEqual(parseOwnList("").words, []);
  assert.deepEqual(parseOwnList(null).words, []);
});

const glossary = new Glossary([
  w("time", { z: 6.3 }),
  w("people", { z: 6.2, f: ["peoples"] }),
  w("walk", { pos: "verb", z: 5.2, f: ["walked"] }),
  w("good", { pos: "adjective", z: 6.1 }),
  w("the", { pos: "article", z: 7.7 }),
  w("have", { pos: "verb", z: 7.0 }),
  w("of", { pos: "preposition", z: 7.5 }),
  w("zebra", { z: 3.0 }),
  w("gloomy", { pos: "adjective", z: 3.0 }),
  w("nameless", { ru: "", rm: "", z: 4.0 }),
  w("kick the bucket", { t: "id", z: undefined }),
]);

test("resolveWords: порядок списка, только подходящие, без повторов, формы приводятся к записи", () => {
  const out = resolveWords(glossary, ["the", "time", "of", "unknown", "walked", "walk", "time", "nameless", "good"]);
  assert.deepEqual(out.map((e) => e.w), ["time", "walk", "good"]);
  assert.deepEqual(resolveWords(glossary, ["time", "people", "good"], 2).map((e) => e.w), ["time", "people"], "не больше лимита");
});

test("порядок по частоте из словаря: по убыванию z, без служебных слов и фраз", () => {
  const out = rankFromDictionary(glossary);
  assert.deepEqual(out.slice(0, 4).map((e) => e.w), ["time", "people", "good", "walk"]);
  assert.ok(!out.some((e) => ["the", "of", "have", "nameless", "kick the bucket"].includes(e.w)));
});

test("одинаковая частота: порядок не по алфавиту, но один и тот же при каждом запуске", () => {
  const name = (i) => `word${String.fromCharCode(97 + (i % 26))}${String.fromCharCode(97 + ((i * 7) % 26))}${String.fromCharCode(97 + Math.floor(i / 26))}`;
  const many = Array.from({ length: 40 }, (_, i) => w(name(i), { z: 4.0 }));
  const g = new Glossary(many);
  const a = rankFromDictionary(g).map((e) => e.w);
  const b = rankFromDictionary(new Glossary(many.slice().reverse())).map((e) => e.w);
  assert.equal(a.length, 40);
  assert.deepEqual(a, b, "порядок не зависит от порядка записей");
  assert.notDeepEqual(a, [...a].sort(), "и не алфавитный");
});

test("buildRanking: свой список главнее, потом файл, потом частота из словаря", () => {
  const file = { words: ["walk", "time"] };
  const ownList = { words: ["good", "people"] };
  assert.deepEqual(buildRanking({ glossary, own: ownList, file }), { source: "own", items: resolveWords(glossary, ownList.words) });
  assert.equal(buildRanking({ glossary, file }).source, "file");
  assert.deepEqual(buildRanking({ glossary, file }).items.map((e) => e.w), ["walk", "time"]);
  assert.equal(buildRanking({ glossary }).source, "dict");
  assert.equal(buildRanking({ glossary, own: { words: [] }, file: { words: [] } }).source, "dict", "пустые списки не считаются");
});

test("тысячи: границы, номер тысячи по слову, последняя может быть короче", () => {
  assert.equal(blockCount(5000), 5);
  assert.equal(blockCount(4300), 5);
  assert.equal(blockCount(0), 0);
  assert.equal(blockOf(1), 1);
  assert.equal(blockOf(1000), 1);
  assert.equal(blockOf(1001), 2);
  assert.equal(blockOf(5000), 5);
  assert.deepEqual(blockRange(2, 5000), { k: 2, from: 1001, to: 2000 });
  assert.deepEqual(blockRange(5, 4300), { k: 5, from: 4001, to: 4300 });
});

test("продолжение: после ста слов заход начинается с 98-го, с самого начала с первого", () => {
  assert.equal(startRank(0), 1);
  assert.equal(startRank(100), 98);
  assert.equal(startRank(2), 1);
  assert.equal(startRank(3), 1);
  assert.equal(startRank(4), 2);
  assert.equal(startRank(2500), 2498);
});

test("тест: двести случайных слов своей тысячи, без повторов", () => {
  const items = Array.from({ length: 2500 }, (_, i) => w(`w${i}`));
  const exam = pickExam(items, 2, seeded(5));
  assert.equal(exam.length, 200);
  assert.equal(new Set(exam.map((x) => x.rank)).size, 200);
  assert.ok(exam.every((x) => x.rank >= 1001 && x.rank <= 2000 && x.entry === items[x.rank - 1]));
  assert.notDeepEqual(exam.map((x) => x.rank), exam.map((x) => x.rank).sort((a, b) => a - b), "порядок случайный");
  assert.notDeepEqual(pickExam(items, 2, seeded(6)).map((x) => x.rank), exam.map((x) => x.rank), "каждый раз другая выборка");
  const last = pickExam(items, 3, seeded(1));
  assert.equal(last.length, 200);
  assert.ok(last.every((x) => x.rank > 2000 && x.rank <= 2500));
  assert.equal(pickExam(items.slice(0, 2050), 3, seeded(1)).length, 50, "в короткой последней тысяче спрашиваются все слова");
});

test("порог теста: 95% верных; 190 из 200 сдано, 189 нет", () => {
  assert.deepEqual(examVerdict(190, 200), { share: 0.95, pass: true });
  assert.equal(examVerdict(189, 200).pass, false);
  assert.equal(examVerdict(200, 200).pass, true);
  assert.equal(examVerdict(0, 0).pass, false);
  assert.equal(examVerdict(19, 20).pass, true);
  assert.equal(examVerdict(18, 20).pass, false);
  assert.equal(examVerdict(48, 50).pass, true, "47,5 округляется вверх до 48");
  assert.equal(examVerdict(47, 50).pass, false);
});

test("решение по ответу: добавить знакомым, добавить новым, оставить, опустить", () => {
  const known = { srs: { lv: 7 } };
  const fresh = { srs: { lv: 0 } };
  assert.deepEqual(decide({ card: undefined, ok: true }), { kind: "add", lv: 6 });
  assert.deepEqual(decide({ card: undefined, ok: true, slow: true }), { kind: "add", lv: 4 });
  assert.deepEqual(decide({ card: known, ok: true }), { kind: "keep" }, "верно и слово уже есть: ничего не происходит");
  assert.deepEqual(decide({ card: fresh, ok: true }), { kind: "keep" });
  assert.deepEqual(decide({ card: undefined, ok: false }), { kind: "fresh" });
  assert.deepEqual(decide({ card: known, ok: false }), { kind: "drop" });
  assert.deepEqual(decide({ card: fresh, ok: false }), { kind: "keep" }, "новое слово остаётся новым");
  assert.deepEqual(decide({ card: { srs: { lv: 1 } }, ok: false }), { kind: "drop" });
});

test("слово, добавленное верным ответом: шестой уровень, срок от 3 до 5 суток, разведён по дням", () => {
  const now = new Date(2026, 9, 17, 13, 0).getTime();
  const days = new Set();
  for (let seed = 1; seed <= 60; seed++) {
    const s = addedSrs(now, 6, { rng: () => (seed * 0.6180339887) % 1 });
    assert.equal(s.lv, 6);
    assert.equal(s.v, 2);
    assert.equal(s.reps, 1);
    assert.equal(s.lapses, 0);
    assert.equal(s.last, now);
    assert.ok([3, 4, 5].some((n) => s.due === dueInDays(now, n)), `срок ${new Date(s.due)} не из 3–5 суток`);
    days.add(studyDay(s.due));
  }
  assert.equal(days.size, 3, "слова разошлись на три разных дня");
  const slow = addedSrs(now, 4, { rng: () => 0.99 });
  assert.equal(slow.lv, 4);
  assert.equal(slow.due, dueInDays(now, 2));
  assert.equal(addedSrs(now, 4, { rng: () => 0 }).due, dueInDays(now, 1));
});

test("состояние: мусор в хранилище не ломает, номер слова не идёт назад", () => {
  assert.deepEqual(normalizeState(null), emptyState());
  assert.deepEqual(normalizeState("abc"), emptyState());
  const s = normalizeState({ done: "x", last: 5, tests: { 1: { pass: true, best: 7 }, "x": {}, 99999: { pass: true }, 2: null } });
  assert.equal(s.done, 0);
  assert.equal(s.last, "");
  assert.deepEqual(Object.keys(s.tests), ["1"]);
  assert.equal(s.tests[1].best, 1, "доля не больше единицы");
  const st = emptyState();
  markChecked(st, 98, "alpha");
  markChecked(st, 100, "beta");
  markChecked(st, 99, "gamma");
  assert.deepEqual([st.done, st.last], [100, "beta"], "перекрытие не откатывает место");
});

test("итог теста: сданный тест не отменяется неудачной пересдачей, лучший результат остаётся", () => {
  const st = emptyState();
  recordExam(st, 1, 180, 200, 1000);
  assert.deepEqual(st.tests[1], { pass: false, best: 0.9, tries: 1, at: 1000 });
  recordExam(st, 1, 192, 200, 2000);
  assert.deepEqual(st.tests[1], { pass: true, best: 0.96, tries: 2, at: 2000 });
  recordExam(st, 1, 100, 200, 3000);
  assert.equal(st.tests[1].pass, true);
  assert.equal(st.tests[1].best, 0.96);
  assert.equal(st.tests[1].tries, 3);
});

test("слияние состояний из копии: дальше зашедшая проверка и лучшие результаты", () => {
  const a = { done: 300, last: "aa", tests: { 1: { pass: false, best: 0.9, tries: 1, at: 5 } } };
  const b = { done: 120, last: "bb", tests: { 1: { pass: true, best: 0.97, tries: 2, at: 9 }, 2: { pass: false, best: 0.5, tries: 1, at: 4 } } };
  const m = mergeStates(a, b);
  assert.equal(m.done, 300);
  assert.equal(m.last, "aa");
  assert.deepEqual(m.tests[1], { pass: true, best: 0.97, tries: 2, at: 9 });
  assert.equal(m.tests[2].best, 0.5);
  assert.deepEqual(mergeStates(undefined, b).tests[2], b.tests[2]);
});

test("место в списке после его смены: идём за словом, если слово исчезло, остаёмся на номере, не выходим за список", () => {
  const items = ["a", "b", "c", "d", "e"].map((x) => w(x));
  assert.equal(placeInList({ done: 3, last: "c" }, items), 3, "всё на месте");
  assert.equal(placeInList({ done: 3, last: "d" }, items), 4, "слово теперь четвёртое");
  assert.equal(placeInList({ done: 4, last: "zzz" }, items), 4, "слова нет: прежний номер");
  assert.equal(placeInList({ done: 90, last: "zzz" }, items), 5, "не дальше конца списка");
  assert.equal(placeInList({ done: 0, last: "" }, items), 0);
  assert.equal(placeInList({ done: 5, last: "e" }, []), 0);
});

test("сводка для экрана: сколько проверено в каждой тысяче, у какой можно сдать тест, весь ли список пройден", () => {
  const st = emptyState();
  st.done = 1500;
  st.tests[1] = { pass: true, best: 0.96, tries: 1, at: 1 };
  let o = overview(st, 5000);
  assert.equal(o.next, 1498);
  assert.equal(o.blocks.length, 5);
  assert.deepEqual(o.blocks.map((b) => [b.checked, b.complete]), [[1000, true], [500, false], [0, false], [0, false], [0, false]]);
  assert.equal(o.blocks[0].test.pass, true);
  assert.equal(o.finished, false);
  assert.equal(o.mastered, false);
  st.done = 5000;
  for (let k = 1; k <= 5; k++) st.tests[k] = { pass: true, best: 1, tries: 1, at: 1 };
  o = overview(st, 5000);
  assert.equal(o.finished, true);
  assert.equal(o.mastered, true);
  const short = overview({ ...emptyState(), done: 4300 }, 4300);
  assert.equal(short.blocks[4].size, 300);
  assert.equal(short.finished, true);
  assert.equal(overview(emptyState(), 0).mastered, false);
  assert.equal(overview({ ...emptyState(), done: 9000 }, 5000).done, 5000, "место не бывает дальше списка");
});
