// Случайные проверки со своим датчиком: тысячи ответов, сроков и дней подряд. Датчик с зерном, поэтому тест каждый раз тот же.
// Проверяются свойства, которые должны выполняться всегда, а не отдельные примеры (отдельные примеры лежат в levels.test.mjs и pacing.test.mjs).
import test from "node:test";
import assert from "node:assert/strict";
import { answer, dueFor, dueInDays, studyDay, MAX_LEVEL, FLOOR, PENALTY, LADDER, newSrs, isMastered, isLeech, migrateSrs, fromLegacy, sanitizeSrs, WAITS, ROLLOVER } from "../js/levels.js";
import { takeToday, spreadDue, dueLoad, normalizeDaily, emptyDaily, reviewCap, CAP_MIN, CAP_MAX, DEFAULT_CAP } from "../js/pacing.js";

/** mulberry32: маленький датчик случайных чисел с зерном. */
function rng(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const pick = (r, xs) => xs[Math.floor(r() * xs.length)];
const DAY = 86400000;

/** Часовые пояса с переводом часов в разное время, в том числе на полчаса (Лорд-Хау) и без перевода (Екатеринбург). */
const ZONES = ["Asia/Yekaterinburg", "Europe/London", "America/New_York", "Australia/Lord_Howe", "Pacific/Apia", "Asia/Kolkata", "UTC"];

function inZone(tz, fn) {
  const before = process.env.TZ;
  process.env.TZ = tz;
  try {
    fn();
  } finally {
    if (before === undefined) delete process.env.TZ;
    else process.env.TZ = before;
  }
}

test("ответы: уровень, срок и счётчики остаются в допустимых пределах при любой последовательности", () => {
  const r = rng(20261018);
  for (let run = 0; run < 400; run++) {
    let srs = r() < 0.3 ? undefined : newSrs(1.7e12);
    let now = 1.7e12 + Math.floor(r() * 400) * DAY;
    let lapses = srs?.lapses || 0;
    for (let step = 0; step < 60; step++) {
      const result = pick(r, ["ok", "ok", "ok", "near", "no"]);
      const written = r() < 0.4;
      const cap = r() < 0.2 ? pick(r, [1, 3, 6, MAX_LEVEL, 99]) : MAX_LEVEL;
      const repeat = r() < 0.15;
      const prev = srs?.lv || 0;
      now += Math.floor(r() * 3 * DAY);
      const next = answer(srs, result, { written, now, cap, repeat });
      assert.ok(Number.isInteger(next.lv) && next.lv >= 1 && next.lv <= MAX_LEVEL, `уровень ${next.lv}`);
      assert.ok(Number.isFinite(next.due) && next.due > now, "срок в будущем и число");
      assert.equal(next.v, LADDER);
      assert.equal(next.reps, (srs?.reps || 0) + 1);
      assert.ok(next.lapses >= lapses, "срывы не убывают");
      lapses = next.lapses;
      if (result === "ok") assert.ok(next.lv >= prev && next.lv <= prev + 1, "верный ответ поднимает не больше чем на ступень");
      if (result === "no" && !repeat) assert.ok(next.lv <= Math.max(prev, 1), "ошибка не поднимает");
      if (result === "no" && prev > 0) assert.ok(next.lv >= Math.min(prev, written ? FLOOR.written : FLOOR.read), "ниже пола ошибка не опускает");
      if (result === "no" && prev > PENALTY + 2) assert.ok(next.lv >= prev - PENALTY, "штраф не больше положенного");
      assert.equal(isMastered(next), next.lv >= MAX_LEVEL);
      assert.equal(isLeech(next), next.lapses >= 4 && next.lv < MAX_LEVEL);
      srs = next;
    }
  }
});

test("сроки: dueFor не убывает с уровнем, dueInDays лежит в пределах полусуток от точного срока и не убывает", () => {
  for (const tz of ZONES) {
    inZone(tz, () => {
      const r = rng(7);
      for (let i = 0; i < 400; i++) {
        const now = 1.6e12 + Math.floor(r() * 3e11); // 2020–2029, с переводами часов
        let last = 0;
        for (let lv = 1; lv <= MAX_LEVEL; lv++) {
          const due = dueFor(lv, now);
          assert.ok(due > now && due >= last, `${tz}: уровень ${lv}`);
          last = due;
        }
        let prev = 0;
        for (let n = 1; n <= 40; n++) {
          const due = dueInDays(now, n);
          assert.ok(Math.abs(due - (now + n * DAY)) <= 0.5 * DAY + 3600000, `${tz}: ${n} дн. в пределах полусуток`);
          assert.ok(due >= prev, `${tz}: срок не убывает с n (${n})`);
          prev = due;
          const d = new Date(due);
          assert.equal(d.getHours(), ROLLOVER, `${tz}: срок наступает в ${ROLLOVER}:00`);
          assert.equal(d.getMinutes(), 0);
        }
      }
    });
  }
});

test("учебный день: ночное повторение входит в предыдущий день, формат «ГГГГ-ММ-ДД»", () => {
  for (const tz of ZONES) {
    inZone(tz, () => {
      const r = rng(11);
      for (let i = 0; i < 300; i++) {
        const t = 1.6e12 + Math.floor(r() * 3e11);
        const key = studyDay(t);
        assert.match(key, /^\d{4}-\d{2}-\d{2}$/);
        const next = studyDay(t + DAY);
        assert.ok(next > key, `${tz}: через сутки день следующий`);
        // срок «в 4:00» относится к дню, который начинается в этот момент
        const due = dueInDays(t, 3);
        assert.equal(studyDay(due), studyDay(due + 1000 * 60 * 60), "в течение дня ключ не меняется");
      }
    });
  }
});

test("takeToday: всё разложено без потерь, начатые сегодня остаются без лимита", () => {
  const r = rng(99);
  for (let i = 0; i < 500; i++) {
    const n = Math.floor(r() * 120);
    const due = Array.from({ length: n }, (_, k) => ({ id: `c${k}` }));
    const startedRev = due.filter(() => r() < 0.1).map((c) => c.id);
    const daily = { ...emptyDaily("2026-10-18"), rev: startedRev, nw: [], extra: Math.floor(r() * 100) };
    const cap = Math.floor(r() * 300);
    const out = takeToday(due, daily, cap);
    assert.equal(out.list.length + out.held, n, "предложено и отложено вместе дают всё");
    assert.ok(out.room >= 0);
    for (const id of startedRev) assert.ok(out.list.some((c) => c.id === id), "начатая сегодня карточка осталась в очереди");
    assert.equal(new Set(out.list.map((c) => c.id)).size, out.list.length, "без повторов");
  }
});

test("spreadDue: не раньше срока и не дальше maxSpread, нагрузка растёт на единицу", () => {
  const r = rng(5);
  for (const tz of ZONES) {
    inZone(tz, () => {
      const load = new Map();
      const now = 1.75e12;
      let total = 0;
      for (let i = 0; i < 300; i++) {
        const days = 1 + Math.floor(r() * 20);
        const due = spreadDue(now, days, { load, budget: 5, maxSpread: 14 });
        assert.ok(due >= dueInDays(now, days), "не раньше срока без разброса");
        assert.ok(due <= dueInDays(now, days + 14), "не дальше maxSpread");
        total += 1;
        assert.equal([...load.values()].reduce((s, x) => s + x, 0), total);
      }
    });
  }
});

test("dueLoad, normalizeDaily, reviewCap: любой мусор на входе даёт допустимый результат", () => {
  const junk = [undefined, null, 0, -1, NaN, Infinity, "abc", "7", [], {}, [1, 2], { day: 5 }, { rev: "x", nw: 3, extra: "y", newDone: {} }, { cap: "300" }, { reviewCap: 1e9 }, { reviewCap: -5 }, { reviewCap: NaN }];
  for (const j of junk) {
    const d = normalizeDaily(j, "2026-10-18");
    assert.equal(typeof d.day, "string");
    assert.ok(Array.isArray(d.rev) && Array.isArray(d.nw));
    assert.ok(Number.isFinite(d.extra) && d.extra >= 0 && Number.isFinite(d.newDone) && d.newDone >= 0);
    const cap = reviewCap(j);
    assert.ok(Number.isInteger(cap) && cap >= CAP_MIN && cap <= CAP_MAX, `лимит ${cap} для ${JSON.stringify(j)}`);
  }
  assert.equal(reviewCap({}), DEFAULT_CAP);
  const cards = [null, undefined, {}, { srs: null }, { srs: { lv: 3, due: NaN } }, { srs: { lv: 2, due: 1.75e12 } }, { srs: { lv: 0 } }, { skip: true, srs: { lv: 2, due: 1.75e12 } }];
  const load = dueLoad(cards, 1.75e12);
  assert.ok([...load.values()].every((n) => Number.isInteger(n) && n > 0));
});

test("перевод старых карточек и sanitizeSrs: любой мусор в srs приводится к допустимой карточке", () => {
  const r = rng(3);
  for (let i = 0; i < 2000; i++) {
    const v = pick(r, [undefined, 1, 2, 3, "x", null]);
    const lv = pick(r, [undefined, -3, 0, 1, 2.5, 5, 10, 11, 99, NaN, "4", null, Infinity]);
    const raw = { lv, due: pick(r, [1.7e12, NaN, undefined, "x", 1e18, null]), last: pick(r, [null, 1.7e12, "x", NaN]), reps: pick(r, [0, 5, -1, undefined, "3", 2.7]), lapses: pick(r, [0, 2, undefined, -4]), v };
    const out = sanitizeSrs(migrateSrs(raw));
    assert.ok(Number.isInteger(out.lv) && out.lv >= 0 && out.lv <= MAX_LEVEL, `lv ${lv} v ${v} → ${out.lv}`);
    assert.ok(Number.isFinite(out.due), `срок ${out.due}`);
    assert.ok(out.last === null || Number.isFinite(out.last));
    assert.ok(Number.isInteger(out.reps) && out.reps >= 0 && Number.isInteger(out.lapses) && out.lapses >= 0);
    assert.ok(out.v >= LADDER);
    assert.equal(sanitizeSrs(out), out, "исправная карточка возвращается как есть");
  }
  for (const f of [undefined, null, {}, { reps: 3 }, { state: "x" }, { due: "abc" }, { stability: -1 }, { state: 2, due: NaN, last: "x" }]) {
    const s = sanitizeSrs(fromLegacy(f));
    assert.ok(Number.isInteger(s.lv) && s.lv >= 0 && s.lv <= MAX_LEVEL && Number.isFinite(s.due));
  }
  for (const junk of [undefined, null, 0, "x", [], 5]) assert.equal(sanitizeSrs(junk).lv, 0, "не карточка: получается новая");
  const fresh = newSrs(5);
  assert.equal(sanitizeSrs(fresh), fresh);
  assert.equal(WAITS.length, MAX_LEVEL);
});
