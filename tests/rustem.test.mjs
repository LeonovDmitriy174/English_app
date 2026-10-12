import test from "node:test";
import assert from "node:assert/strict";
import { ruStem } from "../js/rustem.js";

const same = (...words) => {
  const stems = new Set(words.map(ruStem));
  assert.equal(stems.size, 1, `${words.join(", ")} → ${words.map(ruStem).join(", ")}`);
};

test("одно слово в разных формах даёт одну основу", () => {
  same("красивая", "красивый", "красиво", "красивые");
  same("собака", "собаки", "собакой");
  same("книга", "книги", "книгами");
  same("дом", "дома", "домом");
  same("быстро", "быстрый", "быстрее");
  same("говорить", "говорил", "говорит");
  same("бежать", "бежал", "бежали");
  same("жизнь", "жизни");
  same("абсолютно", "абсолютный");
});

test("основа: конкретные значения", () => {
  assert.equal(ruStem("красивая"), "красив");
  assert.equal(ruStem("собаки"), "собак");
  assert.equal(ruStem("бежать"), "бежа");
  assert.equal(ruStem("абсолютный"), "абсолютн");
  assert.equal(ruStem("счастливый"), "счастлив");
});

test("разные слова не склеиваются", () => {
  assert.notEqual(ruStem("дом"), ruStem("домашний"));
  assert.notEqual(ruStem("красивый"), ruStem("краска"));
  assert.notEqual(ruStem("собака"), ruStem("собрание"));
});

test("«ё» приравнивается к «е», регистр не важен", () => {
  assert.equal(ruStem("Ёлка"), ruStem("елка"));
  assert.equal(ruStem("КНИГИ"), "книг");
});

test("короткие и пустые слова не ломаются", () => {
  assert.equal(ruStem(""), "");
  assert.equal(ruStem(undefined), "");
  assert.equal(ruStem("я"), "я");
  assert.equal(ruStem("он"), "он");
  assert.equal(ruStem("мы"), "мы");
  assert.equal(ruStem("b"), "b", "не русские слова остаются как есть");
});
