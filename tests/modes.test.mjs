import test from "node:test";
import assert from "node:assert/strict";
import { MODES, TASKS, DEFAULT_MIX, MODE_KEYS, normalizeMix, band, capOf, isWritten, isLenient, modeOf, pickTask, FALLBACK } from "../js/modes.js";
import { newSrs, answer } from "../js/levels.js";

/** Обычное слово: заданий для фраз (частица, идиома) и форм у него нет. */
const plain = (t) => t !== "phraseChoice" && t !== "formChoice";
const seeded = (seed = 1) => () => ((seed = (seed * 1664525 + 1013904223) >>> 0) / 2 ** 32);
/** Какие задания вообще бывают на уровне lv при данных режимах (перебор случайных чисел). */
const seen = (lv, modes = DEFAULT_MIX, can = plain) => {
  const out = new Set();
  const rnd = seeded(7);
  for (let i = 0; i < 300; i++) out.add(pickTask({ lv, modes, can, rnd }));
  return [...out].sort();
};

test("настройка Микса: лишнее убирается, пустая означает «все»", () => {
  assert.deepEqual(normalizeMix(["spell", "choice", "spell", "нет-такого"]), ["spell", "choice"]);
  assert.deepEqual(normalizeMix([]), DEFAULT_MIX);
  assert.deepEqual(normalizeMix(undefined), DEFAULT_MIX);
  assert.deepEqual(normalizeMix(["мусор"]), DEFAULT_MIX);
  assert.notEqual(normalizeMix(undefined), DEFAULT_MIX, "возвращается копия, а не общий массив");
});

test("Диктант включается отдельно: в Микс по умолчанию его нет, но выбрать его можно", () => {
  assert.deepEqual(DEFAULT_MIX, ["choice", "cloze", "spell", "listen"]);
  assert.ok(MODE_KEYS.has("dictation"));
  assert.deepEqual(normalizeMix(["dictation", "spell"]), ["dictation", "spell"]);
  assert.deepEqual(normalizeMix(["dictation"]), ["dictation"]);
});

test("каждое задание принадлежит ровно одному режиму", () => {
  const all = MODES.flatMap((m) => m.tasks);
  assert.equal(new Set(all).size, all.length);
  assert.deepEqual([...all].sort(), Object.keys(TASKS).sort());
  assert.equal(modeOf("clozeChoice"), "cloze");
  assert.equal(modeOf("listenType"), "listen");
  assert.equal(modeOf("formChoice"), "cloze");
  assert.equal(modeOf("phraseChoice"), "cloze");
  assert.equal(modeOf("dictation"), "dictation");
});

test("лесенка при всех режимах: узнать, выбрать в предложении, написать, услышать и написать", () => {
  assert.deepEqual(seen(0), ["choice"]);
  assert.deepEqual(seen(1), ["choice", "choiceBack", "listenChoice"]);
  assert.deepEqual(seen(2), ["choiceBack", "clozeChoice", "listenChoice"]);
  for (const lv of [3, 4, 5]) assert.deepEqual(seen(lv), ["cloze", "clozeChoice", "spell"], `уровень ${lv}`);
  assert.deepEqual(seen(6), ["cloze", "listenType", "spell"], "с шестого уровня («Знаю») слово вспоминаем сами");
  assert.deepEqual(seen(10), ["cloze", "listenType", "spell"]);
});

test("фразовому глаголу и идиоме добавляются частица и слово во фразе, глаголу форма слова", () => {
  const all = () => true;
  assert.deepEqual(seen(1, DEFAULT_MIX, all), ["choice", "choiceBack", "listenChoice", "phraseChoice"]);
  assert.deepEqual(seen(2, DEFAULT_MIX, all), ["choiceBack", "clozeChoice", "formChoice", "listenChoice", "phraseChoice"]);
  assert.deepEqual(seen(3, DEFAULT_MIX, all), ["cloze", "clozeChoice", "formChoice", "spell"]);
  assert.deepEqual(seen(5, DEFAULT_MIX, all), ["cloze", "clozeChoice", "formChoice", "spell"]);
  assert.deepEqual(seen(6, DEFAULT_MIX, all), ["cloze", "listenType", "spell"], "на высоких уровнях по-прежнему вспоминаем сами");
  assert.deepEqual(seen(2, DEFAULT_MIX, (t) => t !== "formChoice" && t !== "clozeChoice" && t !== "cloze" ? true : false), ["choiceBack", "listenChoice", "phraseChoice"]);
});

test("Диктант: слова с высоким уровнем в режиме «Диктант», в Миксе по выбору", () => {
  assert.deepEqual(seen(7, ["dictation"]), ["dictation"]);
  assert.deepEqual(seen(7, [...DEFAULT_MIX, "dictation"]), ["cloze", "dictation", "listenType", "spell"]);
  assert.deepEqual(seen(0, ["dictation"]), ["choice"], "новое слово диктовать нельзя: оно начинается с выбора");
  assert.ok(isWritten("dictation") && capOf("dictation") === Infinity);
});

