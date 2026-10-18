// Поиск слова по форме из текста: к какой записи приводит said, eyes, that's и т. п.
// Случаи взяты из настоящего словаря (Викисловарь): у формы там часто своя запись с чужим смыслом.
import test from "node:test";
import assert from "node:assert/strict";
import { Glossary, lemmaCandidates } from "../js/lex.js";
import { rankFromDictionary } from "../js/freqdeck.js";
import { fixEntry, decodeEntities, FIXES } from "../js/dictfixes.js";

const w = (word, ru, extra = {}) => ({ t: "w", w: word, pos: "noun", ru, en: `def of ${word}`, z: 5, ...extra });
const thin = (word, of, extra = {}) => ({ t: "w", w: word, pos: "verb", rm: "автоперевод", en: `form of ${of}`, of: [of], z: 5, ...extra });

const g = new Glossary([
  w("say", "говорить", { pos: "verb" }),
  w("said", "упомянутый", { pos: "adjective", of: ["say"] }), // особый смысл формы, в тексте почти всегда глагол
  w("see", "видеть", { pos: "verb" }),
  w("saw", "пила", { pos: "noun, verb", of: ["see"] }),
  w("find", "находить", { pos: "verb" }),
  w("found", "основывать", { pos: "verb", of: ["find"] }),
  w("be", "быть", { pos: "verb" }),
  thin("was", "be"),
  thin("is", "be"),
  w("are", "ар", { of: ["be"] }),
  w("eye", "глаз"),
  w("ey", "яйцо"),
  w("hat", "шляпа"),
  w("hate", "ненавидеть", { pos: "verb" }),
  w("use", "использовать", { pos: "verb" }),
  w("us", "нас", { pos: "pronoun" }),
  w("pic", "фото"),
  w("pick", "выбирать", { pos: "verb" }),
  w("leave", "уходить", { pos: "verb" }),
  w("left", "левый", { pos: "adjective", of: ["leave"] }),
  w("hi", "привет", { pos: "interjection" }),
  w("his", "его", { pos: "determiner", of: ["hi"] }),
  w("run", "бегать", { pos: "verb", of: ["rin"] }),
  w("head", "голова", { pos: "noun, verb" }),
  w("heads", "орёл", { pos: "noun", of: ["head"] }),
  w("cloth", "ткань"),
  w("clothes", "одежда", { of: ["cloth"] }),
  w("new", "новый", { pos: "adjective" }),
  w("news", "новости", { pos: "noun", of: ["new"] }),
  w("that", "тот", { pos: "determiner" }),
  thin("that's", "that", { of: undefined, rm: "которые (диалект)" }),
  w("its", "его", { pos: "determiner", f: ["it's"] }),
  w("it", "он", { pos: "pronoun" }),
  w("can", "мочь", { pos: "verb" }),
  thin("can't", "can", { of: undefined }),
  w("won", "вона", { pos: "noun" }),
  w("win", "побеждать", { pos: "verb" }),
  w("color", "цвет"),
  { t: "w", w: "colour", pos: "noun", rm: "автоперевод", en: "Commonwealth and Ireland standard spelling of color", z: 4 },
  w("abandon", "оставлять", { pos: "verb" }),
  thin("abandoned", "abandon"),
  w("hope", "надежда"),
  w("hop", "прыгать", { pos: "verb" }),
  w("s", "эс"),
  w("d", "дэ"),
]);

const ids = (...words) => words.map((x) => g.lookupWord(x)?.w ?? null);

test("форма с особым смыслом ведёт к начальной форме из таблицы неправильных форм", () => {
  assert.deepEqual(ids("said", "Said", "saw", "found", "are", "was", "is"), ["say", "say", "see", "find", "be", "be", "be"]);
});

test("запись без перевода ведёт к начальной форме, если это подтверждают правила окончаний", () => {
  assert.equal(g.lookupWord("abandoned")?.w, "abandon");
});

test("формы, которые в книгах чаще самостоятельные слова, остаются при своей записи", () => {
  assert.deepEqual(ids("left", "clothes", "news"), ["left", "clothes", "news"]);
});

test("«founded» не превращается в find через found: к начальной форме ведёт только слово, как оно написано", () => {
  assert.equal(g.lookupWord("founded")?.w, "found");
});

test("множественное число с особым смыслом ведёт к единственному (heads — «орёл», а не «головы»)", () => {
  assert.equal(g.lookupWord("heads")?.w, "head");
});

test("пометка Викисловаря «форма слова» без подтверждения правилами не ведёт никуда и не показывается", () => {
  assert.equal(g.lookupWord("his")?.w, "his", "his не форма от hi");
  assert.equal(g.lookupWord("run")?.w, "run", "run не форма от rin");
  assert.deepEqual(g.formOf(g.lookupWord("his")), []);
  assert.deepEqual(g.formOf(g.lookupWord("run")), []);
  assert.deepEqual(g.formOf(g.lookupWord("left")), ["leave"], "left — подтверждённая форма leave");
  assert.deepEqual(g.formOf(g.lookupWord("its")), [], "its — не форма местоимения it");
});

test("сокращения: запись без перевода и запись, попавшая к другому слову как «другая форма», пропускаются", () => {
  assert.deepEqual(ids("that's", "It's", "can't", "Can’t"), ["that", "it", "can", "can"]);
});

