import test from "node:test";
import assert from "node:assert/strict";
import {
  LEARNED, plural, dayNumber, dayOfNumber, fmtDayShort, fmtDayLong, niceStep, linePath, activityGrid, describeDay,
  learnedSeries, learnedRecent, nearestPoint, describePoint, readByDay, bookMap, readingPace, finishEstimate, paceLine,
} from "../js/charts.js";
import { groupOf, levelSpread } from "../js/progress.js";

const at = (m, d, h = 12, min = 0) => new Date(2026, m - 1, d, h, min).getTime(); // месяц с 1
const NOW = at(10, 12, 15, 0); // понедельник, 12 октября 2026
const DAY = 86400000;

test("номера суток и обратно; подписи дат", () => {
  assert.equal(dayOfNumber(dayNumber("2026-10-12")), "2026-10-12");
  assert.equal(dayNumber("2026-10-13") - dayNumber("2026-10-12"), 1);
  assert.equal(dayNumber("2026-11-01") - dayNumber("2026-10-25"), 7, "через переводы часов сутки остаются сутками");
  assert.equal(fmtDayShort("2026-10-02"), "2 окт");
  assert.equal(fmtDayLong("2026-10-12"), "пн, 12 октября");
  assert.equal(fmtDayLong("2026-10-18"), "вс, 18 октября");
  assert.equal(plural(1, ["слово", "слова", "слов"]), "слово");
  assert.equal(plural(12, ["слово", "слова", "слов"]), "слов");
});

test("шаг шкалы: 1, 2, 5, 10…, не меньше 1; линия", () => {
  assert.equal(niceStep(0), 1);
  assert.equal(niceStep(0.3), 1);
  assert.equal(niceStep(1), 1);
  assert.equal(niceStep(1.2), 2);
  assert.equal(niceStep(4), 5);
  assert.equal(niceStep(12.3), 20);
  assert.equal(niceStep(62), 100);
  assert.equal(niceStep(250), 500);
  assert.equal(linePath([{ x: 0, y: 10 }, { x: 5.25, y: 3.04 }]), "M0.0 10.0L5.3 3.0");
  assert.equal(linePath([]), "");
});

test("уровень «выучено» совпадает с группой «Знаю» в окне «Прогресс»", () => {
  assert.equal(groupOf(LEARNED), "known");
  assert.equal(groupOf(LEARNED - 1), "learning");
});

// ── календарь занятий ───────────────────────────────────────────────────────
test("календарь: недели с понедельника, последняя колонка кончается сегодня", () => {
  const g = activityGrid([], { read: {} }, NOW);
  assert.equal(g.cells.length, 16 * 7 + 1, "в понедельник в последней колонке одна клетка");
  assert.equal(g.cells[0].day, "2026-06-22");
  assert.deepEqual([g.cells[0].col, g.cells[0].row], [0, 0], "первая клетка — понедельник");
  const last = g.cells[g.cells.length - 1];
  assert.deepEqual([last.day, last.col, last.row], ["2026-10-12", 16, 0]);

  const wed = activityGrid([], { read: {} }, at(10, 14));
  assert.equal(wed.cells.length, 16 * 7 + 3);
  const l2 = wed.cells[wed.cells.length - 1];
  assert.deepEqual([l2.day, l2.col, l2.row], ["2026-10-14", 16, 2]);
  assert.ok(wed.cells.every((c, i) => c.col === Math.floor(i / 7) && c.row === i % 7));
  assert.equal(new Date(dayNumber(wed.cells[0].day) * DAY).getUTCDay(), 1, "первый день — понедельник");
  assert.equal(g.activeDays, 0);
  assert.ok(g.cells.every((c) => c.level === 0 && !c.active));
});

test("календарь: день занятый от одного повторения или минуты чтения; насыщенность — по четвертям занятых дней", () => {
  const rows = (day, n, h = 12) => Array.from({ length: n }, (_, i) => ({ id: "w:a", t: at(10, day, h, i), result: "ok" }));
  const log = [...rows(12, 5), ...rows(11, 1), ...rows(10, 10)];
  const act = { read: { "2026-10-09": 300, "2026-10-08": 30 } }; // 5 минут = 10 «повторений» по насыщенности; полминуты не в счёт
  const g = activityGrid(log, act, NOW);
  const by = Object.fromEntries(g.cells.map((c) => [c.day, c]));
  assert.equal(g.activeDays, 4);
  assert.equal(by["2026-10-08"].active, false, "меньше минуты чтения — занятий нет, как и для серии");
  assert.equal(by["2026-10-08"].level, 0);
  assert.equal(by["2026-10-11"].level, 1);
  assert.equal(by["2026-10-12"].level, 2);
  assert.equal(by["2026-10-10"].level, 4);
  assert.equal(by["2026-10-09"].level, 4);
  assert.equal(by["2026-10-12"].n, 5);
  assert.equal(by["2026-10-09"].sec, 300);
  // ночной ответ в 3:00 входит в предыдущий учебный день
  const night = activityGrid([{ id: "w:a", t: at(10, 12, 3, 0), result: "ok" }], { read: {} }, NOW);
  assert.equal(night.cells.find((c) => c.day === "2026-10-11").n, 1);
  assert.equal(night.cells.find((c) => c.day === "2026-10-12").n, 0);
});

