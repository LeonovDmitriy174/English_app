// Цифры исследования Нейшна на экране «Топ слов по частотности» (js/research.js) и карточка с ними.
import test from "node:test";
import assert from "node:assert/strict";
import { STOPS, THRESHOLD, DEFAULT_STOP, STRIP, oneIn, unknownOf, unknownCells } from "../js/research.js";

test("отметки идут по возрастанию, охват растёт и остаётся меньше 100%", () => {
  for (let i = 1; i < STOPS.length; i++) {
    assert.ok(STOPS[i].n > STOPS[i - 1].n);
    assert.ok(STOPS[i].cover > STOPS[i - 1].cover);
  }
  assert.ok(STOPS.every((s) => s.cover > 0 && s.cover < 100));
  assert.ok(STOPS[DEFAULT_STOP], "открытая сразу отметка существует");
});

test("цифры совпадают со статьёй Нейшна (таблица 5, имена собственные учтены)", () => {
  assert.deepEqual(STOPS.map((s) => [s.n, s.cover]), [[1000, 82.93], [2000, 90.14], [3000, 93.28], [5000, 96.13], [7000, 97.43], [9000, 98.22]]);
  assert.equal(THRESHOLD, 98);
  // порог 98% впервые достигнут на 9000 семей: в статье «8–9 тысяч»
  assert.equal(STOPS.find((s) => s.cover >= THRESHOLD).n, 9000);
});

test("одно незнакомое слово из N", () => {
  assert.deepEqual(STOPS.map((s) => oneIn(s.cover)), [6, 10, 15, 26, 39, 56]);
  assert.equal(oneIn(98), 50, "порог в статье: одно слово из 50");
  assert.equal(oneIn(95), 20, "95%: одно слово из 20");
});

test("полоска из 50 слов: сколько незнакомых и где они стоят", () => {
  assert.deepEqual(STOPS.map((s) => unknownOf(s.cover)), [9, 5, 3, 2, 1, 1]);
  assert.equal(unknownOf(99.9), 1, "хотя бы одно слово незнакомо всегда");
  assert.deepEqual(unknownCells(1), [25]);
  const cells = unknownCells(9);
  assert.equal(new Set(cells).size, 9, "клетки не совпадают");
  assert.ok(cells.every((c) => c >= 0 && c < STRIP));
  assert.deepEqual(cells, [...cells].sort((a, b) => a - b));
  assert.ok(cells[0] < 5 && cells[8] >= STRIP - 6, "по всей длине, а не с краю");
});
