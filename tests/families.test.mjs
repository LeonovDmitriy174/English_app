import test from "node:test";
import assert from "node:assert/strict";
import { FAMILY_LINES } from "../js/familydata.js";
import { families, familyOf, familyQuestion, familyContexts, canHaveFamily, classesOfPos, classLabel } from "../js/families.js";
import { LIMITS } from "../js/pace.js";

const seeded = (seed = 1) => () => ((seed = (seed * 1664525 + 1013904223) >>> 0) / 2 ** 32);
const ctx = (s, word) => ({ s, a: s.indexOf(word), b: s.indexOf(word) + word.length });
const card = (w, pos = "noun") => ({ id: `w:${w}`, w, t: "w", pos });

test("список семей: слово только в одной семье, в семье не меньше трёх слов, написание и части речи правильные", () => {
  const seen = new Map();
  const classes = new Set(["v", "n", "p", "adj", "adv"]);
  const { list } = families();
  assert.ok(list.length >= 400, `семей: ${list.length}`);
  for (const fam of list) {
    assert.ok(fam.members.length >= 3, `в семье ${fam.members[0].w} меньше трёх слов`);
    for (const m of fam.members) {
      assert.match(m.w, /^[a-z]+$/, `слово «${m.w}»: строчные латинские буквы`);
      assert.ok(m.cls.length && m.cls.every((c) => classes.has(c)), `${m.w}: неизвестная часть речи ${m.cls}`);
      assert.ok(!seen.has(m.w), `«${m.w}» есть в семьях «${seen.get(m.w)}» и «${fam.members[0].w}»`);
      seen.set(m.w, fam.members[0].w);
    }
    const names = fam.members.map((m) => m.cls.join());
    assert.ok(new Set(fam.members.map((m) => m.cls.join("|"))).size >= 2, `семья ${fam.members[0].w}: нужны слова разных частей речи (${names})`);
  }
  // каждая строка разобрана: пустых и испорченных нет
  const lines = FAMILY_LINES.split("\n").filter((l) => l.trim());
  assert.equal(lines.length, list.length, "ни одна строка не потеряна при разборе");
  assert.equal(families(), families(), "разбор кэшируется");
});

test("поиск семьи по слову", () => {
  assert.deepEqual(familyOf("grow").members.map((m) => m.w), ["grow", "growth", "grower"]);
  assert.equal(familyOf("Growth"), familyOf("grow"), "регистр не важен");
  assert.equal(familyOf("zzzz"), null);
  assert.equal(familyOf(""), null);
  assert.deepEqual(familyOf("hope").members.find((m) => m.w === "hope").cls, ["v", "n"], "слово с двумя частями речи");
  assert.ok(familyOf("treason") && familyOf("traitor") === familyOf("treacherous"), "лексика книг есть");
});

test("часть речи из словаря: короткая, словами, через запятую", () => {
  assert.deepEqual(classesOfPos("noun"), ["n", "p"]);
  assert.deepEqual(classesOfPos("verb, noun").sort(), ["n", "p", "v"]);
  assert.deepEqual(classesOfPos("adj"), ["adj"]);
  assert.deepEqual(classesOfPos("adverb"), ["adv"]);
  assert.deepEqual(classesOfPos("idiom"), []);
  assert.deepEqual(classesOfPos(undefined), []);
});

test("вопрос: верное слово из предложения и три слова той же семьи другой части речи", () => {
  const c = ctx("The growth of the town was slow.", "growth");
  const q = familyQuestion(card("growth"), c, { rnd: seeded(3) });
  assert.ok(q);
  assert.equal(q.answer, "growth");
  assert.equal(q.options.length, 3, "у growth в семье только grow и grower");
  assert.equal(q.options.filter((o) => o.ok).length, 1);
  assert.deepEqual(q.options.map((o) => o.text).sort(), ["grow", "growth", "grower"].sort());
  assert.deepEqual(q.rows.map((r) => r.w), ["grow", "growth", "grower"], "в разборе слова семьи: глагол, существительное, человек");
  assert.equal(q.rows.filter((r) => r.me).length, 1);
});

test("в вопросе нет слов той же части речи, что и верное", () => {
  const c = ctx("He made a quick decision.", "decision");
  for (let seed = 1; seed < 40; seed++) {
    const q = familyQuestion(card("decision"), c, { rnd: seeded(seed) });
    assert.ok(q, "decide, decisive, decisively");
    assert.deepEqual(q.options.map((o) => o.text).sort(), ["decide", "decision", "decisive", "decisively"]);
  }
  // «attention» и «attendance» подошли бы одинаково, поэтому вместе не предлагаются
  for (let seed = 1; seed < 40; seed++) {
    const q = familyQuestion(card("attention"), ctx("She paid close attention.", "attention"), { rnd: seeded(seed) });
    assert.ok(q);
    assert.ok(!q.options.some((o) => o.text === "attendance"), "второе существительное не предлагается");
    assert.ok(q.options.every((o) => ["attention", "attend", "attentive", "attentively"].includes(o.text)));
  }
});

