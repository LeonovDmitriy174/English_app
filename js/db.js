// db.js — хранилище на устройстве (IndexedDB). Никаких серверов: всё остаётся в браузере телефона.

const NAME = "ember"; // прежнее имя базы: менять нельзя, иначе пропадут сохранённые книги и слова
const VERSION = 1;
let dbPromise;

function open() {
  return (dbPromise ??= new Promise((resolve, reject) => {
    const req = indexedDB.open(NAME, VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      db.createObjectStore("books", { keyPath: "id" }); // метаданные, оглавление, прогресс
      db.createObjectStore("files", { keyPath: "id" }); // исходные файлы EPUB
      db.createObjectStore("cards", { keyPath: "id" }); // словарь пользователя
      db.createObjectStore("log", { autoIncrement: true }); // журнал ответов
      db.createObjectStore("kv", { keyPath: "key" }); // настройки
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  }));
}

async function run(store, mode, fn) {
  const db = await open();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(store, mode);
    const out = fn(tx.objectStore(store));
    tx.oncomplete = () => resolve(out?.result);
    tx.onerror = () => reject(tx.error);
    tx.onabort = () => reject(tx.error);
  });
}

export const db = {
  get: (store, key) => run(store, "readonly", (s) => s.get(key)),
  all: (store) => run(store, "readonly", (s) => s.getAll()),
  count: (store) => run(store, "readonly", (s) => s.count()),
  put: (store, value) => run(store, "readwrite", (s) => s.put(value)),
  add: (store, value) => run(store, "readwrite", (s) => s.add(value)),
  /** Много записей одной транзакцией: на телефоне в десятки раз быстрее, чем по одной, и либо всё записалось, либо ничего. */
  putMany: (store, values) => run(store, "readwrite", (s) => void values.forEach((v) => s.put(v))),
  addMany: (store, values) => run(store, "readwrite", (s) => void values.forEach((v) => s.add(v))),
  delMany: (store, keys) => run(store, "readwrite", (s) => void keys.forEach((k) => s.delete(k))),
  del: (store, key) => run(store, "readwrite", (s) => s.delete(key)),
  clear: (store) => run(store, "readwrite", (s) => s.clear()),
};

/** Просит браузер не удалять данные при нехватке места. */
export async function requestPersistence() {
  try {
    if (navigator.storage?.persist) return await navigator.storage.persist();
  } catch {
    /* не критично */
  }
  return false;
}

export async function isPersisted() {
  try {
    return (await navigator.storage?.persisted?.()) ?? false;
  } catch {
    return false;
  }
}
