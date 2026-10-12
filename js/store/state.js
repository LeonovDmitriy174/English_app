// state.js — состояние приложения (одно общее на все экраны) и подписка на его изменения. Всё хранится на устройстве.
import { Glossary } from "../lex.js";
import { DEFAULT_MIX } from "../modes.js";
import { studyDay } from "../levels.js";

export const APP_NAME = "Gloss"; // видимое имя; внутренние имена (база данных, кэши, метка копии) прежние: от них зависят уже сохранённые данные
export const app = {
  glossary: new Glossary([]),
  cards: new Map(),
  activity: { read: {} }, // время чтения по учебным дням, секунды (js/activity.js)
  known: new Set(), // id слов, которые вы пометили «Знаю» в списке «Слова этой книги»: их там больше не предлагают
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
  dict: { state: "loading", entries: 0, ms: 0, error: "" }, // общий словарь: loading → ready или error (см. startDictionary)
  backup: { at: null, snoozeUntil: 0 }, // когда сделана последняя копия данных и до какого момента напоминание отложено
};

const listeners = new Set();
export const subscribe = (fn) => (listeners.add(fn), () => listeners.delete(fn));
export const emit = () => listeners.forEach((fn) => fn());

export const today = () => studyDay(); // «ГГГГ-ММ-ДД» по местному времени; сутки начинаются в 4:00, как и сроки повторений

// ── Подписи ───────────────────────────────────────────────────────────────
const POS = { n: "noun", v: "verb", adj: "adjective", adv: "adverb", prep: "preposition", pv: "phrasal verb", id: "idiom" };
export const kindOf = (t) => ({ w: "Слова", pv: "Фразовые глаголы", id: "Идиомы" })[t];
export const kindClass = (t) => `k-${t}`;
export function posLabel(item) {
  if (item.t === "pv") return "phrasal verb";
  if (item.t === "id") return "idiom";
  return POS[item.pos] || item.pos || "";
}
