import test from "node:test";
import assert from "node:assert/strict";
import { readFraction, chapterIndex, isFinished, atEnd, almostDone, bookWords, wordsRead, shelfStats, bookProgress, mergeProgress, placeToKeep, fmtWords, totalChars, CHARS_PER_WORD } from "../js/reading.js";

const book = (chars, progress, extra = {}) => ({ chapters: chars.map((n, i) => ({ href: `c${i}.xhtml`, title: `Chapter ${i + 1}`, chars: n })), progress, ...extra });

test("доля книги считается по длине глав, а не по их числу", () => {
  const b = book([1000, 1000, 8000], { ch: 2, p: 0, f: 0 });
  assert.equal(readFraction(b), 0.2, "две короткие главы позади: 20%, а не две трети");
  assert.equal(readFraction({ ...b, progress: { ch: 2, p: 5, f: 0.5 } }), 0.6, "середина длинной главы");
  assert.equal(readFraction({ ...b, progress: { ch: 0, p: 0, f: 0 } }), 0);
  assert.equal(readFraction({ ...b, progress: { ch: 2, p: 9, f: 1 } }), 1);
});

test("запись из прежней версии без доли прокрутки: абзац не первый — считаем серединой главы", () => {
  const b = book([1000, 1000], { ch: 0, p: 3 });
  assert.equal(readFraction(b), 0.25);
  assert.equal(readFraction({ ...b, progress: { ch: 0, p: 0 } }), 0);
  assert.equal(readFraction({ ...b, progress: undefined }), 0, "места нет совсем");
});

test("испорченное место и странные книги не ломают расчёт", () => {
  const b = book([500, 500], { ch: 99, p: 0, f: 5 });
  assert.equal(chapterIndex(b), 1, "глава за концом: последняя");
  assert.ok(readFraction(b) <= 1, "доля прокрутки больше единицы обрезается");
  assert.equal(readFraction({ chapters: [], progress: { ch: 0 } }), 0);
  assert.equal(readFraction(null), 0);
  const noChars = book([0, 0, 0], { ch: 1, p: 0 });
  assert.equal(readFraction(noChars), 0.5, "длины неизвестны: по числу глав");
  assert.equal(totalChars(noChars), 0);
  assert.equal(chapterIndex({ chapters: [{}], progress: { ch: -3 } }), 0);
});

test("отметка «прочитана»", () => {
  assert.equal(isFinished(book([10], { ch: 0, p: 0, done: 5 })), true);
  assert.equal(isFinished(book([10], { ch: 0, p: 0 })), false);
  assert.equal(isFinished(undefined), false);
  assert.equal(bookProgress(book([10, 10], { ch: 0, p: 0, done: 5 })).pct, 100);
  assert.equal(bookProgress(book([10, 10], { ch: 1, p: 0, f: 0 })).pct, 50);
  const p = bookProgress(book([10, 10, 10], { ch: 2, p: 0 }));
  assert.deepEqual([p.ch, p.total, p.finished], [2, 3, false]);
});

test("дочтено до конца: последняя глава и низ экрана", () => {
  assert.equal(atEnd(3, 4, 1960, 2000), true, "до низа осталось меньше 48 пикселей");
  assert.equal(atEnd(3, 4, 1940, 2000), false, "ещё 60 пикселей");
  assert.equal(atEnd(3, 4, 1000, 2000), false);
  assert.equal(atEnd(2, 4, 2000, 2000), false, "это не последняя глава");
  assert.equal(atEnd(0, 1, 0, 0), true, "книга из одной главы, которая помещается на экране");
});

test("почти дочитана: 97% и последние две главы (в конце бывает лицензия)", () => {
  assert.equal(almostDone(book([9800, 100, 100], { ch: 1, p: 0, f: 0 })), true);
  assert.equal(almostDone(book([9800, 100, 100], { ch: 0, p: 0, f: 1 })), false, "процент высокий, но это не конец книги: глава одна из первых");
  assert.equal(almostDone(book([5000, 5000], { ch: 1, p: 0, f: 0.9 })), false);
  assert.equal(almostDone(book([5000, 5000], { ch: 1, p: 0, f: 0.99 })), true);
});

