// store.js — состояние приложения: словарь, карточки, книги, настройки. Всё хранится на устройстве.
import { db, requestPersistence } from "./db.js";
import { Glossary, lemmaCandidates } from "./lex.js";
import { readEpub, EPUB_PARSER } from "./epub.js";
import { openZip } from "./zip.js";
import { analyzeBook, dictSignature } from "./analysis.js";
import * as levels from "./levels.js";
import { newNote, noteAt, mergeNotes } from "./notes.js";
import { sanitizeCatalog, cleanName, nameTaken, newGroupId, toggleMembership, isUserGroup, reconcileGroups, mergeGroups, folderTree, siblingsOf, canNestIn, subtreeIds } from "./shelf.js";
import { DEFAULT_MIX, normalizeMix, capOf, isWritten } from "./modes.js";
import { contextPool, scanBook, mergeFound, ENOUGH } from "./context.js";
import { leeches } from "./leech.js";

export const APP_NAME = "Ember Chronicle";
const BACKUP_TAG = "ember-chronicle-backup"; // не менять: по нему опознаются файлы копий

export const app = {
  glossary: new Glossary([]),
  cards: new Map(),
  books: [],
  // newPerDay, mixModes и speedRule это настройки словаря (js/views/dictsettings.js), остальные настройки приложения
  settings: { theme: "auto", fontSize: 19, hilite: true, speakOnTap: false, newPerDay: 20, mixModes: [...DEFAULT_MIX], speedRule: true },
  daily: { day: "", newDone: 0 },
  analysis: null, // { id, pct } пока идёт разбор книги
  notes: [], // заметки и закладки к книгам (js/notes.js)
  jump: null, // { id } заметка, к которой читалка должна перейти при открытии
  groups: [], // свои папки книг: [{ id: "u-…", name, created, parent? }]; parent — папка верхнего уровня (своя или встроенная)
  catalog: { groups: [], books: [] }, // встроенные книги из books/catalog.json (js/shelf.js)
  catalogLoaded: false, // каталог получен из сети или из сохранённой копии
  downloading: new Set(), // id книг каталога, которые скачиваются сейчас
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
  const [cards, books, kvSettings, kvDaily, kvNotes, kvGroups, kvCatalog] = await Promise.all([db.all("cards"), db.all("books"), db.get("kv", "settings"), db.get("kv", "daily"), db.get("kv", "notes"), db.get("kv", "groups"), db.get("kv", "catalog")]);
  app.notes = Array.isArray(kvNotes?.value) ? kvNotes.value : [];
  app.groups = (Array.isArray(kvGroups?.value) ? kvGroups.value : []).filter((g) => isUserGroup(g?.id) && cleanName(g.name));
  if (kvCatalog?.value) {
    app.catalog = sanitizeCatalog(kvCatalog.value);
    app.catalogLoaded = true;
  }
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
  app.settings.mixModes = normalizeMix(app.settings.mixModes);
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

/** Свой перевод вместо словарного. Пустой перевод не сохраняется. Возвращает true, если перевод изменён. */
export async function setTranslation(id, text) {
  const ru = String(text || "").replace(/\s+/g, " ").trim().slice(0, 200);
  if (!ru || !app.cards.has(id)) return false;
  await updateCard(id, { ru, rm: "", edited: true });
  return true;
}

/** «Моя ассоциация»: короткая запоминалка к слову. */
export const setMnemonic = (id, text) => updateCard(id, { mnemonic: String(text || "").replace(/\s+/g, " ").trim().slice(0, 200) });

/** «Это имя, не повторять»: слово остаётся в словаре, но из повторения уходит. Уровни при этом не трогаются. */
export const setSkip = (id, skip) => updateCard(id, { skip: !!skip });

// ── Повторение ────────────────────────────────────────────────────────────
/** Сколько сейчас трудных слов (js/leech.js). */
export const hardCount = () => leeches([...app.cards.values()]).length;

/**
 * Очередь повторения. scope: 'all' | 'w' | 'pv' | 'id' | 'hard' (трудные слова: все, не только те, что пора повторять).
 * Слова, помеченные «Это имя, не повторять», в очередь не попадают.
 */
export function queue(scope = "all", now = Date.now()) {
  const live = [...app.cards.values()].filter((c) => !c.skip);
  if (scope === "hard") {
    const hard = leeches(live);
    return { due: hard, fresh: [], list: hard };
  }
  const all = live.filter((c) => scope === "all" || c.t === scope);
  const due = all.filter((c) => !levels.isNew(c.srs) && c.srs.due <= now).sort((a, b) => a.srs.due - b.srs.due);
  const left = Math.max(0, app.settings.newPerDay - (app.daily.day === today() ? app.daily.newDone : 0));
  const fresh = all.filter((c) => levels.isNew(c.srs)).sort((a, b) => a.added - b.added).slice(0, left);
  return { due, fresh, list: [...due, ...fresh] };
}

/**
 * Записать ответ на карточку. result: 'ok' | 'near' | 'no'; task: задание (js/modes.js), по нему определяется, письменное оно
 * и до какого уровня поднимает слово; ctxText: предложение, которое только что показывали (чтобы в следующий раз взять другое);
 * ms: сколько длился ответ (в журнал, пользователю не показывается); lapse: false, если это повтор после ошибки в том же заходе
 * (вторая ошибка по тому же слову за заход «трудным» его не делает).
 * Повторение раньше срока (например, трудные слова вне очереди) уровень не поднимает и срок не двигает.
 * Возвращает { card, before, after }: уровень до и после ответа (для индикатора).
 */
export async function answerCard(id, result, { task = "", written, now = Date.now(), ctxText = "", ms = null, lapse = true } = {}) {
  const c = app.cards.get(id);
  const before = c.srs.lv;
  const lapsesBefore = c.srs.lapses || 0;
  const wr = written ?? isWritten(task);
  const early = before > 0 && c.srs.due > now;
  if (early && result !== "no") c.srs = { ...c.srs, last: now, reps: (c.srs.reps || 0) + 1 };
  else c.srs = levels.answer(c.srs, result, { written: wr, now, cap: capOf(task) });
  if (!lapse) c.srs.lapses = lapsesBefore;
  if (ctxText) c.lastCtx = ctxText;
  await db.put("cards", c);
  await db.add("log", { id, t: now, result, written: wr, task, lv: c.srs.lv, ...(Number.isFinite(ms) ? { ms: Math.round(ms) } : {}) });
  if (before === 0) {
    if (app.daily.day !== today()) app.daily = { day: today(), newDone: 0 };
    app.daily.newDone += 1;
    await db.put("kv", { key: "daily", value: app.daily });
  }
  emit();
  return { card: c, before, after: c.srs.lv };
}

// ── Предложения для задания «Слово в предложении» ────────────────────────
let scanning = false;

/**
 * Ищет в загруженных книгах другие предложения со словами из словаря, чтобы пропуск не повторял одно и то же предложение.
 * Идёт в фоне: по каждой книге один просмотр для всех слов, которым не хватает предложений. Найденное хранится у карточки
 * (found), а просмотренные книги запоминаются (scanned), так что каждая книга просматривается для слова один раз.
 */
export async function ensureContexts() {
  if (scanning) return;
  scanning = true;
  try {
    const short = [...app.cards.values()].filter((c) => !c.skip && contextPool(c, app.glossary).length < ENOUGH);
    for (const b of [...app.books]) {
      const wanted = new Map();
      for (const card of short) {
        if (card.scanned?.includes(b.id) || app.cards.get(card.id) !== card) continue;
        wanted.set(card.id, { card, known: new Set([...(card.ctx || []), ...(card.found || [])].map((x) => x.s)) });
      }
      if (!wanted.size) continue;
      try {
        const zip = await bookZip(b.id);
        const picks = await scanBook({ book: b, zip, wanted, glossary: app.glossary });
        for (const [id, { card }] of wanted) {
          if (app.cards.get(id) !== card) continue; // слово удалили, пока шёл просмотр
          const got = picks.get(id);
          if (got?.length) card.found = mergeFound(card.found, got);
          card.scanned = [...(card.scanned || []), b.id];
          await db.put("cards", card);
        }
      } catch {
        /* книга не открылась: попробуем в другой раз */
      }
    }
  } finally {
    scanning = false;
  }
}

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

// ── Папки книг ────────────────────────────────────────────────────────────
// Внутри хранилища они по-прежнему называются groups (так записаны ваши данные и резервные копии).
// Вложенность одна: у папки верхнего уровня бывают вложенные, у вложенных своих нет. Это правило проверяется здесь,
// поэтому из интерфейса, из резервной копии и из каталога глубже одной вложенности не получится.
const persistGroups = () => db.put("kv", { key: "groups", value: app.groups });
const persistBook = (b) => db.put("books", b);
export const folders = () => folderTree({ catalog: app.catalog, userGroups: app.groups });

const NESTED_ERR = "Глубже одной вложенности папки не делаются";

/** Проверка названия среди соседей (папок в той же папке). Возвращает текст ошибки или "". */
function nameProblem(name, parent, except = null) {
  if (!name) return "Введите название папки";
  if (nameTaken(name, siblingsOf(folders(), parent), except)) return parent ? "В этой папке уже есть папка с таким названием" : "Папка с таким названием уже есть";
  return "";
}

/** Новая своя папка; parent — id папки верхнего уровня или null. Возвращает { group } или { error } с причиной по-русски. */
export async function createGroup(name, parent = null) {
  const clean = cleanName(name);
  if (parent && !canNestIn(folders(), parent)) return { error: folders().byId.has(parent) ? NESTED_ERR : "Папки, куда вы кладёте, уже нет" };
  const error = nameProblem(clean, parent);
  if (error) return { error };
  const g = { id: newGroupId(), name: clean, created: Date.now(), ...(parent ? { parent } : {}) };
  app.groups.push(g);
  await persistGroups();
  emit();
  return { group: g };
}

export async function renameGroup(id, name) {
  const g = app.groups.find((x) => x.id === id);
  if (!g) return { error: "Папки уже нет" };
  const clean = cleanName(name);
  const error = nameProblem(clean, folders().byId.get(id)?.parent || null, id);
  if (error) return { error };
  g.name = clean;
  await persistGroups();
  emit();
  return { group: g };
}

/** Перекладывает свою папку на верхний уровень (parent = null) или внутрь папки верхнего уровня. */
export async function moveGroup(id, parent = null) {
  const g = app.groups.find((x) => x.id === id);
  if (!g) return { error: "Папки уже нет" };
  const tree = folders();
  const node = tree.byId.get(id);
  if (parent) {
    if (parent === id || !tree.byId.has(parent)) return { error: "Папки, куда вы кладёте, уже нет" };
    if (node.children.length || !canNestIn(tree, parent)) return { error: NESTED_ERR };
  }
  if ((node.parent || null) === (parent || null)) return { group: g };
  const error = nameProblem(g.name, parent, id);
  if (error) return { error: parent ? "В выбранной папке уже есть папка с таким названием" : "На верхнем уровне уже есть папка с таким названием" };
  if (parent) g.parent = parent;
  else delete g.parent;
  await persistGroups();
  emit();
  return { group: g };
}

/** Удаляет свою папку вместе с вложенными, но не книги: они просто выходят из папок. Возвращает число удалённых папок. */
export async function deleteGroup(id) {
  const mine = new Set(app.groups.map((g) => g.id));
  if (!mine.has(id)) return 0;
  const gone = new Set(subtreeIds(folders(), id).filter((x) => mine.has(x)));
  app.groups = app.groups.filter((g) => !gone.has(g.id));
  await persistGroups();
  for (const b of app.books) {
    if (b.groups?.some((x) => gone.has(x))) {
      b.groups = b.groups.filter((x) => !gone.has(x));
      await persistBook(b);
    }
  }
  const meta = (await db.get("kv", "bookmeta"))?.value;
  if (meta && Object.values(meta).some((m) => m.groups?.some((x) => gone.has(x)))) {
    for (const m of Object.values(meta)) m.groups = (m.groups || []).filter((x) => !gone.has(x));
    await db.put("kv", { key: "bookmeta", value: meta });
  }
  emit();
  return gone.size;
}

/** Кладёт книгу в свою папку или достаёт её оттуда. */
export async function toggleBookGroup(bookId, groupId) {
  const b = app.books.find((x) => x.id === bookId);
  if (!b || !app.groups.some((g) => g.id === groupId)) return;
  b.groups = toggleMembership(b.groups, groupId);
  await persistBook(b);
  emit();
}

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
      version: 4,
      exported: new Date().toISOString(),
      settings: app.settings,
      cards: [...app.cards.values()],
      notes: app.notes,
      groups: app.groups,
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
      b.progress = p.progress;
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
  if (Array.isArray(data.log) && !(await db.all("log")).length) for (const row of data.log) await db.add("log", row);
  if (data.settings) {
    Object.assign(app.settings, data.settings);
    app.settings.mixModes = normalizeMix(app.settings.mixModes);
    applySettings();
    await db.put("kv", { key: "settings", value: app.settings });
  }
  emit();
  return { cards: added, notes: notesAdded };
}
