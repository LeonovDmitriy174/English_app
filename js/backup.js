// backup.js — когда пора напомнить о резервной копии и как подписать её возраст. Чистые функции без DOM (tests/backup.test.mjs).
//
// Все карточки, уровни, журнал ответов и заметки живут только на этом телефоне, поэтому копия — единственная защита от потери.
// Приложение не делает её само (серверов нет), но помнит, когда копия была сделана, и мягко напоминает.

import { cleanLog } from "./records.js";

export const NUDGE_DAYS = 14; // через сколько дней без копии напоминать
export const SNOOZE_DAYS = 3; // на сколько дней убирает напоминание «Позже»
export const WORTH = 10; // с какого числа карточек и заметок копия вообще имеет смысл
const DAY = 86400000;

const midnight = (t) => {
  const d = new Date(t);
  d.setHours(0, 0, 0, 0);
  return d.getTime();
};

/** Сколько календарных дней прошло с момента at (сегодня — 0, вчера — 1). Часы, ушедшие назад, считаются за «сегодня». */
export function ageDays(at, now = Date.now()) {
  if (!Number.isFinite(at)) return null;
  return Math.max(0, Math.round((midnight(now) - midnight(at)) / DAY));
}

const plural = (n, f) => {
  const a = n % 10;
  const b = n % 100;
  return f[b > 10 && b < 20 ? 2 : a === 1 ? 0 : a >= 2 && a <= 4 ? 1 : 2];
};

/** «сегодня», «вчера», «5 дней назад», «больше двух месяцев назад»; для копии, которой не было, — null. */
export function ageLabel(at, now = Date.now()) {
  const n = ageDays(at, now);
  if (n === null) return null;
  if (n === 0) return "сегодня";
  if (n === 1) return "вчера";
  if (n > 60) return "больше двух месяцев назад";
  return `${n} ${plural(n, ["день", "дня", "дней"])} назад`;
}

/**
 * Надо ли показать напоминание.
 *   at          — когда сделана последняя копия (null, если не было);
 *   since       — когда в приложении появились первые данные (дата самой старой карточки): отсчёт, пока копий не было;
 *   snoozeUntil — до какого момента напоминание отложено кнопкой «Позже».
 * Возвращает { show, never, days }: never — копий ещё не было; days — сколько дней прошло с копии (или с первых данных).
 */
export function nudge({ at = null, since = null, snoozeUntil = 0, cards = 0, notes = 0, now = Date.now() } = {}) {
  const never = !Number.isFinite(at);
  const from = never ? since : at;
  const days = ageDays(from, now);
  const worth = cards + notes >= WORTH;
  const show = worth && days !== null && days >= NUDGE_DAYS && !(snoozeUntil > now);
  return { show, never, days };
}

/** Момент, до которого напоминание отложено. */
export const snoozeUntil = (now = Date.now()) => now + SNOOZE_DAYS * DAY;

/** Текст напоминания по результату nudge(). */
export function nudgeText({ never, days }, cards = 0) {
  if (never) return `Копий данных ещё не было, а слов уже ${cards}. Сохраните копию: без неё данные живут только на этом телефоне.`;
  return `Копия данных не делалась ${days} ${plural(days, ["день", "дня", "дней"])}. Сохраните свежую: без неё данные живут только на этом телефоне.`;
}

/**
 * Строки журнала ответов из копии, которых на устройстве ещё нет. Одинаковыми считаются ответы на то же слово в тот же момент,
 * поэтому копию можно загружать поверх уже идущих занятий и повторно: история дополняется и не двоится.
 * Строки без слова или времени отбрасываются.
 */
export function newLogRows(local, incoming) {
  const key = (r) => `${r.id}|${r.t}`;
  const have = new Set(cleanLog(local).map(key));
  const out = [];
  for (const r of Array.isArray(incoming) ? incoming : []) {
    if (!r || typeof r !== "object" || typeof r.id !== "string" || !Number.isFinite(r.t)) continue;
    const k = key(r);
    if (have.has(k)) continue;
    have.add(k);
    out.push(r);
  }
  return out;
}

/** Имя файла копии: gloss-backup-2026-10-12.json (по местной дате). */
export function backupName(now = Date.now()) {
  const d = new Date(now);
  const p = (n) => String(n).padStart(2, "0");
  return `gloss-backup-${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}.json`;
}
