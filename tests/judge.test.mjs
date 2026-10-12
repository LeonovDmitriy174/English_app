import test from "node:test";
import assert from "node:assert/strict";
import { judge, judgeCloze, normAnswer } from "../js/judge.js";

test("normAnswer: регистр, знаки, апострофы, пробелы", () => {
  assert.equal(normAnswer("  Give   UP! "), "give up");
  assert.equal(normAnswer("don’t"), "don't");
  assert.equal(normAnswer(null), "");
});

test("judge: верно, почти, мимо", () => {
  assert.equal(judge("Grow", "grow"), "ok");
  assert.equal(judge("grwo", "grow"), "no"); // перестановка это два исправления, для короткого слова это ошибка
  assert.equal(judge("groww", "grow"), "near");
  assert.equal(judge("", "grow"), "no");
  assert.equal(judge("apple", "grow"), "no");
});

test("judge: в длинных словах допускается две опечатки", () => {
  assert.equal(judge("acommodation", "accommodation"), "near");
  assert.equal(judge("acomodation", "accommodation"), "near");
  assert.equal(judge("acomodaton", "accommodation"), "no");
});

test("judgeCloze: верная форма из предложения", () => {
  assert.deepEqual(judgeCloze("grew", "grew", "grow"), { verdict: "ok", base: false });
});

test("judgeCloze: начальная форма вместо нужной просит второй шаг", () => {
  assert.deepEqual(judgeCloze("grow", "grew", "grow"), { verdict: "near", base: true });
  assert.deepEqual(judgeCloze("Give up", "gave up", "give up"), { verdict: "near", base: true });
  // начальная форма близка к нужной (одна буква разницы): всё равно второй шаг, а не просто «почти»
  assert.deepEqual(judgeCloze("grow", "grows", "grow"), { verdict: "near", base: true });
});

test("judgeCloze: слово совпало с формой, второго шага нет", () => {
  assert.deepEqual(judgeCloze("happy", "happy", "happy"), { verdict: "ok", base: false });
});

test("judgeCloze: пустой и неверный ответ", () => {
  assert.deepEqual(judgeCloze("", "grew", "grow"), { verdict: "no", base: false });
  assert.deepEqual(judgeCloze("apple", "grew", "grow"), { verdict: "no", base: false });
});
