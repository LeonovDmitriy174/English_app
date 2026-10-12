import test from "node:test";
import assert from "node:assert/strict";
import { MODES, TASKS, DEFAULT_MIX, normalizeMix, band, capOf, isWritten, modeOf, pickTask, FALLBACK } from "../js/modes.js";
import { newSrs, answer } from "../js/levels.js";

const seeded = (seed = 1) => () => ((seed = (seed * 1664525 + 1013904223) >>> 0) / 2 ** 32);
/** Какие задания вообще бывают на уровне lv при данных режимах (перебор случайных чисел). */
const seen = (lv, modes = DEFAULT_MIX, can) => {
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

test("каждое задание принадлежит ровно одному режиму", () => {
  const all = MODES.flatMap((m) => m.tasks);
  assert.equal(new Set(all).size, all.length);
  assert.deepEqual([...all].sort(), Object.keys(TASKS).sort());
  assert.equal(modeOf("clozeChoice"), "cloze");
  assert.equal(modeOf("listenType"), "listen");
});

test("лесенка при всех режимах: узнать, выбрать в предложении, написать, услышать и написать", () => {
  assert.deepEqual(seen(0), ["choice"]);
  assert.deepEqual(seen(1), ["choice", "choiceBack", "listenChoice"]);
  assert.deepEqual(seen(2), ["choiceBack", "clozeChoice", "listenChoice"]);
  assert.deepEqual(seen(3), ["cloze", "clozeChoice", "spell"]);
  assert.deepEqual(seen(4), ["cloze", "listenType", "spell"]);
  assert.deepEqual(seen(9), ["cloze", "listenType", "spell"]);
});

test("ступени растут вместе с уровнем", () => {
  const ranks = [0, 1, 2, 3, 4].map((lv) => band(lv));
  for (let i = 1; i < ranks.length; i++) assert.ok(ranks[i][0] >= ranks[i - 1][0] && ranks[i][1] >= ranks[i - 1][1]);
});

test("выключенные режимы не появляются", () => {
  for (let lv = 0; lv <= 8; lv++) {
    const tasks = seen(lv, ["spell", "listen"]);
    assert.ok(tasks.every((t) => ["spell", "listenChoice", "listenType"].includes(t)), `уровень ${lv}: ${tasks}`);
  }
});

test("если задания своей ступени выключены, берётся ближайшее", () => {
  assert.deepEqual(seen(4, ["choice"]), ["choiceBack"], "только Выбор: на высоком уровне самое трудное, что есть");
  assert.deepEqual(seen(1, ["spell"]).length, 1);
  assert.deepEqual(seen(6, ["spell"]), ["spell"]);
});

test("новое слово без режимов узнавания начинается с выбора", () => {
  assert.deepEqual(seen(0, ["spell"]), ["choice"]);
  assert.deepEqual(seen(0, ["spell", "listen"]), ["listenChoice"], "слух с выбором — тоже узнавание");
  assert.deepEqual(seen(0, ["cloze"]), ["clozeChoice"]);
});

test("если задание невозможно (нет предложения, нет озвучки), оно пропускается", () => {
  const noCloze = (t) => !["cloze", "clozeChoice"].includes(t);
  for (let lv = 0; lv <= 6; lv++) assert.ok(seen(lv, DEFAULT_MIX, noCloze).every(noCloze), `уровень ${lv}`);
  const noSound = (t) => !t.startsWith("listen");
  assert.deepEqual(seen(4, DEFAULT_MIX, noSound), ["cloze", "spell"]);
  assert.deepEqual(seen(3, DEFAULT_MIX, () => false), ["choice"], "ничего не возможно: запасной выбор");
});

test("потолки: выбор до 3 уровня, выбор в предложении до 4, письменные без потолка", () => {
  assert.equal(capOf("choice"), 3);
  assert.equal(capOf("choiceBack"), 3);
  assert.equal(capOf("listenChoice"), 3);
  assert.equal(capOf("clozeChoice"), 4);
  for (const t of ["spell", "cloze", "listenType"]) assert.equal(capOf(t), Infinity);
  assert.equal(capOf("неизвестное"), Infinity);
});

test("письменные задания помечены: ошибка в них сбрасывает на второй уровень", () => {
  for (const t of ["spell", "cloze", "listenType"]) assert.ok(isWritten(t), t);
  for (const t of ["choice", "choiceBack", "clozeChoice", "listenChoice"]) assert.ok(!isWritten(t), t);
});

test("лесенка и потолки согласованы: каждое задание ступени может поднять слово", () => {
  // слово на уровне lv получает только задания, которые поднимут его выше lv (или оно уже на потолке заданий ступени)
  for (let lv = 0; lv <= 9; lv++) {
    for (const t of seen(lv)) assert.ok(capOf(t) > lv, `уровень ${lv}: задание ${t} с потолком ${capOf(t)} не может поднять слово`);
  }
});

test("запасные задания ведут к более лёгким и заканчиваются написанием", () => {
  for (const t of Object.keys(TASKS)) {
    let cur = t;
    for (let i = 0; i < 5 && FALLBACK[cur]; i++) cur = FALLBACK[cur];
    assert.ok(FALLBACK[cur] === null || FALLBACK[cur] === undefined, `цепочка от ${t} не заканчивается`);
  }
});

test("полный путь слова: только выбор растёт до 3 уровня и останавливается", () => {
  let s = newSrs();
  for (let i = 0; i < 12; i++) s = answer(s, "ok", { cap: capOf("choice") });
  assert.equal(s.lv, 3);
  const w = answer(s, "ok", { cap: capOf("spell"), written: true });
  assert.equal(w.lv, 4, "написанный ответ поднимает дальше");
});