test("календарь: один занятый день — самый тёмный; подписи месяцев не наезжают друг на друга", () => {
  const one = activityGrid([{ id: "w:a", t: at(10, 12), result: "ok" }], null, NOW);
  assert.equal(one.cells.at(-1).level, 4);
  const g = activityGrid([], { read: {} }, NOW);
  assert.ok(g.months.length >= 3);
  for (let i = 1; i < g.months.length; i++) assert.ok(g.months[i].col - g.months[i - 1].col >= 3, "между подписями не меньше трёх колонок");
  for (const m of g.months) assert.equal(+g.cells[m.col * 7].day.slice(5, 7) - 1, m.month, "подпись стоит над колонкой своего месяца");
  assert.deepEqual(g.months.at(-1), { col: 15, month: 9, label: "окт" });
});

test("подпись дня: повторения и чтение или «занятий не было»", () => {
  assert.equal(describeDay({ day: "2026-10-12", n: 34, sec: 1080 }), "пн, 12 октября: 34 повторения, чтение 18 мин");
  assert.equal(describeDay({ day: "2026-10-11", n: 1, sec: 0 }), "вс, 11 октября: 1 повторение");
  assert.equal(describeDay({ day: "2026-10-10", n: 0, sec: 600 }), "сб, 10 октября: чтение 10 мин");
  assert.equal(describeDay({ day: "2026-10-09", n: 0, sec: 20 }), "пт, 9 октября: занятий не было");
});

// ── выучено слов ────────────────────────────────────────────────────────────
const card = (id, lv, extra = {}) => ({ id, srs: { lv, last: null }, added: at(9, 1), ...extra });
const row = (id, t, lv) => ({ id, t, lv, result: "ok" });

test("кривая «Выучено слов»: каждое слово — в день, когда оно впервые стало «Знаю»; конец равен числу на главной", () => {
  const cards = [
    card("w:a", 5),
    card("w:b", 4),
    card("w:c", 3), // выучено было, но упало ниже «Знаю»: в кривую не входит
    card("w:d", 6, { skip: true }),
    card("w:e", 5, { srs: { lv: 5, last: at(10, 1) } }), // журнала нет: день последнего ответа
    card("w:f", 0),
  ];
  const log = [row("w:a", at(10, 2), 3), row("w:a", at(10, 5), 4), row("w:a", at(10, 9), 5), row("w:b", at(9, 20), 4), row("w:b", at(9, 25), 3), row("w:b", at(10, 3), 4), row("w:c", at(9, 22), 4), row("w:c", at(9, 23), 2), row("w:zzz", at(9, 1), 7)];
  const s = learnedSeries(cards, log, NOW);
  assert.equal(s.total, 3);
  const by = Object.fromEntries(s.points.map((p) => [p.day, p.n]));
  assert.equal(s.points[0].day, "2026-09-19", "кривая начинается с нуля за день до первого слова");
  assert.equal(by["2026-09-19"], 0);
  assert.equal(by["2026-09-20"], 1, "b: первый раз «Знаю» 20 сентября, а не после падения");
  assert.equal(by["2026-09-30"], 1);
  assert.equal(by["2026-10-01"], 2, "e: по дню последнего ответа");
  assert.equal(by["2026-10-04"], 2);
  assert.equal(by["2026-10-05"], 3, "a: 5 октября, а не 9-го, когда стало 5");
  assert.equal(s.points.at(-1).day, "2026-10-12");
  assert.equal(s.points.at(-1).n, 3);
  assert.equal(s.points.length, 24, "за каждый день");
  // как на главной: «Выучено слов» = «Знаю» + «Освоено»
  const sp = levelSpread(cards);
  assert.equal(s.total, sp.known + sp.mastered);
  for (let i = 1; i < s.points.length; i++) assert.ok(s.points[i].n >= s.points[i - 1].n, "кривая не убывает");
});

