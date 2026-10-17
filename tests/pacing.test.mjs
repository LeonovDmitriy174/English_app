import test from "node:test";
import assert from "node:assert/strict";
import { dueInDays, studyDay } from "../js/levels.js";
import { addedSrs } from "../js/freqdeck.js";
import { DEFAULT_CAP, CAP_MIN, CAP_MAX, EXTRA_STEP, reviewCap, emptyDaily, normalizeDaily, takeToday, dueLoad, spreadBudget, spreadDue } from "../js/pacing.js";

const NOW = new Date(2026, 9, 17, 13, 0).getTime();
const DAY = 86400000;
const cards = (n, due = NOW - 1000, extra = {}) => Array.from({ length: n }, (_, i) => ({ id: `w:c${i}`, srs: { lv: 3, due: due + i }, ...extra }));

test("лимит в день: значение по умолчанию, границы, мусор", () => {
  assert.equal(DEFAULT_CAP, 100);
  assert.equal(reviewCap({}), 100);
  assert.equal(reviewCap({ reviewsPerDay: 120 }), 120);
  assert.equal(reviewCap({ reviewsPerDay: 5 }), CAP_MIN);
  assert.equal(reviewCap({ reviewsPerDay: 9999 }), CAP_MAX);
  assert.equal(reviewCap({ reviewsPerDay: "abc" }), 100);
  assert.equal(reviewCap({ reviewsPerDay: 75.4 }), 75);
  assert.equal(reviewCap(null), 100);
});

test("запись дня: чужой день и мусор обнуляются, лишнее отбрасывается", () => {
  assert.deepEqual(normalizeDaily(undefined, "2026-10-17"), emptyDaily("2026-10-17"));
  assert.deepEqual(normalizeDaily({ day: "2026-10-16", newDone: 5, rev: ["a"] }, "2026-10-17"), emptyDaily("2026-10-17"));
  assert.deepEqual(normalizeDaily({ day: "2026-10-17", newDone: 3 }, "2026-10-17"), { day: "2026-10-17", newDone: 3, rev: [], nw: [], extra: 0 }, "старая запись без новых полей читается");
  const d = normalizeDaily({ day: "d", newDone: -2, rev: ["a", "a", 7, null, "b"], nw: "x", extra: 49.9 }, "d");
  assert.deepEqual(d.rev, ["a", "b"]);
  assert.deepEqual(d.nw, []);
  assert.equal(d.newDone, 0);
  assert.equal(d.extra, 49);
});

test("за день предлагается не больше лимита, самые давние первыми", () => {
  const due = cards(250);
  const r = takeToday(due, emptyDaily("d"), 100);
  assert.equal(r.list.length, 100);
  assert.equal(r.held, 150);
  assert.equal(r.room, 0);
  assert.equal(r.list[0].id, "w:c0");
  assert.equal(r.list[99].id, "w:c99");
  const few = takeToday(cards(30), emptyDaily("d"), 100);
  assert.equal(few.list.length, 30);
  assert.equal(few.held, 0);
  assert.equal(few.room, 70);
});

test("повторённые сегодня считаются в лимит, а карточка с короткими шагами остаётся в очереди", () => {
  const due = cards(60);
  const daily = { ...emptyDaily("d"), rev: due.slice(0, 40).map((c) => c.id) };
  // 40 карточек уже повторили (и они снова просрочены, например после ошибки): они остаются, лимит 50 оставляет место ещё на 10
  const r = takeToday(due, daily, 50);
  assert.equal(r.list.length, 50, "40 начатых и 10 новых из очереди");
  assert.equal(r.held, 10);
  // слово, с которого сегодня началось изучение, в лимит не считается, но из очереди не уходит
  const nw = { ...emptyDaily("d"), nw: ["w:c59"], rev: [] };
  const only = takeToday(cards(60), nw, 10);
  assert.ok(only.list.some((c) => c.id === "w:c59"), "начатое сегодня слово осталось");
  assert.equal(only.list.length, 11);
});

