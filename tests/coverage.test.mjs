import test from "node:test";
import assert from "node:assert/strict";
import { Glossary } from "../js/lex.js";
import { TARGET, wordState, bookCoverage, gainOf, chapterCoverage, pct, gainText, needText } from "../js/coverage.js";

const W = (w, extra = {}) => ({ t: "w", w, pos: "n", ru: w, ...extra });
const names = ["wand", "castle", "owl", "broom", "cloak", "stone", "tower", "dragon", "sword", "king"];
const g = new Glossary([...names.map((w) => W(w)), W("the"), W("of")]);
const card = (w, lv, extra = {}) => [`w:${w}`, { id: `w:${w}`, w, srs: { lv }, ...extra }];
// книга: 100 слов без имён; «the» 20, «wand» 30, «castle» 20, «owl» 10, «broom» 5, «cloak» 5 и 10 слов без записи в словаре
const stats = {
  base: 100,
  outside: 10,
  freq: [["w:wand", 30], ["w:the", 20], ["w:castle", 20], ["w:owl", 10], ["w:broom", 5], ["w:cloak", 5]],
};

test("состояние слова: служебные, «Знаю», уровень карточки, скрытые", () => {
  const e = (w) => g.byId.get(`w:${w}`);
  const cards = new Map([card("wand", 6), card("castle", 5), card("owl", 1, { skip: true }), card("broom", 0)]);
  const known = new Set(["w:cloak"]);
  assert.equal(wordState(e("the"), { cards, known }), "known", "служебное слово считается известным без карточки");
  assert.equal(wordState(e("wand"), { cards, known }), "known", "6 уровень — «Знаю»");
  assert.equal(wordState(e("castle"), { cards, known }), "learning", "5 уровень: ещё учится");
  assert.equal(wordState(e("broom"), { cards, known }), "learning", "новое слово в словаре");
  assert.equal(wordState(e("owl"), { cards, known }), "known", "не повторяется (имя): не мешает охвату");
  assert.equal(wordState(e("cloak"), { cards, known }), "known", "отмечено «Знаю» в окне «Слова этой книги»");
  assert.equal(wordState(e("stone"), { cards, known }), "unknown");
  assert.equal(wordState(undefined, {}), "unknown");
  assert.equal(wordState(e("stone"), {}), "unknown", "без словаря и отметок всё неизвестно, кроме служебных");
});

test("охват книги: знаете, учите, нет в словаре", () => {
  const cards = new Map([card("wand", 7), card("castle", 3)]);
  const c = bookCoverage({ stats, glossary: g, cards, known: new Set() });
  assert.equal(c.base, 100);
  assert.equal(c.share, 0.5, "the (20) + wand (30)");
  assert.equal(c.learningShare, 0.2, "castle в словаре, но ещё учится");
  assert.equal(c.outsideShare, 0.1);
  assert.deepEqual(c.rest.map((r) => r.entry.w), ["castle", "owl", "broom", "cloak"], "неизвестные слова: самые частые первыми");
  assert.equal(c.rest[0].learning, true);
  assert.equal(c.rest[1].learning, false);
});

test("слов до цели: считается по самым частым неизвестным, учтено, сколько из них уже в словаре", () => {
  const cards = new Map([card("wand", 7), card("castle", 3)]);
  // знаете 50 из 100; до 95 нужно ещё 45, а всего неизвестных 40 (+10 вне словаря): цель недостижима
  const c = bookCoverage({ stats, glossary: g, cards, known: new Set() });
  assert.equal(c.need, null);
  assert.match(needText(c), /недостижимо: в словаре нет 10% слов книги/);
  // цель 80%: castle (20) + owl (10) = 80
  const d = bookCoverage({ stats, glossary: g, cards, known: new Set(), target: 0.8 });
  assert.equal(d.need, 2);
  assert.equal(d.needInDict, 1, "castle уже лежит в словаре");
  assert.equal(needText(d), "2 слова (1 уже в словаре)");
  // цель 50%: уже достигнута
  const e = bookCoverage({ stats, glossary: g, cards, known: new Set(), target: 0.5 });
  assert.equal(e.need, 0);
  assert.equal(needText(e), "достигнуто");
  // всё выучено: цель по умолчанию достигнута, если слова вне словаря не больше 5%
  const all = bookCoverage({ stats: { ...stats, outside: 4, base: 94 }, glossary: g, cards: new Map(names.map((w) => card(w, 8))) });
  assert.equal(all.need, 0);
  assert.equal(TARGET, 0.95);
});