test("кривая: без выученных слов её нет; новая — не короче двух недель", () => {
  assert.equal(learnedSeries([card("w:a", 3), card("w:b", 6, { skip: true })], [], NOW), null);
  assert.equal(learnedRecent([card("w:a", 3)], [], NOW), null);
  const s = learnedSeries([card("w:a", 4)], [row("w:a", at(10, 11), 4)], NOW);
  assert.equal(s.points.length, 15);
  assert.equal(s.points[0].n, 0);
  assert.equal(s.points.at(-1).n, 1);
});

test("кривая за долгий срок берёт точки раз в неделю и заканчивается сегодняшним днём", () => {
  const s = learnedSeries([card("w:a", 5), card("w:b", 5)], [row("w:a", NOW - 200 * DAY, 4), row("w:b", NOW - 30 * DAY, 4)], NOW);
  assert.ok(s.points.length < 50 && s.points.length > 25, `точек: ${s.points.length}`);
  assert.equal(s.points.at(-1).day, "2026-10-12");
  assert.equal(s.points.at(-1).n, 2);
  assert.equal(s.points[0].n, 0);
  for (let i = 1; i < s.points.length; i++) {
    const gap = s.points[i].t - s.points[i - 1].t;
    assert.ok(gap > 0 && gap <= 7, `шаг ${gap}`);
  }
});

test("шкала кривой растёт вместе со словарём: верх всегда выше числа слов, цели нет", () => {
  for (const total of [1, 2, 3, 10, 37, 99, 100, 187, 1000, 5000]) {
    const cards = Array.from({ length: total }, (_, i) => card(`w:${i}`, 5, { srs: { lv: 5, last: NOW - (i % 30) * DAY } }));
    const s = learnedSeries(cards, [], NOW);
    assert.equal(s.total, total);
    assert.ok(s.max > total, `${total}: верх шкалы ${s.max}`);
    assert.equal(s.max % s.step, 0, "верх шкалы кратен шагу");
    assert.ok(Number.isInteger(s.step) && s.step >= 1);
    assert.ok(s.max < total * 1.6 + s.step, `${total}: шкала не раздута (${s.max})`);
    assert.equal("goal" in s || "target" in s, false);
  }
});

test("маленький график для главной: последние дни той же кривой", () => {
  const cards = [card("w:a", 5), card("w:b", 5)];
  const log = [row("w:a", NOW - 40 * DAY, 4), row("w:b", NOW - 3 * DAY, 4)];
  const r = learnedRecent(cards, log, NOW, 30);
  assert.equal(r.length, 30);
  assert.equal(r[0], 1, "первое слово выучено раньше окна");
  assert.equal(r.at(-1), 2);
  assert.equal(r[25], 1, "четыре дня назад выучено одно слово");
  assert.equal(r[26], 2, "три дня назад второе");
});

test("ближайшая точка кривой к доле времени и подпись", () => {
  const pts = [0, 1, 2, 3, 4].map((t) => ({ day: dayOfNumber(dayNumber("2026-10-08") + t), t: dayNumber("2026-10-08") + t, n: t * 10 }));
  assert.equal(nearestPoint(pts, 0), 0);
  assert.equal(nearestPoint(pts, 1), 4);
  assert.equal(nearestPoint(pts, 0.5), 2);
  assert.equal(nearestPoint(pts, 0.6), 2);
  assert.equal(nearestPoint(pts, 0.7), 3);
  assert.equal(nearestPoint(pts, -3), 0);
  assert.equal(nearestPoint(pts, 9), 4);
  assert.equal(describePoint({ day: "2026-10-12", n: 187 }), "12 окт: 187 слов");
  assert.equal(describePoint({ day: "2026-10-12", n: 1 }), "12 окт: 1 слово");
});

// ── чтение по дням ──────────────────────────────────────────────────────────
test("чтение по дням: последние дни, пустые тоже", () => {
  const r = readByDay({ read: { "2026-10-12": 1200, "2026-10-10": 90 } }, NOW, 14);
  assert.equal(r.length, 14);
  assert.deepEqual([r[13].day, r[13].n, r[13].sec], ["2026-10-12", 1200, 1200]);
  assert.equal(r[12].n, 0);
  assert.equal(r[11].n, 90);
  assert.equal(r[0].day, "2026-09-29");
});

