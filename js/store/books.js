// books.js — книги на устройстве: добавление, место чтения, удаление, перечитывание файла и автоматический разбор.
import { db, requestPersistence } from "../db.js";
import { readEpub, EPUB_PARSER } from "../epub.js";
import { openZip } from "../zip.js";
import { analyzeBook, statsSignature } from "../analysis.js";
import { app, emit } from "./state.js";
import { dictionaryReady } from "./lexicon.js";
import { persistNotes } from "./notes.js";

// ── Книги ─────────────────────────────────────────────────────────────────
/**
 * Добавляет книгу из файла. opts.groups — папки, в которые книга попадёт сразу; opts.catalogId — если книга пришла из каталога.
 * Если такая книга уже есть, она остаётся одна: ей добавляются папки и связь с каталогом.
 */
export async function addBook(file, opts = {}) {
  return addBookBuffer(await file.arrayBuffer(), opts);
}

export async function addBookBuffer(buf, { groups = [], catalogId = "" } = {}) {
  const { meta, chapters, cover } = await readEpub(buf);
  const existing = app.books.find((b) => b.id === meta.id);
  if (existing) {
    const next = [...new Set([...(existing.groups || []), ...groups])];
    const linked = catalogId && !existing.catalogId;
    if (next.length !== (existing.groups || []).length || linked) {
      existing.groups = next;
      if (linked) existing.catalogId = catalogId;
      await db.put("books", existing);
      emit();
    }
    return { book: existing, duplicate: true };
  }
  if (chapters.reduce((sum, c) => sum + c.chars, 0) < 200) throw new Error("В этой книге не нашлось текста: возможно, её страницы это картинки.");
  const waiting = (await db.get("kv", "progress"))?.value || {};
  const waitingMeta = (await db.get("kv", "bookmeta"))?.value || {};
  const own = (waitingMeta[meta.id]?.groups || []).filter((id) => app.groups.some((g) => g.id === id));
  const book = {
    id: meta.id,
    title: meta.title,
    author: meta.author,
    chapters: chapters.map(({ href, title, chars }) => ({ href, title, chars })),
    cover,
    progress: waiting[meta.id] || { ch: 0, p: 0 },
    groups: [...new Set([...groups, ...own])],
    added: Date.now(),
    parser: EPUB_PARSER,
  };
  if (catalogId) book.catalogId = catalogId;
  await db.put("files", { id: book.id, buf });
  await db.put("books", book);
  app.books.unshift(book);
  requestPersistence();
  emit();
  return { book, duplicate: false };
}

const zips = new Map();
export async function bookZip(id) {
  if (!zips.has(id)) {
    const rec = await db.get("files", id);
    if (!rec) throw new Error("Файл книги не найден на устройстве.");
    zips.set(id, await openZip(rec.buf));
  }
  return zips.get(id);
}

/** Книга, на которой вы остановились: последняя из открывавшихся. */
export const resumeBook = () => app.books.reduce((best, b) => (b.opened && (!best || b.opened > best.opened) ? b : best), null);

/**
 * Запоминает место в книге. Если место то же, а эта книга и так последняя из открытых, запись не повторяется:
 * она переписывает всю запись книги вместе с обложкой и оглавлением.
 */
export async function saveProgress(id, ch, p) {
  const b = app.books.find((x) => x.id === id);
  if (!b) return;
  const now = Date.now();
  if (b.progress?.ch === ch && b.progress?.p === p && resumeBook() === b && now - b.opened < 10 * 60000) return;
  b.progress = { ch, p };
  b.opened = now;
  await db.put("books", b);
}

export const persistBook = (b) => db.put("books", b);

export async function removeBook(id) {
  app.books = app.books.filter((b) => b.id !== id);
  zips.delete(id);
  await db.del("books", id);
  await db.del("files", id);
  emit();
}

/** Открывает книгу на месте заметки. */
export function jumpToNote(n) {
  if (!app.books.some((b) => b.id === n.book)) return false;
  app.jump = { id: n.id };
  saveProgress(n.book, n.ch, n.p);
  location.hash = `#/read/${n.book}`;
  return true;
}

/**
 * Книги, добавленные более ранней версией разбора EPUB, читаем заново из сохранённого файла: так
 * исправления разбора (например, пустые главы из-за <title/> в XHTML) достаются и уже загруженным книгам.
 * Место в книге и заметки переезжают вместе с главами по адресу главы.
 */
export async function reparseBooks() {
  let changed = false;
  for (const b of [...app.books]) {
    if ((b.parser || 1) >= EPUB_PARSER) continue;
    try {
      const rec = await db.get("files", b.id);
      if (rec) {
        const { chapters } = await readEpub(rec.buf);
        const next = chapters.map(({ href, title, chars }) => ({ href, title, chars }));
        const old = b.chapters;
        const sameShape = next.length === old.length && next.every((c, i) => c.href === old[i].href);
        const sameText = sameShape && next.every((c, i) => c.chars === old[i].chars);
        if (!sameShape) {
          const move = (i) => next.findIndex((c) => c.href === old[i]?.href);
          const k = move(b.progress?.ch ?? 0);
          b.progress = k >= 0 ? { ch: k, p: b.progress?.p || 0 } : { ch: 0, p: 0 };
          let moved = false;
          for (const n of app.notes) {
            if (n.book !== b.id) continue;
            const nk = move(n.ch);
            if (nk >= 0 && nk !== n.ch) {
              n.ch = nk;
              moved = true;
            }
          }
          if (moved) await persistNotes();
        }
        b.chapters = next;
        if (!sameText) {
          b.stats = undefined; // разбор по прежнему тексту устарел
          namesCache.delete(b.id);
        }
      }
      b.parser = EPUB_PARSER;
      await db.put("books", b);
      changed = true;
    } catch {
      /* не открылась: попробуем при следующем запуске */
    }
  }
  if (changed) emit();
}

// ── Автоматический разбор книг ────────────────────────────────────────────
let analyzing = false;

/** Разбирает книги, у которых нет свежего разбора (новая книга или другой словарь). Идёт в фоне. */
export async function ensureAnalysis() {
  if (analyzing) return;
  await dictionaryReady();
  // без словаря разбирать нечего: с пустым словарём в каждую книгу записалось бы «словарь знает 0%»
  if (app.dict.state !== "ready" || analyzing) return;
  analyzing = true;
  try {
    const sig = statsSignature(app.glossary);
    for (const b of [...app.books]) {
      if (b.stats?.sig === sig) continue;
      app.analysis = { id: b.id, pct: 0 };
      emit();
      try {
        const zip = await bookZip(b.id);
        b.stats = await analyzeBook(b, zip, app.glossary, (pct) => {
          app.analysis = { id: b.id, pct };
          emit();
        });
        namesCache.delete(b.id);
        await db.put("books", b);
      } catch {
        /* книга не открылась: разбор можно повторить позже */
      }
    }
  } finally {
    app.analysis = null;
    analyzing = false;
    emit();
  }
}

const namesCache = new Map();
/** Слова книги, похожие на имена собственные (по разбору). */
export function namesOf(book) {
  if (!namesCache.has(book.id)) namesCache.set(book.id, new Set(book.stats?.names || []));
  return namesCache.get(book.id);
}