test("«Знаю» и новые карточки двигают охват и число слов до цели", () => {
  const cards = new Map();
  const before = bookCoverage({ stats, glossary: g, cards, known: new Set(), target: 0.9 });
  assert.equal(before.share, 0.2, "только служебные слова");
  assert.equal(before.need, 5, "wand 30, castle 20, owl 10, broom 5, cloak 5: 20 + 70 = 90");
  const after = bookCoverage({ stats, glossary: g, cards: new Map([card("wand", 6)]), known: new Set(["w:castle"]), target: 0.9 });
  assert.equal(after.share, 0.7);
  assert.equal(after.need, 3, "осталось owl, broom, cloak: 70 + 20 = 90");
});

test("прирост охвата от набора слов; повторы и неизвестные слова не мешают", () => {
  const c = bookCoverage({ stats, glossary: g, cards: new Map(), known: new Set() });
  assert.equal(gainOf(c, ["w:wand", "w:castle"]), 0.5);
  assert.equal(gainOf(c, ["w:wand", "w:wand"]), 0.3, "одно слово дважды считается один раз");
  assert.equal(gainOf(c, ["w:нет"]), 0);
  assert.equal(gainOf(null, ["w:wand"]), 0);
});

test("старый разбор без частот и пустая книга дают null", () => {
  assert.equal(bookCoverage({ stats: { base: 10, coverage: 0.9 }, glossary: g }), null);
  assert.equal(bookCoverage({ stats: { base: 0, freq: [] }, glossary: g }), null);
  assert.equal(bookCoverage({ stats: undefined, glossary: g }), null);
  assert.equal(bookCoverage({ stats, glossary: null }), null);
});

test("слово, которого уже нет в словаре, уходит в «нет в словаре»", () => {
  const c = bookCoverage({ stats: { ...stats, freq: [...stats.freq, ["w:исчезло", 5]], base: 105 }, glossary: g, cards: new Map(), known: new Set() });
  assert.ok(Math.abs(c.outsideShare - 15 / 105) < 1e-9);
});

test("охват главы по словам текста", () => {
  const cards = new Map([card("wand", 6)]);
  const r = chapterCoverage(["w:wand", "w:wand", "w:castle", "", "w:the"], g, { cards, known: new Set() });
  assert.equal(r.total, 5);
  assert.equal(r.share, 3 / 5);
  assert.deepEqual(chapterCoverage([], g), { total: 0, share: 0 });
});

test("подписи: проценты округляются вниз, прирост с запятой", () => {
  assert.equal(pct(0.947), "94%");
  assert.equal(pct(0.5), "50%");
  assert.equal(pct(1), "100%");
  assert.equal(pct(0.29999999999999993), "30%", "погрешность дробей не отнимает процент");
  assert.equal(gainText(0.0034), "+0,3%");
  assert.equal(gainText(0.0001), "меньше 0,1%");
  assert.equal(gainText(0), "");
  assert.equal(needText(null), "");
  const big = { need: 1240, needInDict: 86, outsideShare: 0.03 };
  assert.equal(needText(big), "1 240 слов (86 уже в словаре)");
  assert.equal(needText({ need: 21, needInDict: 0, outsideShare: 0 }), "21 слово");
});
