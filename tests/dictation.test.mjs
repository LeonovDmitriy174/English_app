import test from "node:test";
import assert from "node:assert/strict";
import { compareDictation, dictationPool, pickDictation, isTypo, MIN_WORDS, MAX_WORDS } from "../js/dictation.js";

const S = "The old man was walking slowly along the river.";
const ctxOf = (s, word) => ({ s, a: s.indexOf(word), b: s.indexOf(word) + word.length });
const kinds = (r) => r.parts.map((p) => p.kind).join(",");

test("опечатка: на одну букву, у длинных слов на две; короткие слова не путаем", () => {
  assert.ok(isTypo("walking", "walkin"));
  assert.ok(isTypo("beautiful", "beatiful"));
  assert.ok(isTypo("understanding", "understandng"));
  assert.ok(!isTypo("in", "on"), "короткие слова — разные слова");
  assert.ok(!isTypo("cat", "dog"));
  assert.ok(!isTypo("same", "same"));
});

test("всё записано верно: регистр, знаки и апострофы не важны", () => {
  const r = compareDictation("the old man was walking slowly along the river", ctxOf(S, "walking"));
  assert.equal(r.verdict, "ok");
  assert.equal(r.exact, 9);
  assert.equal(r.score, 1);
  assert.equal(r.key, "ok");
  assert.equal(kinds(r), "ok,ok,ok,ok,ok,ok,ok,ok,ok");
  assert.equal(compareDictation("I don’t know.", ctxOf("I don't know.", "know")).verdict, "ok", "разные апострофы");
});

test("разбор сохраняет знаки препинания предложения", () => {
  const r = compareDictation("", ctxOf("“Well, I know,” she said.", "know"));
  assert.equal(r.lead, "“");
  assert.deepEqual(r.parts.map((p) => p.word + p.tail), ["Well, ", "I ", "know,” ", "she ", "said."]);
});

test("пропущенное слово видно как «miss», лишнее как «extra»", () => {
  const r = compareDictation("The old man walking slowly along the river", ctxOf(S, "walking"));
  assert.equal(kinds(r), "ok,ok,ok,miss,ok,ok,ok,ok,ok");
  assert.equal(r.parts[3].word, "was");
  const e = compareDictation("The old man was walking very slowly along the river", ctxOf(S, "walking"));
  assert.equal(kinds(e), "ok,ok,ok,ok,ok,extra,ok,ok,ok,ok");
  assert.equal(e.parts[5].typed, "very");
  assert.equal(e.extra, 1);
});

test("опечатка в слове, а не потеря слова", () => {
  const r = compareDictation("The old man was walkin slowly along the river", ctxOf(S, "walking"));
  assert.equal(r.parts[4].kind, "typo");
  assert.equal(r.parts[4].typed, "walkin");
  assert.equal(r.key, "typo");
  assert.equal(r.verdict, "near", "слово карточки с опечаткой — уровень не меняется");
});

test("другое слово на месте верного — «wrong»", () => {
  const r = compareDictation("The old man was running slowly along the river", ctxOf(S, "walking"));
  assert.equal(r.parts[4].kind, "wrong");
  assert.equal(r.parts[4].word, "walking");
  assert.equal(r.parts[4].typed, "running");
  assert.equal(r.key, "no");
  assert.equal(r.verdict, "no", "слово карточки не вспомнили");
});

test("слово карточки верно, а остальное с ошибками: ok при 80% и выше, near при половине", () => {
  const ok = compareDictation("The old man was walking slowly along a river", ctxOf(S, "walking")); // 8 из 9
  assert.equal(ok.verdict, "ok");
  const middle = compareDictation("A old tree was walking quickly under a lake", ctxOf(S, "walking")); // 3 из 9: old, was, walking
  assert.equal(middle.key, "ok");
  assert.ok(middle.score < 0.5);
  assert.equal(middle.verdict, "no");
  const half = compareDictation("The old men was walking quickly along a river", ctxOf(S, "walking")); // 6 верных и опечатка men: 6,5 из 9
  assert.equal(half.verdict, "near");
});

test("пустой ответ и ответ не по теме", () => {
  assert.equal(compareDictation("", ctxOf(S, "walking")).verdict, "no");
  assert.equal(compareDictation("   ", ctxOf(S, "walking")).verdict, "no");
  const r = compareDictation("hello there", ctxOf(S, "walking"));
  assert.equal(r.verdict, "no");
  assert.equal(r.exact, 0);
});

test("слово карточки может быть фразой из нескольких слов", () => {
  const s = "He decided to give up smoking last year.";
  const full = compareDictation("He decided to give up smoking last year", { s, a: s.indexOf("give"), b: s.indexOf("smoking") - 1 });
  assert.equal(full.verdict, "ok");
  const part = compareDictation("He decided to give in smoking last year", { s, a: s.indexOf("give"), b: s.indexOf("smoking") - 1 });
  assert.equal(part.key, "no");
});

test("выравнивание не сдвигает остальные слова после пропуска", () => {
  const r = compareDictation("The man was walking slowly along the river", ctxOf(S, "walking"));
  assert.equal(r.parts.filter((p) => p.kind === "miss").length, 1);
  assert.equal(r.parts.find((p) => p.kind === "miss").word, "old");
  assert.equal(r.exact, 8);
});

test("предложения для диктанта: ни слишком коротких, ни длинных, ни с цифрами", () => {
  const pool = [{ s: "Go home." }, { s: "The old man was walking slowly along the river." }, { s: "It was 1984 and the clocks were striking thirteen." }, { s: Array(MAX_WORDS + 3).fill("word").join(" ") + "." }];
  assert.deepEqual(dictationPool(pool).map((c) => c.s), ["The old man was walking slowly along the river."]);
  assert.ok(MIN_WORDS < MAX_WORDS);
});

test("предложение выбирается не то, что было в прошлый раз", () => {
  const pool = [{ s: "The old man was walking slowly along." }, { s: "A tall tree stood near the quiet river." }];
  for (let i = 0; i < 20; i++) assert.equal(pickDictation(pool, { last: pool[0].s, rnd: () => i / 20 }).s, pool[1].s);
  assert.equal(pickDictation([pool[0]], { last: pool[0].s }).s, pool[0].s, "единственное предложение берётся снова");
  assert.equal(pickDictation([{ s: "Go." }]), null);
});