test("слово, которое называет человека, считается отдельной частью речи", () => {
  const seenWrong = new Set();
  for (let seed = 1; seed < 60; seed++) {
    const q = familyQuestion(card("traitor"), ctx("He was a traitor to the crown.", "traitor"), { rnd: seeded(seed) });
    assert.ok(q);
    q.options.filter((o) => !o.ok).forEach((o) => seenWrong.add(o.text));
  }
  assert.deepEqual([...seenWrong].sort(), ["treachery", "treason", "treacherous"].sort(), "treason и treachery — не человек, treacherous — прилагательное");
  const r = familyQuestion(card("treason"), ctx("It was an act of treason.", "treason"), { rnd: seeded(2) });
  assert.ok(r.options.some((o) => o.text === "traitor") && !r.options.some((o) => o.text === "treachery"), "у treason нет второго существительного-вещи в вариантах");
});

test("слова, уже стоящие в предложении, и слова вне словаря в варианты не попадают", () => {
  const c = ctx("We decide now, and the decision stands.", "decision");
  for (let seed = 1; seed < 30; seed++) {
    const q = familyQuestion(card("decision"), c, { rnd: seeded(seed) });
    assert.ok(q);
    assert.ok(!q.options.some((o) => o.text === "decide"), "decide уже в предложении: оно подсказало бы ответ");
  }
  const inDict = new Set(["decision", "decide", "decisive"]);
  const q = familyQuestion(card("decision"), ctx("He made a quick decision.", "decision"), { has: (w) => inDict.has(w), rnd: seeded(4) });
  assert.deepEqual(q.options.map((o) => o.text).sort(), ["decide", "decision", "decisive"], "decisively нет в словаре");
  assert.deepEqual(q.rows.map((r) => r.w), ["decide", "decision", "decisive"], "и в разборе его нет");
  const few = familyQuestion(card("decision"), ctx("He made a quick decision.", "decision"), { has: (w) => w === "decide" });
  assert.equal(few, null, "после отбора осталось меньше трёх вариантов");
});

test("вопроса нет, если слово в предложении не в начальной форме, слова нет в семьях или часть речи не сходится", () => {
  assert.equal(familyQuestion(card("growth"), ctx("The growths were small.", "growths")), null, "форма не начальная");
  assert.equal(familyQuestion(card("zzzz"), ctx("The zzzz was here.", "zzzz")), null, "нет в семьях");
  assert.equal(familyQuestion(card("grow", "verb"), ctx("The growth was slow.", "growth")), null, "в предложении другое слово");
  assert.equal(familyQuestion({ id: "pv:give up", w: "give up", t: "pv", pos: "phrasal verb" }, ctx("Never give up.", "give up")), null, "фразовые глаголы не берутся");
  assert.equal(familyQuestion(card("treason", "verb"), ctx("It was treason.", "treason")), null, "словарь говорит «глагол», а в семье существительное");
  assert.equal(familyQuestion(card("treason", "idiom"), ctx("It was treason, plain.", "treason")) !== null, true, "часть речи словаря не распознана: не мешает");
  assert.equal(familyQuestion(card("growth"), null), null);
});

test("заглавная буква: в начале предложения повторяется у всех вариантов, посреди предложения (имя) вопроса нет", () => {
  const q = familyQuestion(card("decision"), ctx("Decision came late.", "Decision"), { rnd: seeded(1) });
  assert.ok(q);
  assert.ok(q.options.every((o) => /^[A-Z]/.test(o.text)), "все варианты с заглавной");
  assert.equal(q.answer, "Decision");
  const quoted = familyQuestion(card("decision"), ctx("“Decision is hard,” he said.", "Decision"), { rnd: seeded(1) });
  assert.ok(quoted, "после кавычки это тоже начало предложения");
  assert.equal(familyQuestion(card("hope"), ctx("They asked Hope to come with them.", "Hope")), null, "Hope посреди предложения — имя");
});

test("предложения для задания: подходят только те, где вопрос получается", () => {
  const pool = [ctx("A quick decision was made.", "decision"), ctx("The decisions were made.", "decisions"), { s: "No span here at all.", a: 0, b: 0 }];
  assert.deepEqual(familyContexts(pool, card("decision")).map((c) => c.s), ["A quick decision was made."]);
  assert.deepEqual(familyContexts(pool, card("zzzz")), []);
  assert.ok(canHaveFamily(card("decision")) && !canHaveFamily(card("zzzz")));
  assert.ok(!canHaveFamily({ id: "pv:give up", w: "give up", t: "pv" }));
});

test("подпись частей речи и скорость ответа", () => {
  assert.equal(classLabel(["v", "n"]), "гл., сущ.");
  assert.equal(classLabel(["p"]), "сущ. (человек)");
  assert.equal(classLabel([]), "");
  assert.ok(LIMITS.familyChoice.base > 0, "у задания есть порог медленного ответа");
});