test("написание, у которого в словаре только ссылка на основное (colour → color)", () => {
  assert.equal(g.lookupWord("colour")?.w, "color");
});

test("порядок кандидатов: срез «s» раньше среза «es», немая «e» раньше удвоенной согласной", () => {
  const first = (word, n = 2) => lemmaCandidates(word).slice(0, n);
  assert.deepEqual(first("eyes"), ["eyes", "eye"]);
  assert.deepEqual(first("cares"), ["cares", "care"]);
  assert.deepEqual(first("uses"), ["uses", "use"]);
  assert.deepEqual(first("toes"), ["toes", "toe"]);
  assert.deepEqual(first("ties"), ["ties", "tie"]);
  assert.deepEqual(first("hated"), ["hated", "hate"]);
  assert.deepEqual(first("stared"), ["stared", "stare"]);
  assert.deepEqual(first("using"), ["using", "use"]);
  assert.deepEqual(first("writing"), ["writing", "write"]);
  assert.deepEqual(first("wider"), ["wider", "wide"]);
  // где корень без немой «e» или слог не один, порядок прежний
  assert.deepEqual(first("looked"), ["looked", "look"]);
  assert.deepEqual(first("visited"), ["visited", "visit"]);
  assert.deepEqual(first("opened"), ["opened", "open"]);
  assert.deepEqual(first("waited"), ["waited", "wait"]);
  assert.deepEqual(first("tapped", 3), ["tapped", "tapp", "tappe"]);
  assert.ok(lemmaCandidates("tapped").includes("tap"));
  // остальное из прежних правил
  for (const [form, lemma] of [["boxes", "box"], ["watches", "watch"], ["bosses", "boss"], ["heroes", "hero"], ["stories", "story"], ["wolves", "wolf"], ["panicked", "panic"], ["trafficking", "traffic"]]) {
    assert.ok(lemmaCandidates(form).includes(lemma), `${form} → ${lemma}`);
  }
  assert.ok(lemmaCandidates("picked").indexOf("pick") < lemmaCandidates("picked").indexOf("pic"), "pick раньше pic");
});

test("неправильные формы, которых не хватало", () => {
  for (const [form, lemma] of [["mistaken", "mistake"], ["undone", "undo"], ["slain", "slay"], ["woven", "weave"], ["sped", "speed"], ["bacteria", "bacterium"], ["criteria", "criterion"], ["phenomena", "phenomenon"], ["fungi", "fungus"], ["stricken", "strike"], ["withheld", "withhold"]]) {
    assert.ok(lemmaCandidates(form).includes(lemma), `${form} → ${lemma}`);
  }
});

test("eyes находит eye, а не диалектное ey", () => {
  assert.equal(g.lookupWord("eyes")?.w, "eye");
  assert.equal(g.lookupWord("hated")?.w, "hate");
  assert.equal(g.lookupWord("using")?.w, "use");
  assert.equal(g.lookupWord("hoped")?.w, "hope");
  assert.equal(g.lookupWord("picked")?.w, "pick");
});

test("список «Пополнить словарь» не содержит форм, которые приложение ведёт к другим словам", () => {
  const words = rankFromDictionary(g, 100).map((e) => e.w);
  for (const form of ["said", "saw", "found", "was", "is", "heads", "abandoned"]) assert.ok(!words.includes(form), `${form} не нужен в списке`);
  for (const e of rankFromDictionary(g, 100)) assert.equal(g.lookupWord(e.w), e, `${e.w} находится по своему написанию`);
});

test("исправления словаря: сущности HTML заменяются, у the есть перевод", () => {
  assert.equal(decodeEntities("&lt; &lt; текст &gt; &gt; &quot;a&quot; &amp; b"), '< < текст > > "a" & b');
  assert.equal(decodeEntities("без сущностей"), "без сущностей");
  assert.equal(decodeEntities(undefined), undefined);
  const e = { t: "w", w: "x", rm: "&lt;слово&gt;", ru: "" };
  assert.equal(fixEntry(e).rm, "<слово>");
  assert.equal(fixEntry(e).w, "x");
  const untouched = { t: "w", w: "zzz", ru: "я" };
  assert.equal(fixEntry(untouched), untouched, "если менять нечего, возвращается та же запись");
  const the = new Glossary([{ t: "w", w: "the", pos: "article", rm: "...поскольку она уже упомянута", en: "...because", z: 7.7 }]).lookupWord("the");
  assert.match(the.ru, /артикль/);
  assert.equal(new Glossary([{ t: "pv", w: "the", ru: "x" }]).list[0].ru, "x", "исправления только у слов (w), не у фраз");
});

test("исправления лежат только у слов с переводом и заменяют только известные поля", () => {
  for (const [word, fix] of Object.entries(FIXES)) {
    assert.match(word, /^[a-z]+$/, word);
    assert.ok(fix.ru && /[а-яё]/i.test(fix.ru), `${word}: нужен перевод по-русски`);
    for (const k of Object.keys(fix)) assert.ok(["ru", "en"].includes(k), `${word}: поле ${k}`);
  }
});

test("отдельные буквы в словарь не попадают, кроме слов a и I", () => {
  assert.equal(g.lookupWord("s"), null);
  assert.equal(g.lookupWord("D"), null);
  assert.equal(g.lookupWord("it's")?.w, "it");
});
