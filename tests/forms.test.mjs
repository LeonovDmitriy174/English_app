import test from "node:test";
import assert from "node:assert/strict";
import { wordForms, formSets, kindsOf, formQuestion, inflectedContexts, inflectedSpan, canHaveForms, syllables } from "../js/forms.js";
import { irregularForms } from "../js/lex.js";

const seeded = (seed = 1) => () => ((seed = (seed * 1664525 + 1013904223) >>> 0) / 2 ** 32);
const ctx = (s, word) => ({ s, a: s.indexOf(word), b: s.indexOf(word) + word.length });
const card = (w, pos = "v") => ({ id: `w:${w}`, w, t: "w", pos });

test("неправильные формы берутся из таблицы", () => {
  assert.deepEqual(irregularForms("grow"), ["grew", "grown"]);
  assert.deepEqual(irregularForms("Go"), ["goes", "went", "gone", "going"], "регистр не важен");
  assert.deepEqual(irregularForms("walk"), []);
});

test("формы правильных глаголов", () => {
  assert.deepEqual(wordForms("walk", "v"), ["walk", "walks", "walked", "walking"]);
  assert.deepEqual(wordForms("cry", "v"), ["cry", "cries", "cried", "crying"]);
  assert.deepEqual(wordForms("play", "v"), ["play", "plays", "played", "playing"], "гласная перед y: окончание не меняется");
  assert.deepEqual(wordForms("bake", "v"), ["bake", "bakes", "baked", "baking"]);
  assert.deepEqual(wordForms("fix", "v"), ["fix", "fixes", "fixed", "fixing"]);
  assert.deepEqual(wordForms("tie", "v"), ["tie", "ties", "tied", "tying"]);
});

test("удвоение согласной только там, где оно бывает", () => {
  assert.deepEqual(wordForms("stop", "v"), ["stop", "stops", "stopped", "stopping"]);
  assert.deepEqual(wordForms("visit", "v"), ["visit", "visits", "visited", "visiting"], "ударение не на последнем слоге: без удвоения");
  assert.ok(wordForms("occur", "v").includes("occurred"));
  assert.deepEqual(wordForms("open", "v"), ["open", "opens", "opened", "opening"]);
  assert.deepEqual(wordForms("show", "v").slice(0, 2), ["show", "shows"], "w не удваивается");
});

test("неправильные глаголы, в том числе с приставкой", () => {
  assert.deepEqual(wordForms("grow", "v"), ["grow", "grows", "grew", "grown", "growing"]);
  assert.deepEqual(wordForms("begin", "v"), ["begin", "begins", "began", "begun", "beginning"]);
  assert.deepEqual(wordForms("overcome", "v"), ["overcome", "overcomes", "overcame", "overcoming"]);
  assert.deepEqual(wordForms("go", "v"), ["go", "goes", "went", "gone", "going"]);
  assert.deepEqual(wordForms("put", "v"), ["put", "puts", "putting"], "прошедшее совпадает с начальной формой");
  assert.deepEqual(wordForms("reset", "v"), ["reset", "resets", "resetting"]);
  assert.ok(!wordForms("put", "v").includes("putted"));
});

test("глагол be не используется: его формы подходят почти к любому предложению", () => {
  assert.deepEqual(wordForms("be", "v"), []);
  assert.ok(!canHaveForms(card("be")));
});

test("формы прилагательных: только те, у которых бывает -er и -est", () => {
  assert.deepEqual(wordForms("tall", "adj"), ["tall", "taller", "tallest"]);
  assert.deepEqual(wordForms("big", "adj"), ["big", "bigger", "biggest"]);
  assert.deepEqual(wordForms("happy", "adj"), ["happy", "happier", "happiest"]);
  assert.deepEqual(wordForms("nice", "adj"), ["nice", "nicer", "nicest"]);
  assert.deepEqual(wordForms("good", "adj"), ["good", "better", "best"]);
  assert.deepEqual(wordForms("beautiful", "adj"), [], "длинные: more beautiful");
  assert.deepEqual(wordForms("famous", "adj"), []);
  assert.deepEqual(wordForms("light", "adj"), ["light", "lighter", "lightest"], "неправильная форма глагола light к прилагательному не липнет");
});

test("существительные, наречия и странные слова формами не охвачены", () => {
  assert.deepEqual(wordForms("table", "n"), []);
  assert.deepEqual(wordForms("quickly", "adv"), []);
  assert.deepEqual(wordForms("don't", "v"), []);
  assert.deepEqual(wordForms("", "v"), []);
});

test("слоги считаются грубо, но односложное от длинного отличают", () => {
  assert.equal(syllables("stop"), 1);
  assert.equal(syllables("make"), 1);
  assert.equal(syllables("visit"), 2);
  assert.equal(syllables("beautiful"), 3);
});

test("вопрос: верный вариант — форма из предложения, неверных не меньше двух, всего четыре", () => {
  const c = card("grow");
  const q = formQuestion(c, ctx("He had grown a lot since spring.", "grown"), { rnd: seeded(3) });
  assert.equal(q.answer, "grown");
  assert.equal(q.lemma, "grow");
  assert.equal(q.options.length, 4);
  assert.equal(q.options.filter((o) => o.ok).length, 1);
  assert.equal(q.options.find((o) => o.ok).text, "grown");
  assert.equal(new Set(q.options.map((o) => o.text)).size, 4);
});

