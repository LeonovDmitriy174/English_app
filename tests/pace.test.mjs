import test from "node:test";
import assert from "node:assert/strict";
import { slowLimit, isSlow, applyPace, LIMITS } from "../js/pace.js";
import { TASKS } from "../js/modes.js";

test("у каждого задания, кроме диктанта, есть порог", () => {
  for (const t of Object.keys(TASKS)) {
    if (t === "dictation") assert.equal(slowLimit(t), null, "диктант не измеряется");
    else assert.ok(slowLimit(t) > 0, t);
  }
  assert.deepEqual(Object.keys(LIMITS).sort(), Object.keys(TASKS).filter((t) => t !== "dictation").sort());
});

test("порог письменных заданий растёт с длиной ответа", () => {
  assert.ok(slowLimit("spell", 12) > slowLimit("spell", 4));
  assert.equal(slowLimit("spell", 4), 12000 + 4 * 700);
  assert.equal(slowLimit("choice", 30), slowLimit("choice", 0), "в выборе длина ответа не важна");
});

test("медленный ответ: только если время известно и больше порога", () => {
  assert.ok(isSlow("choice", 10001));
  assert.ok(!isSlow("choice", 10000));
  assert.ok(!isSlow("choice", 3000));
  assert.ok(!isSlow("choice", null), "время неизвестно (приложение сворачивали)");
  assert.ok(!isSlow("choice", NaN));
  assert.ok(!isSlow("dictation", 600000));
});

test("медленное «верно» становится «почти», остальное не меняется", () => {
  assert.equal(applyPace("ok", "choice", 20000), "near");
  assert.equal(applyPace("ok", "choice", 4000), "ok");
  assert.equal(applyPace("no", "choice", 20000), "no", "ошибка остаётся ошибкой");
  assert.equal(applyPace("near", "choice", 20000), "near");
  assert.equal(applyPace("ok", "dictation", 600000), "ok");
  assert.equal(applyPace("ok", "spell", 20000, { len: 12 }), "ok", "длинное слово печатается дольше");
  assert.equal(applyPace("ok", "spell", 20000, { len: 3 }), "near");
});

test("правило можно выключить", () => {
  assert.equal(applyPace("ok", "choice", 99999, { enabled: false }), "ok");
});
