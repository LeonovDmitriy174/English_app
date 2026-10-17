// pacing.js — сколько карточек повторять за день и как раскладывать сроки, чтобы не выходило завала.
//
// Зачем. «Пополнить словарь» за один заход может добавить сотни слов, и первое повторение у них наступает почти одновременно.
// Без ограничения в один из дней на вкладке «Повторение» оказалось бы несколько сотен карточек. Поэтому:
//  - за учебный день предлагается не больше reviewsPerDay (по умолчанию 100) разных карточек; остальные просто остаются
//    просроченными и ждут следующего дня: самые давние первыми, уровни и сроки не трогаются. «Ещё 50» берёт больше,
//    когда есть время (по выходным). Новые слова ограничены своей настройкой (newPerDay) и под этот лимит не подпадают;
//  - когда проверка добавляет слова с готовым уровнем, их первые повторения раскладываются по дням так, чтобы в каждый день
//    приходилось не больше половины лимита (spreadBudget): в уже занятые дни слова не складываются.
// Чистые функции без доступа к хранилищу; применяет их js/store/cards.js и js/store/replenish.js.
import { studyDay, dueInDays } from "./levels.js";

export const DEFAULT_CAP = 100;
export const CAP_MIN = 30;
export const CAP_MAX = 300;
export const CAP_STEP = 10;
/** На сколько карточек кнопка «Ещё» увеличивает сегодняшний лимит. */
export const EXTRA_STEP = 50;
const MAX_IDS = 3000;

/** Лимит повторений в день из настроек: целое число в допустимых границах, а при мусоре значение по умолчанию. */
export function reviewCap(settings) {
  const v = Number(settings?.reviewsPerDay);
  return Number.isFinite(v) ? Math.min(CAP_MAX, Math.max(CAP_MIN, Math.round(v))) : DEFAULT_CAP;
}

/**
 * Что сегодня уже сделано. rev: id карточек, которые повторяли сегодня (не новые, срок которых уже пришёл);
 * nw: id слов, с которых сегодня началось изучение (они в лимит не считаются, но остаются в очереди, пока не пройдут свои короткие шаги);
 * extra: сколько карточек добавлено к лимиту кнопкой «Ещё».
 */
export const emptyDaily = (day = "") => ({ day, newDone: 0, rev: [], nw: [], extra: 0 });

/** Приводит запись из хранилища к виду emptyDaily. Запись за другой день (или мусор) превращается в пустую на день day. */
export function normalizeDaily(raw, day) {
  if (!raw || typeof raw !== "object" || raw.day !== day) return emptyDaily(day);
  const ids = (a) => (Array.isArray(a) ? [...new Set(a.filter((x) => typeof x === "string"))].slice(0, MAX_IDS) : []);
  const n = (x) => (Number.isFinite(x) && x > 0 ? Math.floor(x) : 0);
  return { day, newDone: n(raw.newDone), rev: ids(raw.rev), nw: ids(raw.nw), extra: n(raw.extra) };
}

/**
 * Какие из просроченных карточек предложить сегодня. due: просроченные карточки, самые давние первыми; daily: что уже сделано;
 * cap: лимит. Карточка, с которой сегодня уже начали (ответили), остаётся в очереди без лимита: её короткие шаги закончатся
 * в этот же день. Возвращает { list, held, room }: что предложить, сколько отложено на завтра, сколько ещё поместилось бы.
 */
export function takeToday(due, daily, cap) {
  const started = new Set([...(daily?.rev || []), ...(daily?.nw || [])]);
  let room = Math.max(0, cap + (daily?.extra || 0) - (daily?.rev?.length || 0));
  const list = [];
  for (const c of due) {
    if (started.has(c.id)) list.push(c);
    else if (room > 0) {
      list.push(c);
      room -= 1;
    }
  }
  return { list, held: due.length - list.length, room };
}

// ── Разброс сроков ──────────────────────────────────────────────────────────
/** Сколько карточек приходится на каждый учебный день: Map «ГГГГ-ММ-ДД» → число. Просроченные считаются за сегодня; новые и скрытые не считаются. */
export function dueLoad(cards, now = Date.now()) {
  const load = new Map();
  const first = studyDay(now);
  for (const c of cards) {
    if (!c?.srs || c.skip || !c.srs.lv) continue;
    let key = studyDay(c.srs.due);
    if (key < first) key = first; // «ГГГГ-ММ-ДД» сравнивается как строка
    load.set(key, (load.get(key) || 0) + 1);
  }
  return load;
}

/** Сколько карточек, добавляемых проверкой, можно назначить на один день: половина лимита, но не меньше десяти. */
export const spreadBudget = (cap) => Math.max(10, Math.round(cap / 2));

/**
 * Срок через days суток или позже: первый из следующих maxSpread дней, где ещё не занят бюджет; если все заняты,
 * самый свободный (при равенстве ранний). Выбранный день записывается в load. Без load это просто dueInDays.
 */
export function spreadDue(now, days, { load, budget = 50, maxSpread = 14 } = {}) {
  if (!load) return dueInDays(now, days);
  let pick = null;
  let fallback = null;
  for (let k = 0; k <= maxSpread; k++) {
    const due = dueInDays(now, days + k);
    const key = studyDay(due);
    const n = load.get(key) || 0;
    if (n < budget) {
      pick = { due, key };
      break;
    }
    if (!fallback || n < fallback.n) fallback = { due, key, n };
  }
  const at = pick || fallback;
  load.set(at.key, (load.get(at.key) || 0) + 1);
  return at.due;
}
