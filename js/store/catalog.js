// catalog.js — встроенные книги (папка books/ рядом с приложением): список и скачивание.
import { db } from "../db.js";
import { sanitizeCatalog, reconcileGroups } from "../shelf.js";
import { app, emit } from "./state.js";
import { persistBook, addBookBuffer } from "./books.js";

// ── Каталог встроенных книг ───────────────────────────────────────────────
// Книги лежат рядом с приложением (папка books/ в репозитории), а books/catalog.json собирает tools/build_catalog.py.
// Список запоминается на устройстве, поэтому папки видны и без интернета; сам файл книги скачивается по нажатию.
const siteUrl = (rel) => new URL(rel.split("/").map(encodeURIComponent).join("/"), document.baseURI).href;
/** Адрес файла из каталога (путь в каталоге считается от папки books/). */
export const catalogAsset = (rel) => (rel ? siteUrl(`books/${rel}`) : "");

let catalogFetchedAt = 0;
export async function refreshCatalog({ force = false } = {}) {
  if (!force && Date.now() - catalogFetchedAt < 60_000) return;
  catalogFetchedAt = Date.now();
  let raw;
  try {
    const res = await fetch(siteUrl("books/catalog.json"), { cache: "no-cache" });
    if (res.status === 404) raw = { groups: [], books: [] }; // каталога нет вообще: встроенных книг нет
    else if (res.ok) raw = await res.json();
    else return;
  } catch {
    return; // нет сети или файл не разобрался: остаётся то, что запомнено
  }
  const next = sanitizeCatalog(raw);
  const changed = JSON.stringify(next) !== JSON.stringify(app.catalog) || !app.catalogLoaded;
  app.catalog = next;
  app.catalogLoaded = true;
  if (!changed) return;
  await db.put("kv", { key: "catalog", value: next });
  for (const b of app.books) {
    const groups = reconcileGroups(b, next);
    if (groups.join() !== (b.groups || []).join()) {
      b.groups = groups;
      await persistBook(b);
    }
  }
  emit();
}

/** Скачивает книгу из каталога на устройство. Дальше она работает без интернета. */
export async function addFromCatalog(entry) {
  if (app.downloading.has(entry.id)) return null;
  app.downloading.add(entry.id);
  emit();
  try {
    let buf;
    try {
      const res = await fetch(siteUrl(`books/${entry.file}`));
      if (!res.ok) throw new Error(String(res.status));
      buf = await res.arrayBuffer();
    } catch {
      throw new Error("Не удалось скачать книгу. Проверьте интернет и попробуйте ещё раз.");
    }
    return await addBookBuffer(buf, { groups: [...entry.groups], catalogId: entry.id });
  } finally {
    app.downloading.delete(entry.id);
    emit();
  }
}