test("слов в книге: из разбора, а без него по числу знаков", () => {
  assert.equal(bookWords(book([5900], { ch: 0, p: 0 })), Math.round(5900 / CHARS_PER_WORD));
  assert.equal(bookWords(book([5900], { ch: 0, p: 0 }, { stats: { tokens: 800 } })), 800);
  assert.equal(bookWords(book([5900], { ch: 0, p: 0 }, { stats: { tokens: 0 } })), 1000, "в разборе пусто: по знакам");
  assert.equal(wordsRead(book([5000, 5000], { ch: 1, p: 0, f: 0 }, { stats: { tokens: 1000 } })), 500);
  assert.equal(wordsRead(book([5000, 5000], { ch: 0, p: 0, f: 0, done: 9 }, { stats: { tokens: 1000 } })), 1000, "прочитанная книга считается целиком");
});

test("сводка по полке", () => {
  const a = book([1000], { ch: 0, p: 0, f: 1, done: 1 }, { stats: { tokens: 200 }, opened: 1 });
  const b = book([1000, 1000], { ch: 1, p: 2, f: 0.5 }, { stats: { tokens: 400 }, opened: 2 });
  const c = book([1000], { ch: 0, p: 0 }, { stats: { tokens: 100 } });
  const s = shelfStats([a, b, c]);
  assert.deepEqual(s, { total: 3, finished: 1, reading: 1, words: 200 + 300 + 0 });
  assert.deepEqual(shelfStats([]), { total: 0, finished: 0, reading: 0, words: 0 });
  assert.deepEqual(shelfStats(undefined), { total: 0, finished: 0, reading: 0, words: 0 });
});

test("место из копии не теряет отметку «прочитана»", () => {
  assert.deepEqual(mergeProgress({ ch: 1, p: 0, done: 50 }, { ch: 3, p: 4, f: 0.2 }), { ch: 3, p: 4, f: 0.2, done: 50 });
  assert.deepEqual(mergeProgress({ ch: 1, p: 0 }, { ch: 3, p: 4, done: 70 }), { ch: 3, p: 4, done: 70 });
  assert.deepEqual(mergeProgress({ ch: 1, p: 0, done: 50 }, { ch: 3, p: 4, done: 70 }), { ch: 3, p: 4, done: 50 }, "берётся более ранняя отметка");
  assert.deepEqual(mergeProgress({ ch: 1, p: 0 }, { ch: 3, p: 4 }), { ch: 3, p: 4 });
  assert.deepEqual(mergeProgress({ ch: 1, p: 0 }, undefined), { ch: 1, p: 0 });
});

test("число слов коротко", () => {
  assert.equal(fmtWords(0), "0");
  assert.equal(fmtWords(820), "820");
  assert.equal(fmtWords(1234), "1,2 тыс.");
  assert.equal(fmtWords(12300), "12,3 тыс.");
  assert.equal(fmtWords(456789), "457 тыс.");
  assert.equal(fmtWords(1400000), "1,4 млн");
});

test("при удалении книги запоминается место, отметка «прочитана» и доля главы; у нетронутой книги запоминать нечего", () => {
  assert.equal(placeToKeep(book([1000, 1000], { ch: 0, p: 0 })), null);
  assert.equal(placeToKeep(book([1000, 1000], { ch: 0, p: 0, f: 0 })), null);
  assert.equal(placeToKeep(book([1000, 1000], undefined)), null);
  assert.equal(placeToKeep(null), null);
  assert.deepEqual(placeToKeep(book([1000, 1000, 1000], { ch: 2, p: 14, f: 0.4 })), { ch: 2, p: 14, f: 0.4 });
  assert.deepEqual(placeToKeep(book([1000, 1000], { ch: 0, p: 3 })), { ch: 0, p: 3 }, "доли прокрутки нет (запись старой версии): остаётся как есть");
  assert.deepEqual(placeToKeep(book([1000, 1000], { ch: 1, p: 9, f: 1, done: 1700000000000 })), { ch: 1, p: 9, f: 1, done: 1700000000000 });
  assert.deepEqual(placeToKeep(book([1000], { ch: 0, p: 0, done: 5 })), { ch: 0, p: 0, done: 5 }, "прочитана, хотя место в начале (отметили вручную)");
});
