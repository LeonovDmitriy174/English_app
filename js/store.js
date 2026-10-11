// store.js — состояние приложения: словарь, карточки, книги, настройки. Всё хранится на устройстве.
import { db, requestPersistence } from "./db.js";
import { Glossary, lemmaCandidates } from "./lex.js";
import { readEpub } from "./epub.js";
import { openZip } from "./zip.js";
import * as fsrs from "./fsrs.js";

export const APP_NAME = "Ember Chronicle";
const BACKUP_TAG = "ember-chronicle-backup"; // не менять: по нему опознаются файлы копий

export const app = {
  glossary: new Glossary([]),
  cards: new Map(),
  books: [],
  settings: { theme: "auto", fontSize: 19, hilite: true, speakOnTap: false, newPerDay: 20 },
  daily: { day: "", newDone: 0 },
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
  const [cards, books, kvSettings, kvDaily] = await Promise.all([db.all("cards"), db.all("books"), db.get("kv", "settings"), db.get("kv", "daily")]);
  cards.forEach((c) => app.cards.set(c.id, c));
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
      ru: entry.ru,
      en: entry.en || "",
      ex: entry.ex || "",
      custom: !!entry.custom,
      ctx: [],
      fsrs: fsrs.newState(),
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
  const due = all.filter((c) => c.fsrs.state !== fsrs.State.New && c.fsrs.due <= now).sort((a, b) => a.fsrs.due - b.fsrs.due);
  const left = Math.max(0, app.settings.newPerDay - (app.daily.day === today() ? app.daily.newDone : 0));
  const fresh = all.filter((c) => c.fsrs.state === fsrs.State.New).sort((a, b) => a.added - b.added).slice(0, left);
  return { due, fresh, list: [...due, ...fresh] };
}

export function nextDueAt() {
  const times = [...app.cards.values()].filter((c) => c.fsrs.state !== fsrs.State.New).map((c) => c.fsrs.due);
  return times.length ? Math.min(...times) : null;
}

export async function gradeCard(id, rating, now = Date.now()) {
  const c = app.cards.get(id);
  const wasNew = c.fsrs.state === fsrs.State.New;
  c.fsrs = fsrs.review(c.fsrs, rating, now);
  await db.put("cards", c);
  await db.add("log", { id, t: now, rating });
  if (wasNew) {
    if (app.daily.day !== today()) app.daily = { day: today(), newDone: 0 };
    app.daily.newDone += 1;
    await db.put("kv", { key: "daily", value: app.daily });
  }
  emit();
  return c;
}

// ── Книги ─────────────────────────────────────────────────────────────────
export async function addBook(file) {
  const buf = await file.arrayBuffer();
  const { meta, chapters, cover } = await readEpub(buf);
  const existing = app.books.find((b) => b.id === meta.id);
  if (existing) return { book: existing, duplicate: true };
  const waiting = (await db.get("kv", "progress"))?.value || {};
  const book = {
    id: meta.id,
    title: meta.title,
    author: meta.author,
    chapters: chapters.map(({ href, title, chars }) => ({ href, title, chars })),
    cover,
    progress: waiting[meta.id] || { ch: 0, p: 0 },
    added: Date.now(),
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

// ── Резервная копия ───────────────────────────────────────────────────────
export async function exportData() {
  const log = await db.all("log");
  return JSON.stringify(
    {
      app: BACKUP_TAG,
      version: 1,
      exported: new Date().toISOString(),
      settings: app.settings,
      cards: [...app.cards.values()],
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
    const mine = app.cards.get(c.id);
    const better = !mine || (c.fsrs?.reps || 0) > (mine.fsrs?.reps || 0) || (c.fsrs?.last || 0) > (mine.fsrs?.last || 0);
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
  if (Array.isArray(data.log) && !(await db.all("log")).length) for (const row of data.log) await db.add("log", row);
  if (data.settings) {
    Object.assign(app.settings, data.settings);
    applySettings();
    await db.put("kv", { key: "settings", value: app.settings });
  }
  emit();
  return added;
}