test("если для карточки нельзя собрать диктант, берётся его запасное задание", () => {
  const noDictation = (t) => t !== "dictation";
  assert.deepEqual(seen(7, ["dictation"], noDictation), ["listenType"]);
  assert.deepEqual(seen(7, ["dictation"], (t) => t === "spell"), ["spell"], "а без озвучки — написание");
  assert.deepEqual(seen(7, ["dictation"], () => false), ["choice"]);
});

test("ступени растут вместе с уровнем", () => {
  const ranks = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map((lv) => band(lv));
  for (let i = 1; i < ranks.length; i++) assert.ok(ranks[i][0] >= ranks[i - 1][0] && ranks[i][1] >= ranks[i - 1][1]);
});

test("выключенные режимы не появляются", () => {
  for (let lv = 0; lv <= 10; lv++) {
    const tasks = seen(lv, ["spell", "listen"]);
    assert.ok(tasks.every((t) => ["spell", "listenChoice", "listenType"].includes(t)), `уровень ${lv}: ${tasks}`);
  }
});

test("если задания своей ступени выключены, берётся ближайшее", () => {
  assert.deepEqual(seen(4, ["choice"]), ["choiceBack"], "только Выбор: на высоком уровне самое трудное, что есть");
  assert.deepEqual(seen(8, ["choice"]), ["choiceBack"]);
  assert.deepEqual(seen(1, ["spell"]).length, 1);
  assert.deepEqual(seen(6, ["spell"]), ["spell"]);
});

test("новое слово без режимов узнавания начинается с выбора", () => {
  assert.deepEqual(seen(0, ["spell"]), ["choice"]);
  assert.deepEqual(seen(0, ["spell", "listen"]), ["listenChoice"], "слух с выбором — тоже узнавание");
  assert.deepEqual(seen(0, ["cloze"]), ["clozeChoice"]);
  assert.deepEqual(seen(0, ["cloze"], () => true), ["phraseChoice"], "фразовый глагол с переводом на экране тоже узнавание");
});

test("если задание невозможно (нет предложения, нет озвучки), оно пропускается", () => {
  const noCloze = (t) => !["cloze", "clozeChoice"].includes(t);
  for (let lv = 0; lv <= 10; lv++) assert.ok(seen(lv, DEFAULT_MIX, noCloze).every(noCloze), `уровень ${lv}`);
  const noSound = (t) => !t.startsWith("listen");
  assert.deepEqual(seen(6, DEFAULT_MIX, noSound), ["cloze", "spell"]);
  assert.deepEqual(seen(3, DEFAULT_MIX, () => false), ["choice"], "ничего не возможно: запасной выбор");
});

test("потолки: выбор до 4 уровня (сутки), выбор в предложении до 6 (три дня), письменные без потолка", () => {
  assert.equal(capOf("choice"), 4);
  assert.equal(capOf("choiceBack"), 4);
  assert.equal(capOf("listenChoice"), 4);
  assert.equal(capOf("clozeChoice"), 6);
  assert.equal(capOf("phraseChoice"), 4);
  assert.equal(capOf("formChoice"), 6);
  for (const t of ["spell", "cloze", "listenType", "dictation"]) assert.equal(capOf(t), Infinity);
  assert.equal(capOf("неизвестное"), Infinity);
});

test("письменные задания помечены: ошибка в них опускает не ниже второго уровня", () => {
  for (const t of ["spell", "cloze", "listenType", "dictation"]) assert.ok(isWritten(t), t);
  for (const t of ["choice", "choiceBack", "clozeChoice", "listenChoice", "phraseChoice", "formChoice"]) assert.ok(!isWritten(t), t);
});

test("мягкое задание только одно: в форме слова верных вариантов может быть несколько", () => {
  assert.ok(isLenient("formChoice"));
  for (const t of Object.keys(TASKS).filter((x) => x !== "formChoice")) assert.ok(!isLenient(t), t);
});

test("лесенка и потолки согласованы: каждое задание ступени может поднять слово", () => {
  // слово на уровне lv получает только задания, которые поднимут его выше lv (или оно уже на потолке заданий ступени)
  for (let lv = 0; lv <= 10; lv++) {
    for (const t of seen(lv, DEFAULT_MIX, () => true)) assert.ok(capOf(t) > lv, `уровень ${lv}: задание ${t} с потолком ${capOf(t)} не может поднять слово`);
  }
});

test("запасные задания ведут к более лёгким и заканчиваются написанием", () => {
  for (const t of Object.keys(TASKS)) {
    let cur = t;
    for (let i = 0; i < 5 && FALLBACK[cur]; i++) cur = FALLBACK[cur];
    assert.ok(FALLBACK[cur] === null || FALLBACK[cur] === undefined, `цепочка от ${t} не заканчивается`);
  }
});

test("полный путь слова: только выбор растёт до 4 уровня и останавливается", () => {
  let s = newSrs();
  for (let i = 0; i < 12; i++) s = answer(s, "ok", { cap: capOf("choice") });
  assert.equal(s.lv, 4);
  const w = answer(s, "ok", { cap: capOf("spell"), written: true });
  assert.equal(w.lv, 5, "написанный ответ поднимает дальше");
});
