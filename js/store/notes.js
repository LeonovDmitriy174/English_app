// notes.js — заметки и закладки к книгам (правила заметок: js/notes.js).
import { db } from "../db.js";
import { newNote, noteAt } from "../notes.js";
import { app, emit } from "./state.js";

// ── Заметки к книгам ──────────────────────────────────────────────────────
export const persistNotes = () => db.put("kv", { key: "notes", value: app.notes });

/**
 * Заметка на этом месте книги: уже существующая или новая (пустая — это закладка).
 * place: { book, ch, p, quote, chTitle } — название книги берётся из библиотеки, чтобы оно сохранилось вместе с заметкой.
 */
export async function ensureNote({ book: bookId, ch, p, quote, chTitle }) {
  const found = noteAt(app.notes, bookId, ch, p);
  if (found) return found;
  const b = app.books.find((x) => x.id === bookId);
  const n = newNote({ book: bookId, bookTitle: b?.title || "", ch, chTitle: chTitle || b?.chapters[ch]?.title || "", p, quote });
  app.notes.push(n);
  await persistNotes();
  emit();
  return n;
}

/** Меняет текст комментария. Пустой текст оставляет закладку. */
export async function setNoteText(id, text) {
  const n = app.notes.find((x) => x.id === id);
  if (!n) return null;
  const next = String(text || "").trim();
  if (n.text === next) return n;
  n.text = next;
  n.updated = Date.now();
  await persistNotes();
  emit();
  return n;
}

export async function removeNote(id) {
  app.notes = app.notes.filter((n) => n.id !== id);
  await persistNotes();
  emit();
}

/** Читалка нашла заметку в другом абзаце (разбор главы изменился): запоминаем новое место без лишних перерисовок. */
export async function moveNote(id, p) {
  const n = app.notes.find((x) => x.id === id);
  if (!n || n.p === p) return;
  if (noteAt(app.notes, n.book, n.ch, p)) return; // там уже есть другая заметка
  n.p = p;
  await persistNotes();
}
