import test from "node:test";
import assert from "node:assert/strict";
import { newTracker, judgeInSession, requeuePosition } from "../js/session.js";
import * as levels from "../js/levels.js";

/** Проигрывает ответы по одному слову за один заход и возвращает итоговый уровень. */
function play(startLv, answers, { written = false } = {}) {
  const t = newTracker();
  let srs = { ...levels.newSrs(), lv: startLv };
  let requeues = 0;
  for (const a of answers) {
    const { effective, requeue } = judgeInSession(t, "w", a);
    srs = levels.answer(srs, effective, { written });
    if (requeue) requeues += 1;
  }
  return { lv: srs.lv, requeues };
}

test("несколько верных ответов за заход поднимают слово только на один уровень", () => {
  assert.equal(play(0, ["ok", "ok", "ok"]).lv, 1, "новое слово: 0 -> 1, а не 0 -> 3");
  assert.equal(play(1, ["ok", "ok"]).lv, 2);
  assert.equal(play(4, ["ok", "ok", "ok", "ok"]).lv, 5);
});

test("в Миксе слово, которое спросили тремя способами, растёт один раз", () => {
  // карточка, написание, слово в предложении — три верных ответа подряд
  assert.equal(play(2, ["ok", "ok", "ok"], {}).lv, 3);
});

test("ошибка сбрасывает уровень и возвращает слово; верный ответ после ошибки не поднимает", () => {
  const r = play(5, ["no", "ok"]);
  assert.equal(r.lv, 1, "сброс на первый, повторный верный ответ уровень не меняет");
  assert.equal(r.requeues, 1);
  assert.equal(play(5, ["no", "ok"], { written: true }).lv, 2, "в письменных режимах сброс на второй");
});

test("слово, которое верно ответили с первого раза, обратно не возвращается", () => {
  const t = newTracker();
  assert.equal(judgeInSession(t, "a", "ok").requeue, false);
  assert.equal(judgeInSession(t, "a", "near").requeue, false);
});

test("возвраты после ошибок ограничены", () => {
  const t = newTracker();
  const flags = [1, 2, 3, 4].map(() => judgeInSession(t, "a", "no").requeue);
  assert.deepEqual(flags, [true, true, false, false]);
});

test("разные слова не влияют друг на друга", () => {
  const t = newTracker();
  judgeInSession(t, "a", "no");
  assert.equal(judgeInSession(t, "b", "ok").effective, "ok");
});

test("возвращаемое слово встаёт через три карточки или в конец", () => {
  assert.equal(requeuePosition(2, 10), 5);
  assert.equal(requeuePosition(9, 10), 10);
  assert.equal(requeuePosition(1, 1), 1);
});

test("повторная ошибка по тому же слову за заход помечена: в трудные слова она не засчитывается", () => {
  const t = newTracker();
  assert.equal(judgeInSession(t, "w", "no").again, false, "первая ошибка");
  assert.equal(judgeInSession(t, "w", "no").again, true, "вторая за тот же заход");
  assert.equal(judgeInSession(t, "w", "no").again, true);
  assert.equal(judgeInSession(t, "other", "no").again, false, "другое слово считается отдельно");
  assert.equal(judgeInSession(t, "w", "ok").again, false);
});
