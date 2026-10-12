import test from "node:test";
import assert from "node:assert/strict";
import { Glossary } from "../js/lex.js";
import { langOf, cleanQuery, editDistance, ruVariants, ruQueryStem, searchDictionary, prepareSearch, ownWord, ownEntry } from "../js/dictsearch.js";

const W = (w, ru, z, extra = {}) => ({ w, t: "w", pos: "verb", ru, en: `meaning of ${w}`, ex: `Example with ${w}.`, z, ...extra });
const glossary = new Glossary([
  W("go", "идти; ехать; ходить", 6.5),
  W("run", "бегать; бежать; управлять", 5.8),
  W("flee", "бежать, спасаться; убегать", 4.0),
  W("escape", "убежать; сбежать; спасаться; спасение", 4.6),
  W("leak", "протекать; течь; утечка", 3.5),
  W("beautiful", "красивый; прекрасный", 4.7),
  W("pretty", "красивый; симпатичный", 4.9),
  W("lovely", "прекрасный, милый", 4.3),
  W("reluctant", "неохотный; нерасположенный", 3.6),
  W("reluctance", "неохота", 3.1),
  W("reluctantly", "неохотно", 3.3),
  W("receive", "получать; принимать", 5.1),
  W("give", "давать; дарить", 6.3, { f: ["gives"] }),
  W("leave", "уходить; оставлять; покидать", 5.5),
  W("left", "левый", 5.2, { of: ["leave"] }),
  W("dog", "собака; пёс", 5.3),
  W("house", "дом; жилище", 5.6),
  W("zither", "", 1.2, { rm: "щипковый музыкальный инструмент" }),
  W("piano", "пианино; музыкальный инструмент", 4.4),
  { w: "give up", t: "pv", pos: "phrasal verb", ru: "сдаваться; бросать", en: "stop trying", ex: "Never give up.", m: ["give up"] },
  { w: "give in", t: "pv", pos: "phrasal verb", ru: "уступать", en: "agree after refusing", ex: "He gave in.", m: ["give in"] },
  { w: "break a leg", t: "id", pos: "idiom", ru: "ни пуха ни пера", en: "good luck", ex: "Break a leg tonight!", m: ["break a leg"] },
  { w: "piece of cake", t: "id", pos: "idiom", ru: "проще простого", en: "very easy", ex: "The test was a piece of cake.", m: ["piece of cake"] },
]);

const words = (r) => r.items.map((x) => x.entry.w);
const find = (r, w) => r.items.find((x) => x.entry.w === w);

test("язык запроса определяется по буквам", () => {
  assert.equal(langOf("reluctant"), "en");
  assert.equal(langOf("бежать"), "ru");
  assert.equal(langOf("go домой"), "ru", "смесь считается русским");
  assert.equal(langOf("123 ?!"), null);
  assert.equal(langOf(""), null);
  assert.equal(langOf(undefined), null);
});

test("запрос очищается: регистр, апострофы, лишние знаки, «to» и артикли", () => {
  assert.deepEqual(cleanQuery("  Give   UP! "), { full: "give up", core: "give up", words: ["give", "up"] });
  assert.equal(cleanQuery("to give up").core, "give up");
  assert.equal(cleanQuery("to give up").full, "to give up");
  assert.equal(cleanQuery("the ocean").core, "ocean");
  assert.equal(cleanQuery("to").core, "to", "одно «to» остаётся словом");
  assert.equal(cleanQuery("Don’t").core, "don't");
  assert.equal(cleanQuery("rock-'n'-roll!!").core, "rock-'n'-roll");
  assert.equal(cleanQuery("ЁЖИК, ёлка?").core, "ежик елка");
  assert.deepEqual(cleanQuery("   ").words, []);
});

test("расстояние между словами: правки, перестановка, предел", () => {
  assert.equal(editDistance("receive", "receive", 2), 0);
  assert.equal(editDistance("recieve", "receive", 1), 1, "перестановка соседних букв это одна правка");
  assert.equal(editDistance("reluctent", "reluctant", 1), 1);
  assert.equal(editDistance("definately", "definitely", 2), 1);
  assert.equal(editDistance("cat", "dog", 1), Infinity);
  assert.equal(editDistance("abcdef", "abc", 2), Infinity);
  assert.equal(editDistance("", "ab", 2), 2);
});

test("английский: слово целиком идёт первым, дальше слова на то же начало", () => {
  const r = searchDictionary(glossary, "reluctant");
  assert.equal(r.lang, "en");
  assert.equal(r.items[0].entry.w, "reluctant");
  assert.equal(r.items[0].kind, "exact");
  assert.deepEqual(words(searchDictionary(glossary, "reluc")), ["reluctant", "reluctantly", "reluctance"], "частые выше редких");
  assert.equal(find(searchDictionary(glossary, "reluc"), "reluctant").kind, "prefix");
});

