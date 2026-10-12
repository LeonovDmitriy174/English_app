// notes.js — заметки и закладки к книгам. Чистые функции без DOM, проверяются в Node (tests/notes.test.mjs).
//
// Заметка привязана к абзацу: книга, глава и номер абзаца (тот же номер, что хранится в прогрессе чтения).
// Пустой комментарий — это просто закладка. На абзац приходится одна заметка.
// Вместе с заметкой хранится цитата из абзаца: по ней заметку видно в списке даже без книги, а если
// разбор главы когда-нибудь изменится и номера абзацев сдвинутся, заметка находит своё место по цитате.

import { subtreeSet } from "./shelf.js";

const squash = (s) => String(s || "").replace(/\s+/g, " ").trim();

/** Короткая выдержка из текста: не длиннее n знаков, обрезка по границе слова. */
export function excerpt(text, n = 220) {
  const s = squash(text);
  if (s.length <= n) return s;
  return s.slice(0, n).replace(/[\s,;:.-]+\S*$/, "") + "…";
}

/** Новая заметка. rnd нужен только тестам. */
export function newNote({ book, bookTitle = "", ch, chTitle = "", p, quote = "", text = "" }, now = Date.now(), rnd = Math.random) {
  return {
    id: `n${now.toString(36)}${Math.floor(rnd() * 36 ** 4).toString(36).padStart(4, "0")}`,
    book,
    bookTitle,
    ch,
    chTitle,
    p,
    quote: excerpt(quote),
    text: String(text || "").trim(),
    created: now,
    updated: now,
  };
}

export const sameSpot = (a, b) => a.book === b.book && a.ch === b.ch && a.p === b.p;

/** Заметка на этом месте книги или undefined. */
export const noteAt = (list, book, ch, p) => list.find((n) => n.book === book && n.ch === ch && n.p === p);

/** Заметки одной главы. */
export const notesIn = (list, book, ch) => list.filter((n) => n.book === book && n.ch === ch);

/**
 * Объединяет заметки из резервной копии с заметками на устройстве.
 * Одинаковые заметки (по id) — остаётся более свежая; два разных id на одном месте — тоже остаётся более свежая.
 * Возвращает { list, changed }: новый список и сколько заметок добавлено или обновлено.
 */
export function mergeNotes(mine, theirs) {
  const out = new Map(mine.map((n) => [n.id, n]));
  let changed = 0;
  for (const raw of theirs || []) {
    if (!raw || typeof raw.id !== "string" || typeof raw.book !== "string" || !Number.isInteger(raw.ch) || !Number.isInteger(raw.p)) continue;
    const n = { text: "", quote: "", bookTitle: "", chTitle: "", created: 0, updated: 0, ...raw };
    const same = out.get(n.id);
    if (same) {
      if ((n.updated || 0) > (same.updated || 0)) {
        out.set(n.id, n);
        changed += 1;
      }
      continue;
    }
    const spot = [...out.values()].find((m) => sameSpot(m, n));
    if (spot) {
      if ((n.updated || 0) > (spot.updated || 0)) {
        out.delete(spot.id);
        out.set(n.id, n);
        changed += 1;
      }
      continue;
    }
    out.set(n.id, n);
    changed += 1;
  }
  return { list: [...out.values()], changed };
}

/**
 * В каком абзаце главы на самом деле лежит заметка.
 * texts — тексты абзацев главы по порядку. Если на сохранённом месте всё сходится, остаётся оно;
 * если нет, ищем абзац с началом цитаты; не нашли — остаёмся на сохранённом номере (но не за концом главы).
 */
export function findAnchor(texts, note) {
  const probe = squash(note.quote).replace(/…$/, "").slice(0, 40).toLowerCase();
  const has = (i) => i >= 0 && i < texts.length && squash(texts[i]).toLowerCase().includes(probe);
  if (!probe || has(note.p)) return Math.min(Math.max(note.p, 0), Math.max(texts.length - 1, 0));
  const i = texts.findIndex((_, k) => has(k));
  if (i >= 0) return i;
  return Math.min(Math.max(note.p, 0), Math.max(texts.length - 1, 0));
}

/**
 * Список для вкладки «Заметки»: группы по книгам, внутри — по порядку в книге.
 * books — книги на устройстве (в нужном порядке). Заметки удалённых книг идут в конце, без возможности открыть книгу.
 */
export function groupByBook(notes, books) {
  const order = new Map(books.map((b, i) => [b.id, i]));
  const groups = new Map();
  for (const n of notes) {
    if (!groups.has(n.book)) groups.set(n.book, { book: n.book, title: books.find((b) => b.id === n.book)?.title || n.bookTitle || "Книга", present: order.has(n.book), notes: [] });
    groups.get(n.book).notes.push(n);
  }
  for (const g of groups.values()) g.notes.sort((a, b) => a.ch - b.ch || a.p - b.p);
  return [...groups.values()].sort((a, b) => (a.present === b.present ? (order.get(a.book) ?? 0) - (order.get(b.book) ?? 0) : a.present ? -1 : 1));
}

/**
 * Заметки папки (и её вложенных папок). Заметка лежит в тех же папках, что и её книга, отдельно её не раскладывают.
 * ids — множество id папок (shelf.subtreeSet). Заметки книг, которых нет на устройстве, ни в какой папке не лежат.
 */
export function notesInFolder(notes, books, ids) {
  const groupsOf = new Map(books.map((b) => [b.id, b.groups || []]));
  return notes.filter((n) => groupsOf.get(n.book)?.some((g) => ids.has(g)));
}

/** Сколько заметок в каждой папке дерева (с вложенными): Map id → число. */
export function noteCounts(notes, books, tree) {
  const counts = new Map();
  for (const n of tree.all) counts.set(n.id, notesInFolder(notes, books, subtreeSet(tree, n.id)).length);
  return counts;
}
