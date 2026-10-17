// data.js — резервная копия, сведения для отладки, выгрузка и загрузка данных.
import { db, isPersisted } from "../db.js";
import * as levels from "../levels.js";
import { normalizeMix } from "../modes.js";
import { isUserGroup, mergeGroups } from "../shelf.js";
import { mergeNotes } from "../notes.js";
import { errorLog, buildReport } from "../diag.js";
import { snoozeUntil, newLogRows } from "../backup.js";
import { mergeActivity } from "../activity.js";
import { mergeProgress } from "../reading.js";
import { APP_VERSION, buildLabel } from "../build.js";
import { app, emit, APP_NAME } from "./state.js";
import { applySettings } from "./settings.js";
import { persistGroups } from "./folders.js";
import { persistNotes } from "./notes.js";
import { setActivity } from "./activity.js";
import { exportReplenish, importReplenish } from "./replenish.js";

const BACKUP_TAG = "ember-chronicle-backup"; // не менять: по нему опознаются файлы копий

// ── Резервная копия ───────────────────────────────────────────────────────
const persistBackup = () => db.put("kv", { key: "backup", value: { at: app.backup.at, snoozeUntil: app.backup.snoozeUntil } });

/** Запоминает, что копия данных сохранена (вызывает экран после того, как файл ушёл). */
export async function markBackup(now = Date.now()) {
  app.backup = { at: now, snoozeUntil: 0 };
  await persistBackup();
  emit();
}

/** «Позже»: напоминание о копии возвращается через несколько дней. */
export async function snoozeBackup(now = Date.now()) {
  app.backup.snoozeUntil = snoozeUntil(now);
  await persistBackup();
  emit();
}

/** Дата самой старой карточки: с неё идёт отсчёт, пока копий не было. */
export function firstDataAt() {
  let first = null;
  for (const c of app.cards.values()) if (Number.isFinite(c.added) && (first === null || c.added < first)) first = c.added;
  return first;
}

/** Сведения для отладки одним текстом: версия, состояние данных и словаря, ошибки (js/diag.js). */
export async function diagnosticsReport() {
  let usage;
  let quota;
  try {
    ({ usage, quota } = (await navigator.storage?.estimate?.()) || {});
  } catch {
    /* браузер не сообщает */
  }
  const [log, persisted] = await Promise.all([db.count("log").catch(() => "?"), isPersisted()]);
  const standalone = matchMedia("(display-mode: standalone)").matches || navigator.standalone === true;
  return buildReport({
    name: APP_NAME,
    version: APP_VERSION,
    build: buildLabel,
    now: Date.now(),
    screen: `${innerWidth}×${innerHeight}`,
    standalone,
    userAgent: navigator.userAgent,
    storage: { usage, quota, persisted },
    counts: { cards: app.cards.size, notes: app.notes.length, books: app.books.length, log },
    dict: app.dict,
    backupAt: app.backup.at,
    offline: !!navigator.serviceWorker?.controller,
    errors: errorLog.list(),
  });
}

export async function exportData() {
  const log = await db.all("log");
  return JSON.stringify(
    {
      app: BACKUP_TAG,
      version: 4,
      exported: new Date().toISOString(),
      settings: app.settings,
      cards: [...app.cards.values()],
      notes: app.notes,
      groups: app.groups,
      known: [...app.known],
      activity: app.activity,
      freq: await exportReplenish(),
      log,
      progress: app.books.map((b) => ({ id: b.id, title: b.title, author: b.author, progress: b.progress, groups: (b.groups || []).filter(isUserGroup) })),
    },
    null,
    1,
  );
}

export async function importData(text) {
  const data = JSON.parse(text);
  if (data.app !== BACKUP_TAG || !Array.isArray(data.cards)) throw new Error("Это не резервная копия приложения.");
  const better = [];
  for (const c of data.cards) {
    if (!c.srs) {
      c.srs = levels.fromLegacy(c.fsrs);
      delete c.fsrs;
    } else c.srs = levels.migrateSrs(c.srs); // копия, снятая по прежней лестнице уровней, переводится на нынешнюю
    const mine = app.cards.get(c.id);
    if (!mine || (c.srs.reps || 0) > (mine.srs.reps || 0) || (c.srs.last || 0) > (mine.srs.last || 0)) better.push(c);
  }
  await db.putMany("cards", better); // одной записью: тысячи карточек по одной загружались бы минуту
  for (const c of better) app.cards.set(c.id, c);
  const added = better.length;
  // Свои папки: вливаем в имеющиеся (одинаковое название в одной и той же папке считается одной папкой)
  const merged = mergeGroups(app.groups, data.groups);
  if (merged.added) {
    app.groups = merged.groups;
    await persistGroups();
  }
  // Позиции и папки книг: если книги на этом устройстве ещё нет, запоминаем до её загрузки.
  const waiting = (await db.get("kv", "progress"))?.value || {};
  const waitingMeta = (await db.get("kv", "bookmeta"))?.value || {};
  for (const p of data.progress || []) {
    const groups = (Array.isArray(p.groups) ? p.groups : []).map((id) => merged.map.get(id)).filter(Boolean);
    const b = app.books.find((x) => x.id === p.id);
    if (b) {
      b.progress = mergeProgress(b.progress, p.progress);
      b.groups = [...new Set([...(b.groups || []), ...groups])];
      await db.put("books", b);
    } else {
      waiting[p.id] = p.progress;
      if (groups.length) waitingMeta[p.id] = { groups: [...new Set([...(waitingMeta[p.id]?.groups || []), ...groups])] };
    }
  }
  await db.put("kv", { key: "progress", value: waiting });
  await db.put("kv", { key: "bookmeta", value: waitingMeta });
  let notesAdded = 0;
  if (Array.isArray(data.notes) && data.notes.length) {
    const mergedNotes = mergeNotes(app.notes, data.notes);
    if (mergedNotes.changed) {
      app.notes = mergedNotes.list;
      await persistNotes();
      notesAdded = mergedNotes.changed;
    }
  }
  if (data.activity) {
    const merged = mergeActivity(app.activity, data.activity);
    if (merged.changed) await setActivity(merged.activity);
  }
  if (data.freq) await importReplenish(data.freq); // «Пополнить словарь»: где остановились, сданные тесты, свой список слов
  if (Array.isArray(data.known)) {
    const before = app.known.size;
    for (const id of data.known) if (typeof id === "string") app.known.add(id);
    if (app.known.size !== before) await db.put("kv", { key: "known", value: [...app.known] });
  }
  // Журнал ответов: дописываем то, чего на устройстве нет (серия дней и точность считаются по нему), а не только в пустой журнал
  let logAdded = 0;
  if (Array.isArray(data.log) && data.log.length) {
    const rows = newLogRows(await db.all("log"), data.log);
    if (rows.length) await db.addMany("log", rows);
    logAdded = rows.length;
  }
  if (data.settings) {
    Object.assign(app.settings, data.settings);
    app.settings.mixModes = normalizeMix(app.settings.mixModes);
    applySettings();
    await db.put("kv", { key: "settings", value: app.settings });
  }
  emit();
  return { cards: added, notes: notesAdded, log: logAdded };
}