test("английский: регистр и пробелы не важны", () => {
  assert.equal(searchDictionary(glossary, "  RUN ").items[0].entry.w, "run");
});

test("английский: форма слова находит начальную форму", () => {
  const went = searchDictionary(glossary, "went");
  assert.equal(went.items[0].entry.w, "go");
  assert.equal(went.items[0].kind, "form");
  assert.equal(went.items[0].via, "went");
  assert.equal(searchDictionary(glossary, "gives").items[0].entry.w, "give");
  assert.equal(searchDictionary(glossary, "running").items[0].entry.w, "run");
  assert.equal(searchDictionary(glossary, "gone").items[0].entry.w, "go");
});

test("английский: слово, которое само слово и форма другого, показывает оба", () => {
  const r = searchDictionary(glossary, "left");
  assert.equal(r.items[0].entry.w, "left");
  assert.equal(r.items[0].kind, "exact");
  assert.equal(find(r, "leave").kind, "form");
});

test("английский: фраза находится по любой форме глагола и с «to»", () => {
  assert.equal(searchDictionary(glossary, "gave up").items[0].entry.id, "pv:give up");
  assert.equal(searchDictionary(glossary, "to give up").items[0].entry.id, "pv:give up");
  assert.equal(searchDictionary(glossary, "giving in").items[0].entry.id, "pv:give in");
  const r = searchDictionary(glossary, "give");
  assert.equal(r.items[0].entry.id, "w:give");
  assert.deepEqual(words(r).slice(1, 3).sort(), ["give in", "give up"], "фразы с этим словом идут следом");
});

test("английский: начало фразы и слово внутри фразы", () => {
  assert.equal(searchDictionary(glossary, "break a l").items[0].entry.w, "break a leg");
  const leg = searchDictionary(glossary, "leg");
  assert.equal(leg.items[0].entry.w, "break a leg");
  assert.equal(leg.items[0].kind, "phrase");
  assert.equal(searchDictionary(glossary, "cake piece").items[0].entry.w, "piece of cake", "слова в другом порядке");
});

test("английский: опечатки находят близкие слова, но только когда настоящих совпадений нет", () => {
  const typo = searchDictionary(glossary, "recieve");
  assert.equal(typo.items[0].entry.w, "receive");
  assert.equal(typo.items[0].kind, "near");
  assert.equal(searchDictionary(glossary, "reluctent").items[0].entry.w, "reluctant");
  assert.equal(searchDictionary(glossary, "runing").items[0].entry.w, "run", "через неправильную форму");
  // слово есть: опечаток не предлагаем
  assert.ok(!searchDictionary(glossary, "run").items.some((x) => x.kind === "near"));
  // короткие слова опечаток не получают
  assert.deepEqual(searchDictionary(glossary, "dgo").items.filter((x) => x.kind === "near"), []);
});

test("английский: часть слова ищется, только если начал слов не нашлось", () => {
  const r = searchDictionary(glossary, "luctan");
  assert.ok(words(r).includes("reluctant"));
  assert.equal(find(r, "reluctant").kind, "part");
});

test("английский: ничего не нашлось — пустой список", () => {
  const r = searchDictionary(glossary, "qwertyuiop");
  assert.deepEqual(r.items, []);
  assert.equal(r.total, 0);
  assert.equal(r.query, "qwertyuiop");
});

test("русский: слово находит английские слова с этим переводом", () => {
  const r = searchDictionary(glossary, "бежать");
  assert.equal(r.lang, "ru");
  assert.deepEqual(words(r).slice(0, 2), ["run", "flee"], "точные совпадения, частое слово выше");
  assert.ok(words(r).includes("escape") === false || words(r).indexOf("escape") > 1, "«убежать» это не «бежать»");
});

test("русский: другая форма слова находит то же", () => {
  assert.deepEqual(words(searchDictionary(glossary, "бежал")).slice(0, 2), ["run", "flee"]);
  assert.deepEqual(words(searchDictionary(glossary, "красивая")).slice(0, 2), ["pretty", "beautiful"]);
  assert.equal(searchDictionary(glossary, "собаки").items[0].entry.w, "dog");
  assert.equal(searchDictionary(glossary, "Пес").items[0].entry.w, "dog", "«ё» и «е» не различаются");
  assert.equal(searchDictionary(glossary, "пёс").items[0].entry.w, "dog");
});

test("русский: несколько слов", () => {
  assert.equal(searchDictionary(glossary, "ни пуха").items[0].entry.w, "break a leg");
  assert.equal(searchDictionary(glossary, "проще простого").items[0].entry.w, "piece of cake");
  assert.equal(searchDictionary(glossary, "простого проще").items[0].entry.w, "piece of cake", "без учёта порядка");
  assert.equal(searchDictionary(glossary, "дом").items[0].entry.w, "house");
});

