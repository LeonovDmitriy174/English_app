// chars.js (store) — заметки к именам и названиям: хранение, правка, загрузка файла терминов (правила: js/characters.js).
import { db } from "../db.js";
import { normKey, mergeTerms, charsToList, exportTerms, MAX_CHARS, MAX_NAME, MAX_TEXT } from "../characters.js";
import { app, emit } from "./state.js";

const persist = () => db.put("kv", { key: "chars", value: charsToList(app.chars) });

/**
 * Записывает заметку к имени или названию. key приводится к ключу; пустой текст удаляет запись.
 * Запись, которую вы написали сами, помечается (o) и при загрузке файла терминов не перезаписывается.
 * Возвращает ключ или "" (если сохранять нечего).
 */
export async function setChar(key, { name = "", text = "" } = {}) {
  const k = normKey(key);
  const t = String(text).replace(/\s+/g, " ").trim().slice(0, MAX_TEXT);
  if (!k) return "";
  if (!t) {
    if (app.chars.delete(k)) {
      await persist();
      emit();
    }
    return k;
  }
  if (!app.chars.has(k) && app.chars.size >= MAX_CHARS) return "";
  app.chars.set(k, { n: String(name).replace(/\s+/g, " ").trim().slice(0, MAX_NAME), t, o: 1 });
  await persist();
  emit();
  return k;
}

export async function removeChar(key) {
  if (!app.chars.delete(normKey(key))) return false;
  await persist();
  emit();
  return true;
}

/** Загружает разобранные термины (js/characters.js parseTerms). Возвращает { added, updated, kept }. */
export async function importChars(items) {
  const r = mergeTerms(app.chars, items);
  if (r.added || r.updated) {
    app.chars = r.map;
    await persist();
    emit();
  }
  return { added: r.added, updated: r.updated, kept: r.kept };
}

/** Все заметки текстом «название;описание»: чтобы скопировать или сохранить в файл. */
export const charsText = () => exportTerms(app.chars);

/** Заменяет все записи (при загрузке копии данных). */
export async function replaceChars(map) {
  app.chars = map;
  await persist();
  emit();
}
