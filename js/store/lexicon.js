// lexicon.js — общий словарь приложения: загрузка (из офлайн-кэша или сети), разбор и состояние загрузки.
import { db } from "../db.js";
import { Glossary } from "../lex.js";
import { errorLog } from "../diag.js";
import { app, emit } from "./state.js";

// ── Общий словарь ─────────────────────────────────────────────────────────
const DICT_URL = "data/dict.json";
let dictFetch = null;
let dictPromise = null;
const retryHooks = [];

/** Что сделать после того, как словарь удалось загрузить повторно (разбор книг и поиск предложений: store.js). */
export const onDictionaryRetried = (fn) => retryHooks.push(fn);

/** Начинает скачивать словарь (из офлайн-кэша или сети), пока приложение ещё запускается. Вызывается как можно раньше. */
export function prefetchDictionary() {
  if (!dictFetch) {
    dictFetch = fetch(DICT_URL);
    dictFetch.catch(() => {}); // ошибку разберёт startDictionary; без этого браузер сообщил бы о «необработанном отказе»
  }
  return dictFetch;
}

/**
 * Разбирает словарь и кладёт его в app.glossary. Состояние в app.dict: loading → ready или error.
 * При ошибке (файла нет, он повреждён) приложение работает с пустым словарём, но это видно: app.dict.error, плашка на экране
 * и строка в «сведениях для отладки»; разбор книг при этом не запускается, чтобы не записать в них «словарь знает 0%».
 * retry: true — повторить после ошибки.
 */
export function startDictionary({ retry = false } = {}) {
  if (dictPromise && !retry) return dictPromise;
  if (retry) dictFetch = null;
  const t0 = performance.now();
  app.dict = { state: "loading", entries: 0, ms: 0, error: "" };
  if (retry) emit();
  dictPromise = (async () => {
    try {
      const res = await prefetchDictionary();
      if (!res.ok) throw new Error(`${DICT_URL}: ответ ${res.status}`);
      const data = await res.json();
      if (!Array.isArray(data)) throw new Error(`${DICT_URL}: ожидался список слов`);
      app.glossary = new Glossary(data);
      app.dict = { state: "ready", entries: app.glossary.list.length, ms: Math.round(performance.now() - t0), error: "" };
    } catch (err) {
      app.glossary = new Glossary([]);
      app.dict = { state: "error", entries: 0, ms: Math.round(performance.now() - t0), error: String(err?.message || err) };
      errorLog.add("словарь", app.dict.error);
    }
    if (app.dict.state === "ready") await backfillTranslations();
    emit();
    // запуск не дождался словаря и ничего не разобрал: после удачного повтора разбор книг и поиск предложений нужно сделать сейчас
    if (retry && app.dict.state === "ready") retryHooks.forEach((fn) => fn());
  })();
  return dictPromise;
}

/** Ждёт, пока словарь разобран (или не удалось его загрузить: тогда в app.dict.state будет error). */
export const dictionaryReady = () => dictPromise || startDictionary();

/** Слово добавили, когда перевода ещё не было: берём то, что появилось в словаре с тех пор. */
async function backfillTranslations() {
  for (const c of app.cards.values()) {
    if (c.ru || c.rm || c.custom) continue;
    const e = app.glossary.byId.get(c.id);
    if (e && (e.ru || e.rm)) {
      c.ru = e.ru || "";
      c.rm = e.ru ? "" : e.rm || "";
      await db.put("cards", c);
    }
  }
}
