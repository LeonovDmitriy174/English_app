// store.js — состояние приложения: словарь, карточки, книги, настройки. Всё хранится на устройстве.
import { db, requestPersistence } from "./db.js";
import { Glossary, lemmaCandidates } from "./lex.js";
import { readEpub, EPUB_PARSER } from "./epub.js";
import { openZip } from "./zip.js";
import { analyzeBook, dictSignature } from "./analysis.js";
import * as levels from "./levels.js";
import { newNote, noteAt, mergeNotes } from "./notes.js";

export const APP_NAME = "Ember Chronicle";
const BACKUP_TAG = "ember-chronicle-backup"; // не менять: по нему опознаются файлы копий

export const app = {
  glossary: new Glossary([]),
  cards: new Map(),
  books: [],
  settings: { theme: "auto", fontSize: 19, hilite: true, speakOnTap: false, newPerDay: 20 },
  daily: { day: "", newDone: 0 },
  analysis: null, // { id, pct } пока идёт разбор книги
  notes: [], // заметки и закладки к книгам (js/notes.js)
  jump: null, // { id } заметка, к которой читалка должна перейти при открытии
};

const listeners = new Set();
export const subscribe = (fn) => (listeners.add(fn), () => listeners.delete(fn));
const emit = () => listeners.forEach((fn) => fn());

const today = () => new Date().toLocaleDateString("sv"); // YYYY-MM-DD по местному времени

// ── Подписи ───────────────────────────────────────────────────────────────
const POS = { n: "noun", v: "verb", adj: "adjective", adv: "adverb", prep: "preposition", pv: "phrasal verb", id: "idiom" };
export const kindOf = (t) => ({ w: "Слова", pv: "Фразовые глаголы", id: "Идиомы" })[t];
export const kindClass = (t) => `k-${t}`;
export function posLabel(item) {
  if (item.t === "pv") return "phrasal verb";
  if (item.t === "id") return "idiom";
  return POS[item.pos] || item.pos || "";
}

// ── Запуск ────────────────────────────────────────────────────────────────
export async function init() {
  try {
    const res = await fetch("data/dict.json");
    app.glossary = new Glossary(await res.json());
  } catch {
    app.glossary = new Glossary([]);
  }
  const [cards, books, kvSettings, kvDaily, kvNotes] = await Promise.all([db.all("cards"), db.all("books"), db.get("kv", "settings"), db.get("kv", "daily"), db.get("kv", "notes")]);
  app.notes = Array.isArray(kvNotes?.value) ? kvNotes.value : [];
  for (const c of cards) {
    if (!c.srs) {
      // карточка из версий 1–2 (алгоритм FSRS): переводим в уровни
      c.srs = levels.fromLegacy(c.fsrs);
      delete c.fsrs;
      await db.put("cards", c);
    }
    if (!c.ru && !c.rm && !c.custom) {
      // слово добавлено, когда перевода ещё не было: берём то, что появилось в словаре с тех пор
      const e = app.glossary.byId.get(c.id);
      if (e && (e.ru || e.rm)) {
        c.ru = e.ru || "";
        c.rm = e.ru ? "" : e.rm || "";
        await db.put("cards", c);
      }
    }
    app.cards.set(c.id, c);
  }
  app.books = books.sort((a, b) => (b.opened || b.added) - (a.opened || a.added));
  Object.assign(app.settings, kvSettings?.value || {});
  if (kvDaily?.value?.day === today()) app.daily = kvDaily.value;
  else app.daily = { day: today(), newDone: 0 };
  applySettings();
}

export function applySettings() {
  const root = document.documentElement;
  if (app.settings.theme === "auto") delete root.dataset.theme;
  else root.dataset.theme = app.settings.theme;
  root.style.setProperty("--read-size", `${app.settings.fontSize}px`);
}

export async function setSetting(key, value) {
  app.settings[key] = value;
  applySettings();
  await db.put("kv", { key: "settings", value: app.settings });
  emit();
}

// ── Словарь пользователя ──────────────────────────────────────────────────
export function resolveWord(raw) {
  const fromGlossary = app.glossary.lookupWord(raw);
  if (fromGlossary) return fromGlossary;
  for (const c of lemmaCandidates(raw)) {
    const card = app.cards.get(`w:${c}`);
    if (card) return card;
  }
  return null;
}

export const cardFor = (entry) => (entry ? app.cards.get(entry.id) : undefined);

export async function saveCard(entry, ctx) {
  let c = app.cards.get(entry.id);
  if (!c) {
    c = {
      id: entry.id,
      w: entry.w,
      t: entry.t,
      pos: entry.pos || "",
      ru: entry.ru || "",
      rm: entry.ru ? "" : entry.rm || "",
      en: entry.en || "",
      ex: entry.ex || "",
      custom: !!entry.custom,
      ctx: [],
      srs: levels.newSrs(),
      added: Date.now(),
    };
  }
  if (ctx && !c.ctx.some((x) => x.s === ctx.s)) {
    c.ctx.push(ctx);
    if (c.ctx.length > 5) c.ctx.splice(1, 1); // первый контекст сохраняем всегда
  }
  app.cards.set(c.id, c);
  await db.put("cards", c);
  emit();
  return c;
}

export async function updateCard(id, patch) {
  const c = app.cards.get(id);
  if (!c) return;
  Object.assign(c, patch);
  await db.put("cards", c);
  emit();
}

