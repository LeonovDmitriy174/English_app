// store.js — точка входа для экранов: запуск приложения и всё, что они берут из хранилища.
// Устройство хранилища (js/store/): state — общее состояние, lexicon — словарь, settings, cards — слова и очередь повторения,
// contexts — предложения из книг для заданий, books — книги и разбор, folders и catalog — папки и встроенные книги,
// notes — заметки, data — копии данных и сведения для отладки.
import { db } from "./db.js";
import * as levels from "./levels.js";
import { normalizeMix } from "./modes.js";
import { isUserGroup, cleanName, sanitizeCatalog } from "./shelf.js";
import { app, today } from "./store/state.js";
import { onDictionaryRetried } from "./store/lexicon.js";
import { applySettings } from "./store/settings.js";
import { ensureAnalysis } from "./store/books.js";
import { ensureContexts } from "./store/contexts.js";

export * from "./store/state.js";
export * from "./store/lexicon.js";
export * from "./store/settings.js";
export * from "./store/cards.js";
export * from "./store/contexts.js";
export * from "./store/books.js";
export * from "./store/folders.js";
export * from "./store/catalog.js";
export * from "./store/notes.js";
export * from "./store/data.js";

// после повторной загрузки словаря нужно разобрать книги и найти предложения для слов
onDictionaryRetried(() => ensureAnalysis().then(() => ensureContexts()));

// ── Запуск ────────────────────────────────────────────────────────────────
// Приложение открывается, не дожидаясь общего словаря: он большой (до десятков мегабайт), и его разбор занимает от долей секунды
// до пары секунд. Экран с книгами и повторением в словаре не нуждается, а читалка, анализ и задания ждут его (dictionaryReady).
export async function init() {
  const [cards, books, kvSettings, kvDaily, kvNotes, kvGroups, kvCatalog, kvBackup, kvKnown] = await Promise.all([db.all("cards"), db.all("books"), db.get("kv", "settings"), db.get("kv", "daily"), db.get("kv", "notes"), db.get("kv", "groups"), db.get("kv", "catalog"), db.get("kv", "backup"), db.get("kv", "known")]);
  app.notes = Array.isArray(kvNotes?.value) ? kvNotes.value : [];
  app.known = new Set(Array.isArray(kvKnown?.value) ? kvKnown.value.filter((id) => typeof id === "string") : []);
  app.groups = (Array.isArray(kvGroups?.value) ? kvGroups.value : []).filter((g) => isUserGroup(g?.id) && cleanName(g.name));
  if (kvCatalog?.value) {
    app.catalog = sanitizeCatalog(kvCatalog.value);
    app.catalogLoaded = true;
  }
  if (Number.isFinite(kvBackup?.value?.at)) app.backup.at = kvBackup.value.at;
  if (Number.isFinite(kvBackup?.value?.snoozeUntil)) app.backup.snoozeUntil = kvBackup.value.snoozeUntil;
  for (const c of cards) {
    if (!c.srs) {
      // карточка из версий 1–2 (алгоритм FSRS): переводим в уровни
      c.srs = levels.fromLegacy(c.fsrs);
      delete c.fsrs;
      await db.put("cards", c);
    }
    app.cards.set(c.id, c);
  }
  app.books = books.sort((a, b) => (b.opened || b.added) - (a.opened || a.added));
  Object.assign(app.settings, kvSettings?.value || {});
  app.settings.mixModes = normalizeMix(app.settings.mixModes);
  if (kvDaily?.value?.day === today()) app.daily = kvDaily.value;
  else app.daily = { day: today(), newDone: 0 };
  applySettings();
}