// ── карта книги и темп ──────────────────────────────────────────────────────
test("карта книги: ширина по длине главы, прочитанные залиты, текущая до места", () => {
  const book = { chapters: [{ chars: 100 }, { chars: 300 }, { chars: 600 }], progress: { ch: 1, p: 4, f: 0.5 } };
  const m = bookMap(book);
  assert.deepEqual(m.segs.map((s) => s.fill), [1, 0.5, 0]);
  assert.deepEqual(m.segs.map((s) => +s.w.toFixed(3)), [0.1, 0.3, 0.6]);
  assert.deepEqual(m.segs.map((s) => +s.x.toFixed(3)), [0, 0.1, 0.4]);
  assert.deepEqual([m.ch, m.total, m.pct, m.finished], [1, 3, 25, false]);
  const done = bookMap({ ...book, progress: { ...book.progress, done: 5 } });
  assert.deepEqual(done.segs.map((s) => s.fill), [1, 1, 1]);
  assert.deepEqual([done.pct, done.finished], [100, true]);
  const fresh = bookMap({ chapters: [{ chars: 10 }, { chars: 10 }], progress: { ch: 0, p: 0 } });
  assert.deepEqual(fresh.segs.map((s) => s.fill), [0, 0]);
  const blind = bookMap({ chapters: [{}, {}, {}, {}], progress: { ch: 2, p: 0, f: 0 } });
  assert.deepEqual(blind.segs.map((s) => +s.w.toFixed(2)), [0.25, 0.25, 0.25, 0.25], "нет длин — главы поровну");
  assert.deepEqual(bookMap({ chapters: [] }).segs, []);
  assert.deepEqual(bookMap(undefined).segs, []);
});

test("темп чтения: слова в день от первого дня с данными до сегодня", () => {
  const words = (o) => ({ read: {}, words: o });
  const p = readingPace(words({ "2026-10-10": 500, "2026-10-11": 700, "2026-10-12": 300 }), NOW);
  assert.equal(p.span, 3);
  assert.equal(p.words, 1500);
  assert.equal(p.perDay, 500);
  // пропущенные дни внутри окна считаются нулями
  const gap = readingPace(words({ "2026-10-01": 1400 }), NOW);
  assert.equal(gap.span, 12);
  assert.ok(Math.abs(gap.perDay - 1400 / 12) < 1e-9);
  // слишком мало данных
  assert.equal(readingPace(words({ "2026-10-11": 900, "2026-10-12": 900 }), NOW), null, "меньше трёх дней");
  assert.equal(readingPace(words({ "2026-10-09": 100, "2026-10-12": 100 }), NOW), null, "меньше 600 слов");
  assert.equal(readingPace(words({}), NOW), null);
  assert.equal(readingPace({ read: {} }, NOW), null);
  assert.equal(readingPace(undefined, NOW), null);
  // вне окна не считается
  assert.equal(readingPace(words({ "2026-09-01": 5000 }), NOW), null);
});

test("когда дочитаете: по оставшимся словам и темпу", () => {
  const book = { chapters: [{ chars: 1000 }, { chars: 1000 }], progress: { ch: 1, p: 0, f: 0 }, stats: { tokens: 100000 } };
  const e = finishEstimate(book, { perDay: 500 });
  assert.deepEqual(e, { days: 100, left: 50000 });
  assert.equal(finishEstimate(book, null), null);
  assert.equal(finishEstimate({ ...book, progress: { ch: 1, p: 0, f: 0, done: 1 } }, { perDay: 500 }), null, "прочитанная книга");
  assert.equal(finishEstimate(book, { perDay: 0 }), null);
  assert.equal(finishEstimate(book, { perDay: 30000 }).days, 2);
});

test("фраза про темп", () => {
  assert.match(paceLine(null, null, NOW), /появится после нескольких дней чтения/);
  assert.equal(paceLine({ perDay: 500 }, null, NOW), "", "книга прочитана — про темп молчим");
  assert.equal(paceLine({ perDay: 823 }, { days: 10 }, NOW), "В таком темпе (около 820 слов в день) дочитаете примерно 22 октября.");
  assert.equal(paceLine({ perDay: 500 }, { days: 1 }, NOW), "В таком темпе (около 500 слов в день) дочитаете завтра.");
  assert.equal(paceLine({ perDay: 500 }, { days: 100 }, NOW), "В таком темпе (около 500 слов в день) дочитаете примерно в январе 2027.");
  assert.match(paceLine({ perDay: 1400 }, { days: 100 }, NOW), /около 1,4 тыс\. слов в день/);
  assert.equal(paceLine({ perDay: 20 }, { days: 5000 }, NOW), "В таком темпе (около 20 слов в день) это больше двух лет.");
  assert.match(paceLine({ perDay: 3 }, { days: 12 }, NOW), /около 10 слов/, "меньше десяти не пишем");
});