test("русский: перевод, сделанный машиной, ниже словарного", () => {
  const r = searchDictionary(glossary, "инструмент");
  assert.deepEqual(words(r), ["piano", "zither"]);
});

test("русский: слишком короткие основы не дают мусора", () => {
  assert.deepEqual(ruQueryStem("я"), { stem: "я", exact: true });
  assert.equal(ruQueryStem("учился").stem, "учи");
  assert.equal(ruQueryStem("красивая").stem, "красив");
  assert.deepEqual(searchDictionary(glossary, "я").items, []);
});

test("варианты перевода: смыслы, скобки, ё", () => {
  assert.deepEqual(ruVariants("бегать; бежать (быстро), Ёжик"), ["бегать", "бежать", "ежик"]);
  assert.deepEqual(ruVariants(""), []);
  assert.deepEqual(ruVariants(undefined), []);
});

test("лимит результатов и общее число", () => {
  const big = new Glossary(Array.from({ length: 200 }, (_, i) => W(`test${i}`, "проверка", 3)));
  const r = searchDictionary(big, "test", { limit: 30 });
  assert.equal(r.items.length, 30);
  assert.equal(r.total, 200);
});

test("пустой словарь, пустой запрос и запрос без букв", () => {
  assert.deepEqual(searchDictionary(new Glossary([]), "run").items, []);
  assert.deepEqual(searchDictionary(glossary, "").items, []);
  assert.deepEqual(searchDictionary(glossary, "123").items, []);
  assert.equal(searchDictionary(glossary, "123").lang, null);
  assert.deepEqual(searchDictionary(glossary, "!!").items, []);
  assert.deepEqual(searchDictionary(null, "run").items, []);
});

test("новый словарь даёт новые результаты (индекс не залипает)", () => {
  const one = new Glossary([W("alpha", "альфа", 3)]);
  const two = new Glossary([W("alpine", "альпийский", 3)]);
  assert.equal(searchDictionary(one, "alp").items[0].entry.w, "alpha");
  assert.equal(searchDictionary(two, "alp").items[0].entry.w, "alpine");
});

test("записи без частоты (старый словарь) тоже ищутся: короткие и слова выше", () => {
  const old = new Glossary([{ w: "reluctantly", t: "w", pos: "adverb", ru: "неохотно", en: "", ex: "" }, { w: "reluctant", t: "w", pos: "adjective", ru: "неохотный", en: "", ex: "" }, { w: "reluctant to", t: "id", pos: "idiom", ru: "не желающий", en: "", ex: "", m: ["reluctant to"] }]);
  assert.deepEqual(words(searchDictionary(old, "reluc")), ["reluctant", "reluctantly", "reluctant to"]);
});

test("своё слово: одно английское слово", () => {
  assert.equal(ownWord(" yeet "), "yeet");
  assert.equal(ownWord("Daenerys"), "Daenerys");
  assert.equal(ownWord("well-known"), "well-known");
  assert.equal(ownWord("don’t"), "don't");
  assert.equal(ownWord("give up"), null, "фразы берутся из словаря");
  assert.equal(ownWord("собака"), null);
  assert.equal(ownWord(""), null);
  assert.equal(ownWord("-x"), null);
  assert.equal(ownWord("a1"), null);
});

test("своя запись: идентификатор строчный, имя сохраняет заглавную, перевод обязателен", () => {
  assert.deepEqual(ownEntry("Yeet", " выбросить  ", 0), { id: "w:yeet", t: "w", w: "Yeet", pos: "", ru: "выбросить", en: "", ex: "", custom: true });
  assert.equal(ownEntry("yeet", "швырнуть").w, "yeet");
  assert.equal(ownEntry("yeet", "   "), null);
  assert.equal(ownEntry("two words", "x"), null);
  assert.equal(ownEntry("yeet", "я".repeat(300)).ru.length, 200);
});

test("русский индекс можно готовить заранее; запрос посреди подготовки достраивает его", async () => {
  const many = new Glossary(Array.from({ length: 3000 }, (_, i) => W(`word${i}`, i === 2999 ? "последний" : "слово", 3)));
  const early = new Glossary([...many.list]);
  const pending = prepareSearch(many, 0); // порции по нулю миллисекунд: готовится медленно, по частям
  assert.equal(searchDictionary(many, "последний").items[0].entry.w, "word2999", "запрос не ждёт подготовки");
  await pending;
  assert.equal(searchDictionary(many, "последний").items.length, 1);
  await prepareSearch(early, 1000);
  assert.equal(searchDictionary(early, "последний").items[0].entry.w, "word2999");
  await prepareSearch(new Glossary([])); // пустой словарь не ломает подготовку
  await prepareSearch(null);
});
