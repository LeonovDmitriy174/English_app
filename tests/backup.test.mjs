import test from "node:test";
import assert from "node:assert/strict";
import { ageDays, ageLabel, nudge, snoozeUntil, nudgeText, backupName, NUDGE_DAYS, SNOOZE_DAYS, WORTH } from "../js/backup.js";

const DAY = 86400000;
// 12 октября 2026, полдень по местному времени
const NOW = new Date(2026, 9, 12, 12, 0, 0).getTime();
const daysAgo = (n, hour = 9) => {
  const d = new Date(NOW);
  d.setDate(d.getDate() - n);
  d.setHours(hour, 0, 0, 0);
  return d.getTime();
};

test("возраст копии считается календарными днями, а не сутками", () => {
  assert.equal(ageDays(daysAgo(0, 1), NOW), 0);
  assert.equal(ageDays(daysAgo(1, 23), NOW), 1); // вчера в 23:00 — это вчера, хотя прошло 13 часов
  assert.equal(ageDays(daysAgo(14), NOW), 14);
  assert.equal(ageDays(null, NOW), null);
  assert.equal(ageDays(undefined, NOW), null);
});

test("часы, ушедшие назад, не дают отрицательный возраст", () => {
  assert.equal(ageDays(NOW + 3 * DAY, NOW), 0);
});

test("подпись возраста копии", () => {
  assert.equal(ageLabel(null, NOW), null);
  assert.equal(ageLabel(daysAgo(0), NOW), "сегодня");
  assert.equal(ageLabel(daysAgo(1), NOW), "вчера");
  assert.equal(ageLabel(daysAgo(2), NOW), "2 дня назад");
  assert.equal(ageLabel(daysAgo(5), NOW), "5 дней назад");
  assert.equal(ageLabel(daysAgo(11), NOW), "11 дней назад");
  assert.equal(ageLabel(daysAgo(21), NOW), "21 день назад");
  assert.equal(ageLabel(daysAgo(61), NOW), "больше двух месяцев назад");
});

test("напоминание: свежая копия — молчим, старая — напоминаем", () => {
  const base = { cards: 50, notes: 0, now: NOW };
  assert.equal(nudge({ ...base, at: daysAgo(3) }).show, false);
  assert.equal(nudge({ ...base, at: daysAgo(NUDGE_DAYS - 1) }).show, false);
  const r = nudge({ ...base, at: daysAgo(NUDGE_DAYS) });
  assert.equal(r.show, true);
  assert.equal(r.never, false);
  assert.equal(r.days, NUDGE_DAYS);
});

test("напоминание: пока копий не было, отсчёт идёт от первых данных", () => {
  const base = { cards: 50, notes: 0, at: null, now: NOW };
  assert.equal(nudge({ ...base, since: daysAgo(3) }).show, false, "данные появились три дня назад: рано");
  const r = nudge({ ...base, since: daysAgo(30) });
  assert.equal(r.show, true);
  assert.equal(r.never, true);
  assert.equal(r.days, 30);
  assert.equal(nudge({ ...base, since: null }).show, false, "данных нет вообще: напоминать не о чем");
});

test("напоминание: копия мелких данных не нужна", () => {
  const old = { at: daysAgo(40), now: NOW };
  assert.equal(nudge({ ...old, cards: 0, notes: 0 }).show, false);
  assert.equal(nudge({ ...old, cards: WORTH - 1, notes: 0 }).show, false);
  assert.equal(nudge({ ...old, cards: WORTH, notes: 0 }).show, true);
  assert.equal(nudge({ ...old, cards: 4, notes: WORTH - 4 }).show, true, "карточки и заметки считаются вместе");
});

test("«Позже» откладывает напоминание на несколько дней, потом оно возвращается", () => {
  const until = snoozeUntil(NOW);
  assert.equal(until, NOW + SNOOZE_DAYS * DAY);
  const base = { cards: 50, at: daysAgo(30), now: NOW };
  assert.equal(nudge({ ...base, snoozeUntil: until }).show, false);
  assert.equal(nudge({ ...base, snoozeUntil: until, now: until - 1 }).show, false);
  assert.equal(nudge({ ...base, snoozeUntil: until, now: until + 1 }).show, true);
});

test("текст напоминания", () => {
  assert.match(nudgeText({ never: true, days: 20 }, 120), /ещё не было, а слов уже 120/);
  assert.match(nudgeText({ never: false, days: 15 }), /не делалась 15 дней/);
  assert.match(nudgeText({ never: false, days: 21 }), /не делалась 21 день/);
});

test("имя файла копии по местной дате", () => {
  assert.equal(backupName(new Date(2026, 0, 5, 23, 59).getTime()), "ember-backup-2026-01-05.json");
  assert.equal(backupName(NOW), "ember-backup-2026-10-12.json");
});
