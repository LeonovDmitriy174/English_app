import test from "node:test";
import assert from "node:assert/strict";
import { leeches, leechReport } from "../js/leech.js";
import { isLeech, LEECH_LAPSES, answer, newSrs, PIPS } from "../js/levels.js";

const card = (w, srs, extra = {}) => ({ id: `w:${w}`, w, t: "w", ru: `перевод ${w}`, srs: { lv: 2, due: 0, last: 0, reps: 9, lapses: 0, ...srs }, ...extra });

test("слово становится трудным после четырёх ошибок и перестаёт им быть, когда освоено", () => {
  assert.equal(LEECH_LAPSES, 4);
  assert.ok(!isLeech({ lv: 2, lapses: 3 }));
  assert.ok(isLeech({ lv: 2, lapses: 4 }));
  assert.ok(isLeech({ lv: PIPS, lapses: 9 }));
  assert.ok(!isLeech({ lv: PIPS + 1, lapses: 9 }), "дошло до уровня выше последней точки индикатора");
  assert.ok(!isLeech(undefined));
});

test("ошибки считаются только у уже знакомого слова", () => {
  let s = newSrs();
  s = answer(s, "no"); // новое слово: это не «забыл», а «ещё не знал»
  assert.equal(s.lapses, 0);
  s = answer(answer(s, "ok"), "ok");
  for (let i = 0; i < 4; i++) s = answer(answer(s, "ok"), "no");
  assert.equal(s.lapses, 4);
  assert.ok(isLeech(s));
});

test("трудные слова: больше всего ошибок первыми, пропущенные не в счёт", () => {
  const cards = [card("a", { lapses: 4 }), card("b", { lapses: 7 }), card("c", { lapses: 2 }), card("d", { lapses: 9 }, { skip: true }), card("e", { lapses: 7, lv: 1 })];
  assert.deepEqual(leeches(cards).map((c) => c.w), ["e", "b", "a"], "при равенстве первым идёт слово с более низким уровнем");
});

test("текст для копирования: перевод, пример, число ошибок и ваша ассоциация", () => {
  const cards = [card("grow", { lapses: 5 }, { ru: "расти", ex: "Plants grow in spring.", mnemonic: "гроу — грядка" }), card("ban", { lapses: 4 }, { ctx: [{ s: "The ban was lifted.", a: 4, b: 7 }] })];
  const text = leechReport(cards);
  assert.match(text, /^Помоги запомнить/);
  assert.match(text, /1\. grow — расти \(ошибок: 5\)/);
  assert.match(text, /Пример: Plants grow in spring\./);
  assert.match(text, /Моя ассоциация: гроу — грядка/);
  assert.match(text, /2\. ban — перевод ban \(ошибок: 4\)/);
  assert.match(text, /Пример: The ban was lifted\./);
  assert.match(text, /Всего 2 слова\./);
  assert.equal(leechReport([card("x", { lapses: 1 })]), "");
});