test("«Ещё»: добавка к лимиту увеличивает очередь на шаг", () => {
  const due = cards(300);
  const daily = { ...emptyDaily("d"), extra: EXTRA_STEP };
  assert.equal(takeToday(due, daily, 100).list.length, 150);
  assert.equal(takeToday(due, { ...daily, extra: 2 * EXTRA_STEP }, 100).list.length, 200);
  assert.equal(takeToday(due, daily, 100).held, 150);
});

test("нагрузка по дням: просроченные за сегодня, новые и скрытые не считаются", () => {
  const list = [
    { id: "a", srs: { lv: 4, due: NOW - 5 * DAY } },
    { id: "b", srs: { lv: 4, due: NOW - 1 } },
    { id: "c", srs: { lv: 5, due: dueInDays(NOW, 2) } },
    { id: "d", srs: { lv: 5, due: dueInDays(NOW, 2) } },
    { id: "e", srs: { lv: 0, due: NOW } },
    { id: "f", srs: { lv: 6, due: dueInDays(NOW, 3) }, skip: true },
    { id: "g" },
  ];
  const load = dueLoad(list, NOW);
  assert.equal(load.get(studyDay(NOW)), 2);
  assert.equal(load.get(studyDay(dueInDays(NOW, 2))), 2);
  assert.equal(load.size, 2);
  assert.equal(spreadBudget(100), 50);
  assert.equal(spreadBudget(30), 15);
  assert.equal(spreadBudget(10), 10);
});

test("разброс сроков: каждый день получает не больше бюджета, дни идут подряд", () => {
  const load = new Map();
  const perDay = new Map();
  for (let i = 0; i < 230; i++) {
    const due = spreadDue(NOW, 3, { load, budget: 50 });
    perDay.set(studyDay(due), (perDay.get(studyDay(due)) || 0) + 1);
  }
  const days = [...perDay.keys()].sort();
  assert.equal(days.length, 5, "230 карточек по 50 на день это пять дней");
  assert.deepEqual([...perDay.values()].sort((a, b) => b - a), [50, 50, 50, 50, 30]);
  assert.equal(days[0], studyDay(dueInDays(NOW, 3)), "первый день это свой срок: три дня");
  const keys = days.map((k) => new Date(k).getTime());
  assert.ok(keys.every((t, i) => i === 0 || t - keys[i - 1] === DAY), "дни идут подряд, без дыр");
});

test("разброс сроков учитывает уже занятые дни и не уходит дальше предела", () => {
  const busy = new Map([[studyDay(dueInDays(NOW, 3)), 50], [studyDay(dueInDays(NOW, 4)), 60]]);
  const due = spreadDue(NOW, 3, { load: busy, budget: 50 });
  assert.equal(due, dueInDays(NOW, 5), "заняты третий и четвёртый день: слово уходит на пятый");
  // всё занято до предела: берётся самый свободный день, а не бесконечный сдвиг
  const full = new Map();
  for (let k = 0; k <= 3; k++) full.set(studyDay(dueInDays(NOW, 3 + k)), 50 + k);
  const at = spreadDue(NOW, 3, { load: full, budget: 50, maxSpread: 3 });
  assert.equal(at, dueInDays(NOW, 3), "при равной перегрузке выигрывает самый свободный (и ранний)");
  assert.equal(full.get(studyDay(at)), 51);
  assert.equal(spreadDue(NOW, 3), dueInDays(NOW, 3), "без плана срок обычный");
});

test("слово из проверки с планом: уровень шестой, срок не раньше трёх суток и не позже двух недель, бюджет соблюдается", () => {
  const load = new Map();
  const per = new Map();
  for (let i = 0; i < 700; i++) {
    const s = addedSrs(NOW, 6, { load, budget: 50 });
    assert.equal(s.lv, 6);
    assert.ok(s.due >= dueInDays(NOW, 3) && s.due <= dueInDays(NOW, 17));
    per.set(studyDay(s.due), (per.get(studyDay(s.due)) || 0) + 1);
  }
  assert.ok(per.size >= 14, "семьсот слов не вернулись за три дня");
  const most = Math.max(...per.values());
  assert.ok(most <= 50 + Math.ceil(700 / 15), `в самый загруженный день ${most}`);
  const slow = addedSrs(NOW, 4, { load: new Map(), budget: 50 });
  assert.equal(slow.lv, 4);
  assert.equal(slow.due, dueInDays(NOW, 1));
});