export async function removeCard(id) {
  app.cards.delete(id);
  await db.del("cards", id);
  emit();
}

// ── Повторение ────────────────────────────────────────────────────────────
export function queue(scope = "all", now = Date.now()) {
  const inScope = (c) => scope === "all" || c.t === scope;
  const all = [...app.cards.values()].filter(inScope);
  const due = all.filter((c) => !levels.isNew(c.srs) && c.srs.due <= now).sort((a, b) => a.srs.due - b.srs.due);
  const left = Math.max(0, app.settings.newPerDay - (app.daily.day === today() ? app.daily.newDone : 0));
  const fresh = all.filter((c) => levels.isNew(c.srs)).sort((a, b) => a.added - b.added).slice(0, left);
  return { due, fresh, list: [...due, ...fresh] };
}

/**
 * Записать ответ на карточку. result: 'ok' | 'near' | 'no', written: режим с письмом.
 * Возвращает { card, before, after }: уровень до и после ответа (для индикатора).
 */
export async function answerCard(id, result, { written = false, now = Date.now() } = {}) {
  const c = app.cards.get(id);
  const before = c.srs.lv;
  c.srs = levels.answer(c.srs, result, { written, now });
  await db.put("cards", c);
  await db.add("log", { id, t: now, result, written, lv: c.srs.lv });
  if (before === 0) {
    if (app.daily.day !== today()) app.daily = { day: today(), newDone: 0 };
    app.daily.newDone += 1;
    await db.put("kv", { key: "daily", value: app.daily });
  }
  emit();
  return { card: c, before, after: c.srs.lv };
}

// ── Книги ─────────────────────────────────────────────────────────────────
export async function addBook(file) {
  const buf = await file.arrayBuffer();
  const { meta, chapters, cover } = await readEpub(buf);
  const existing = app.books.find((b) => b.id === meta.id);
  if (existing) return { book: existing, duplicate: true };
  if (chapters.reduce((sum, c) => sum + c.chars, 0) < 200) throw new Error("В этой книге не нашлось текста: возможно, её страницы это картинки.");
  const waiting = (await db.get("kv", "progress"))?.value || {};
  const book = {
    id: meta.id,
    title: meta.title,
    author: meta.author,
    chapters: chapters.map(({ href, title, chars }) => ({ href, title, chars })),
    cover,
    progress: waiting[meta.id] || { ch: 0, p: 0 },
    added: Date.now(),
    parser: EPUB_PARSER,
  };
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

export async function saveProgress(id, ch, p) {
  const b = app.books.find((x) => x.id === id);
  if (!b) return;
  b.progress = { ch, p };
  b.opened = Date.now();
  await db.put("books", b);
}

export async function removeBook(id) {
  app.books = app.books.filter((b) => b.id !== id);
  zips.delete(id);
  await db.del("books", id);
  await db.del("files", id);
  emit();
}

// ── Заметки к книгам ──────────────────────────────────────────────────────
const persistNotes = () => db.put("kv", { key: "notes", value: app.notes });

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
  analyzing = true;
  try {
    const sig = dictSignature(app.glossary);
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

// ── Резервная копия ───────────────────────────────────────────────────────
export async function exportData() {
  const log = await db.all("log");
  return JSON.stringify(
    {
      app: BACKUP_TAG,
      version: 3,
      exported: new Date().toISOString(),
      settings: app.settings,
      cards: [...app.cards.values()],
      notes: app.notes,
      log,
      progress: app.books.map((b) => ({ id: b.id, title: b.title, author: b.author, progress: b.progress })),
    },
    null,
    1,
  );
}

export async function importData(text) {
  const data = JSON.parse(text);
  if (data.app !== BACKUP_TAG || !Array.isArray(data.cards)) throw new Error("Это не резервная копия приложения.");
  let added = 0;
  for (const c of data.cards) {
    if (!c.srs) {
      c.srs = levels.fromLegacy(c.fsrs);
      delete c.fsrs;
    }
    const mine = app.cards.get(c.id);
    const better = !mine || (c.srs.reps || 0) > (mine.srs.reps || 0) || (c.srs.last || 0) > (mine.srs.last || 0);
    if (better) {
      app.cards.set(c.id, c);
      await db.put("cards", c);
      added += 1;
    }
  }
  // Позиции в книгах: если книги на этом устройстве ещё нет, запоминаем до её загрузки.
  const waiting = (await db.get("kv", "progress"))?.value || {};
  for (const p of data.progress || []) {
    const b = app.books.find((x) => x.id === p.id);
    if (b) {
      b.progress = p.progress;
      await db.put("books", b);
    } else waiting[p.id] = p.progress;
  }
  await db.put("kv", { key: "progress", value: waiting });
  let notesAdded = 0;
  if (Array.isArray(data.notes) && data.notes.length) {
    const merged = mergeNotes(app.notes, data.notes);
    if (merged.changed) {
      app.notes = merged.list;
      await persistNotes();
      notesAdded = merged.changed;
    }
  }
  if (Array.isArray(data.log) && !(await db.all("log")).length) for (const row of data.log) await db.add("log", row);
  if (data.settings) {
    Object.assign(app.settings, data.settings);
    applySettings();
    await db.put("kv", { key: "settings", value: app.settings });
  }
  emit();
  return { cards: added, notes: notesAdded };
}
