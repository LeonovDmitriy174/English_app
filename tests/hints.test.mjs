import test from "node:test";
import assert from "node:assert/strict";
import { hintMask, maxHints, letterCount, maskWord } from "../js/hints.js";

test("подсказка по ступеням: открываются первые буквы", () => {
  assert.equal(hintMask("grow", 0), "_ _ _ _");
  assert.equal(hintMask("grow", 1), "g _ _ _");
  assert.equal(hintMask("grow", 2), "g r _ _");
  assert.equal(hintMask("grow", 9), "g r o w");
});

test("подсказка для фразы и слова со знаками: пробелы и знаки на месте", () => {
  assert.equal(hintMask("give up", 1), "g _ _ _   _ _");
  assert.equal(hintMask("give up", 4), "g i v e   _ _");
  assert.equal(hintMask("ice-cream", 2), "i c _ - _ _ _ _ _");
  assert.equal(hintMask("don't", 1), "d _ _ ' _");
});

test("ступеней подсказки не больше половины букв", () => {
  assert.equal(letterCount("give up"), 6);
  assert.equal(maxHints("grow"), 2);
  assert.equal(maxHints("go"), 1);
  assert.equal(maxHints("a"), 1);
  assert.equal(maxHints("give up"), 3);
  assert.equal(maxHints("extraordinary"), 6);
});

test("закрытие слова в определении: все формы", () => {
  assert.deepEqual(maskWord("to grow bigger over time", "grow"), { text: "to ___ bigger over time", masked: 1 });
  assert.equal(maskWord("he grew up; the plants are growing; fully grown", "grow").masked, 3);
  assert.equal(maskWord("he grew up; the plants are growing; fully grown", "grow").text, "he ___ up; the plants are ___; fully ___");
  assert.equal(maskWord("Growth is when things get bigger", "grow").masked, 0, "однокоренное слово другого вида не закрывается");
});

test("закрытие слова: нет совпадений, фраза, частицы", () => {
  assert.deepEqual(maskWord("a small animal", "dog"), { text: "a small animal", masked: 0 });
  assert.equal(maskWord("to stop trying; to give in", "give up").text, "to stop trying; to ___ in");
  assert.equal(maskWord("to wake up from sleep", "wake up").text, "to ___ up from sleep", "частица остаётся");
  assert.equal(maskWord("having woken, she got up", "wake up").text, "having ___, she got up");
});

test("закрытие слова: регистр и апостроф", () => {
  assert.equal(maskWord("Dog is a pet. The dog’s tail.", "dog").text, "___ is a pet. The ___ tail.");
});