test("заглавная буква варианта повторяет предложение", () => {
  const q = formQuestion(card("grow"), ctx("Grew up in a small town, he left early.", "Grew"), { rnd: seeded(5) });
  assert.ok(q.options.every((o) => /^[A-Z]/.test(o.text)), JSON.stringify(q.options));
  assert.equal(q.answer, "Grew");
});

test("если слово стоит в начальной форме, задания нет (это обычный пропуск)", () => {
  assert.equal(formQuestion(card("grow"), ctx("They grow tomatoes here.", "grow")), null);
  assert.equal(inflectedSpan(ctx("They grow tomatoes here.", "grow"), card("grow")), null);
  assert.equal(inflectedSpan(ctx("They Grow tomatoes.", "Grow"), card("grow")), null, "регистр не считается другой формой");
});

test("слова с апострофом и фразы не годятся", () => {
  assert.equal(formQuestion(card("have"), ctx("He hadn't seen it.", "hadn't")), null);
  assert.equal(formQuestion({ id: "pv:give up", w: "give up", t: "pv", pos: "pv" }, ctx("He gave up.", "gave up")), null);
  assert.equal(formQuestion(card("table", "n"), ctx("Two tables stood there.", "tables")), null);
});

test("написание «traveled/travelled»: оба варианта вместе не предлагаются", () => {
  const q = formQuestion(card("travel"), ctx("She travelled across Europe.", "travelled"), { rnd: seeded(9) });
  const texts = q.options.map((o) => o.text);
  assert.ok(texts.includes("travelled"));
  assert.ok(!texts.includes("traveled"), texts.join());
  assert.ok(!texts.includes("travelling") || !texts.includes("traveling"));
});

test("неверные варианты — формы того же слова, а верный не повторяется", () => {
  const forms = wordForms("walk", "v");
  for (let seed = 1; seed < 40; seed++) {
    const q = formQuestion(card("walk"), ctx("Yesterday we walked home together.", "walked"), { rnd: seeded(seed) });
    assert.equal(q.options.filter((o) => o.text === "walked").length, 1);
    for (const o of q.options) assert.ok(forms.includes(o.text), o.text);
  }
});

test("у слова с двумя формами вариантов не хватает", () => {
  // «light» у прилагательного: light, lighter, lightest: верная форма и две неверные
  assert.ok(formQuestion(card("light", "adj"), ctx("A lighter bag is better.", "lighter")));
  // для глагола put формы put, puts, putting: из них верная и две неверные
  assert.ok(formQuestion(card("put"), ctx("She was putting it away.", "putting")));
  assert.equal(formQuestion(card("put"), ctx("She put it away.", "put")), null);
});

test("inflectedContexts оставляет только предложения с другой формой", () => {
  const c = card("grow");
  const pool = [ctx("They grow tomatoes here every year.", "grow"), ctx("It grew quickly in the summer sun.", "grew"), ctx("Trees were growing everywhere around.", "growing")];
  assert.deepEqual(inflectedContexts(pool, c).map((x) => x.s.slice(x.a, x.b)), ["grew", "growing"]);
  assert.deepEqual(inflectedContexts(pool, card("table", "n")), []);
});

test("часть речи в словаре записана и коротко, и словами через запятую", () => {
  assert.deepEqual(kindsOf("v"), ["v"]);
  assert.deepEqual(kindsOf("verb"), ["v"]);
  assert.deepEqual(kindsOf("noun, verb"), ["v"]);
  assert.deepEqual(kindsOf("adjective"), ["adj"]);
  assert.deepEqual(kindsOf("adjective, noun, verb"), ["v", "adj"], "глагол первым");
  assert.deepEqual(kindsOf("noun"), []);
  assert.deepEqual(kindsOf(""), []);
  assert.deepEqual(kindsOf(undefined), []);
  assert.deepEqual(wordForms("grow", "noun, verb"), ["grow", "grows", "grew", "grown", "growing"]);
  assert.deepEqual(wordForms("tall", "adjective"), ["tall", "taller", "tallest"]);
});

test("у слова с несколькими частями речи форма берётся из того набора, где она есть", () => {
  const c = card("light", "adjective, noun, verb");
  assert.equal(formSets("light", "adjective, noun, verb").length, 2);
  const adj = formQuestion(c, ctx("A lighter bag is better.", "lighter"), { rnd: seeded(1) });
  assert.deepEqual(adj.options.map((o) => o.text).sort(), ["light", "lighter", "lightest"].filter((x) => adj.options.some((o) => o.text === x)).sort());
  assert.ok(adj.options.every((o) => ["light", "lighter", "lightest"].includes(o.text)), JSON.stringify(adj.options));
  const verb = formQuestion(c, ctx("She lit the candle slowly.", "lit"), { rnd: seeded(1) });
  assert.ok(verb.options.every((o) => ["light", "lights", "lit", "lighting"].includes(o.text)), JSON.stringify(verb.options));
});

test("форма, которую правила не знают, задания не даёт: она выдавала бы себя среди неверных", () => {
  assert.equal(formQuestion(card("walk"), ctx("They walkin the park daily.", "walkin")), null);
  assert.equal(formQuestion(card("light", "verb"), ctx("A lighter bag is better.", "lighter")), null, "это форма прилагательного, а у карточки только глагол");
});
