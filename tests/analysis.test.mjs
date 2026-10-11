import test from "node:test";
import assert from "node:assert/strict";
import { isMidSentence, dictSignature } from "../js/analysis.js";
import { Glossary } from "../js/lex.js";

test("заглавная в середине предложения и в начале", () => {
  const t = 'He saw Harry. “Harry!” said Ron. Up we go, Harry.';
  assert.equal(isMidSentence(t, t.indexOf("Harry")), true);
  assert.equal(isMidSentence(t, t.indexOf("Harry!")), false, "после открывающей кавычки и точки это начало предложения");
  assert.equal(isMidSentence(t, t.indexOf("Ron")), true);
  assert.equal(isMidSentence(t, t.indexOf("Up")), false);
  assert.equal(isMidSentence(t, t.lastIndexOf("Harry")), true);
  assert.equal(isMidSentence(t, 0), false);
});

test("подпись словаря меняется вместе с содержимым", () => {
  const a = new Glossary([{ t: "w", w: "cat", pos: "n", ru: "кот" }]);
  const b = new Glossary([{ t: "w", w: "cat", pos: "n", ru: "кот" }, { t: "w", w: "dog", pos: "n", ru: "пёс" }]);
  assert.notEqual(dictSignature(a), dictSignature(b));
  assert.equal(dictSignature(a), dictSignature(new Glossary([{ t: "w", w: "cat", pos: "n", ru: "кошка" }])));
});
