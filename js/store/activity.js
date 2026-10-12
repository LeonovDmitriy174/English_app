// activity.js (store) — время чтения по дням: читалка раз в несколько секунд добавляет время, здесь оно копится и сохраняется.
import { db } from "../db.js";
import { addRead } from "../activity.js";
import { app, emit, today } from "./state.js";

let saveTimer = 0;
let unsaved = false;

const persist = async () => {
  clearTimeout(saveTimer);
  saveTimer = 0;
  if (!unsaved) return;
  unsaved = false;
  try {
    await db.put("kv", { key: "activity", value: app.activity });
  } catch {
    unsaved = true; // не записалось: попробуем при следующем добавлении
  }
};

/** Добавляет секунды чтения к сегодняшнему дню. Запись на устройство идёт не чаще раза в полминуты, а при выходе из книги сразу (flushActivity). */
export function addReadingTime(sec) {
  addRead(app.activity, today(), sec);
  unsaved = true;
  if (!saveTimer) saveTimer = setTimeout(persist, 30000);
}

/** Сохраняет накопленное немедленно: выход из книги, сворачивание приложения. */
export const flushActivity = () => persist();

/** Заменяет данные о чтении (загрузка копии) и сохраняет. */
export async function setActivity(activity) {
  app.activity = activity;
  unsaved = true;
  await persist();
  emit();
}
