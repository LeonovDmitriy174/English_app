import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { Glossary, lemmaCandidates, tokenize, findPhrases, sentenceAt, distance } from "../js/lex.js";

const entries = JSON.parse(readFileSync(new URL("../data/dict.json", import.meta.url), "utf8"));
const g = new Glossary(entries);

const phrasesIn = (text) => {
  const tokens = tokenize(text);
  return findPhrases(g, tokens, text).map((m) => `${m.entry.w}:${m.idxs.map((i) => tokens[i].raw).join("+")}`);
};

test("начальные формы", () => {
  assert.ok(lemmaCandidates("woken").includes("wake"));
  assert.ok(lemmaCandidates("wolfing").includes("wolf"));
  assert.ok(lemmaCandidates("tapped").includes("tap"));
  assert.ok(lemmaCandidates("flung").includes("fling"));
  assert.ok(lemmaCandidates("remarkably").includes("remarkable"));
  assert.ok(lemmaCandidates("Dudley’s").includes("dudley"));
});

test("поиск одиночных слов в словаре", () => {
  assert.equal(g.lookupWord("screeched")?.w, "screech");
  assert.equal(g.lookupWord("Crept")?.w, "creep");
  assert.equal(g.lookupWord("frantically")?.w, "frantic");
  assert.equal(g.lookupWord("hoodlums")?.w, "hoodlum");
  assert.equal(g.lookupWord("sprinted"), null);
});

test("фразовые глаголы, в том числе разделённые", () => {
  assert.deepEqual(phrasesIn("Nearly ten years had passed since the Dursleys had woken up to find their nephew."), ["wake up:woken+up"]);
  assert.ok(phrasesIn("Get a move on, I want you to look after the bacon.").includes("get a move on:Get+a+move+on"));
  assert.ok(phrasesIn("Get a move on, I want you to look after the bacon.").includes("look after:look+after"));
  assert.ok(phrasesIn("after pulling a spider off one of them, put them on").includes("pull off:pulling+off"));
  assert.ok(phrasesIn("after pulling a spider off one of them, put them on").includes("put on:put+on"));
  assert.ok(phrasesIn("The sun rose and lit up the brass number four.").includes("light up:lit+up"));
});

test("идиомы с вариантами и подстановками", () => {
  assert.ok(phrasesIn("it made no difference, his hair simply grew that way").includes("make a difference:made+no+difference"));
  assert.ok(phrasesIn("Dudley had laughed himself silly at Harry").includes("laugh oneself silly:laughed+himself+silly"));
  assert.ok(phrasesIn("Harry wasn't punished, to his great relief.").includes("to one's relief:to+his+great+relief"));
  assert.ok(phrasesIn("Harry's heart gave a leap.").includes("heart gives a leap:heart+gave+a+leap"));
});

test("слова через знаки препинания не склеиваются во фразу", () => {
  assert.deepEqual(phrasesIn("He turned. Over the road ran a dog."), []);
  assert.ok(!phrasesIn("Come, back to me.").some((p) => p.startsWith("come back")));
});

test("разделённый фразовый глагол не захватывает предлоги и союзы", () => {
  assert.ok(!phrasesIn("She will get a ticket and then up to the top.").some((p) => p.startsWith("get up")));
});

test("предложение вокруг позиции", () => {
  const text = "“Up!” she screeched. Harry heard Mr. Dursley walking toward the kitchen. He rolled over.";
  const pos = text.indexOf("Dursley");
  const [s, e] = sentenceAt(text, pos);
  assert.equal(text.slice(s, e), "Harry heard Mr. Dursley walking toward the kitchen.");
  const [s2, e2] = sentenceAt(text, text.indexOf("screeched"));
  assert.equal(text.slice(s2, e2), "she screeched.");
});

test("расстояние Левенштейна", () => {
  assert.equal(distance("cupboard", "cupbord"), 1);
  assert.equal(distance("abc", "abc"), 0);
  assert.equal(distance("kitten", "sitting"), 3);
});

test("односимвольные слова «a» и «I» ищутся, а обрезки окончаний короче двух букв — нет", () => {
  const g = new Glossary([
    { t: "w", w: "a", pos: "article", ru: "один" },
    { t: "w", w: "i", pos: "pronoun", ru: "я" },
  ]);
  assert.equal(g.lookupWord("A")?.w, "a");
  assert.equal(g.lookupWord("I")?.w, "i");
  assert.equal(g.lookupWord("I'm")?.w, "i");
  assert.equal(g.lookupWord("is"), null, "«is» не должно превращаться в «i»");
  assert.equal(g.lookupWord("as"), null, "«as» не должно превращаться в «a»");
});
