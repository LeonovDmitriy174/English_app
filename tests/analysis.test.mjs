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

// ── Счётчики слов книги ───────────────────────────────────────────────────
import { newCounter, addText, summarize, statsSignature, ANALYSIS_VERSION } from "../js/analysis.js";

const W = (w, extra = {}) => ({ t: "w", w, pos: "n", ru: w, ...extra });
const g = new Glossary([W("wand"), W("castle"), W("go", { f: ["went"] }), W("will"), { t: "pv", w: "give up", pos: "pv", ru: "сдаться", m: ["give up"] }]);

function stats(...paragraphs) {
  const acc = newCounter();
  for (const p of paragraphs) addText(acc, p, g);
  return summarize(acc, g);
}

test("разбор считает, сколько раз встретилась каждая запись словаря, по всем её формам", () => {
  const s = stats("The wand was old. Harry took the wand and went home. He went again.", "Wand, wand, wand!");
  const top = Object.fromEntries(s.top);
  assert.equal(top["w:wand"], 5);
  assert.equal(top["w:go"], 2, "went и go — одна запись");
});

test("разбор: слова, встретившиеся один раз, в список частых не попадают", () => {
  const s = stats("A castle. A wand and a wand.");
  assert.deepEqual(Object.fromEntries(s.top), { "w:wand": 2 });
});

test("разбор: слово внутри фразы считается фразой, а не отдельным словом", () => {
  const s = stats("Never give up. Do not give up. They give up.", "I will go. You will go.");
  const top = Object.fromEntries(s.top);
  assert.equal(top["pv:give up"], 3);
  assert.equal(top["w:go"], 2);
  assert.ok(!("w:give" in top));
});

test("разбор: имя, совпавшее со словом словаря, в частые слова не попадает", () => {
  // «Will» всегда с заглавной в середине предложения: это имя, а не слово will
  const s = stats("Then Will left. Later Will smiled. So Will ran.");
  assert.ok(!("w:will" in Object.fromEntries(s.top)));
  assert.ok(s.names.includes("will"));
});

test("разбор: «I» и его сокращения именами не считаются, а Harry остаётся именем", () => {
  const s = stats("Then I saw Harry. Later I'm sure I ran, and I’ll see Harry.");
  assert.ok(!s.names.includes("i") && !s.names.includes("i'm"), "местоимение не имя");
  assert.ok(!s.nameCounts.some(([w]) => w === "i" || w.startsWith("i'")), "и не попадает в «Персонажи и названия»");
  assert.ok(s.names.includes("harry"));
  assert.equal(s.base, s.tokens - 2, "в охват входят все слова, кроме двух Harry");
});

test("разбор: частые идут первыми, при равенстве по алфавиту, а список ограничен", () => {
  const s = stats("castle castle wand wand wand go go");
  assert.deepEqual(s.top.map(([id]) => id), ["w:wand", "w:castle", "w:go"]);
  const name = (i) => "zz" + String.fromCharCode(97 + (i % 26)) + String.fromCharCode(97 + (Math.floor(i / 26) % 26)) + String.fromCharCode(97 + Math.floor(i / 676)); // только буквы, у каждого номера своё слово
  const many = new Glossary(Array.from({ length: 700 }, (_, i) => W(name(i))));
  const acc = newCounter();
  addText(acc, Array.from({ length: 700 }, (_, i) => `${name(i)} ${name(i)}`).join(" "), many);
  assert.equal(summarize(acc, many).top.length, 500);
});

test("подпись разбора включает версию: старые книги разбираются заново", () => {
  assert.ok(statsSignature(g).startsWith(`v${ANALYSIS_VERSION}.`));
  assert.notEqual(statsSignature(g), dictSignature(g));
  assert.equal(stats("wand").sig, statsSignature(g));
});

// ── Частоты всех слов (для охвата, js/coverage.js) ───────────────────────────
test("разбор запоминает частоты всех слов, в том числе единичных и внутри фраз; имена и слова без записи считаются отдельно", () => {
  const s = stats("The wand and the castle. Harry took the wand. Never give up, and go home. Zzyzx!");
  const freq = Object.fromEntries(s.freq);
  assert.equal(freq["w:wand"], 2);
  assert.equal(freq["w:castle"], 1, "единичное слово тоже попадает в частоты");
  assert.equal(freq["w:go"], 1);
  assert.ok(!("pv:give up" in freq), "в частотах только слова");
  assert.deepEqual(s.freq.map(([id]) => id)[0], "w:wand", "самые частые первыми");
  assert.ok(s.base > 0 && s.outside > 0 && s.outside < s.base, "слова без записи словаря посчитаны: «Zzyzx», «the», «and» и т. д.");
  // base — слова текста без имён: «Harry» с заглавной внутри предложения (имя) в них не входит
  const t = stats("Then Harry saw it. Later Harry ran.");
  assert.equal(t.base, t.tokens - 2);
  assert.ok(t.names.includes("harry"));
});

test("разбор: слово внутри фразы попадает и в частоты слов, и в частоты фраз", () => {
  const s = stats("Never give up.", "Do not give up.");
  assert.equal(Object.fromEntries(s.top)["pv:give up"], 2);
  assert.ok(!("w:give" in Object.fromEntries(s.freq)), "в словаре нет отдельной записи give, поэтому её нет и в частотах");
});

test("версия разбора поднята, чтобы старые книги разобрались заново и получили частоты", () => {
  assert.ok(ANALYSIS_VERSION >= 3);
});
