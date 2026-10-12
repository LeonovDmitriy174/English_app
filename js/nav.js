// nav.js — адреса страниц с папками и память вкладок. Чистые функции без DOM (tests/nav.test.mjs).
//
// Вкладки «Книги» и «Заметки» устроены как папки в «Заметках» на iPhone:
//   #/library            список папок          #/notes            список папок
//   #/library/all        все книги             #/notes/all        все заметки
//   #/library/<id>       одна папка            #/notes/<id>       одна папка
// Как на iPhone, вкладка помнит, где вы были (в какой папке), а касание уже открытой вкладки возвращает к её началу.
// Место помнится и после перезапуска приложения: открыли — и вы там же, где закончили, одно касание до книги.

export const TABS = ["library", "notes"];

/** Откуда открыли книгу: чтобы стрелка «назад» в читалке вела туда же (на главную или в библиотеку). */
export const origin = { hash: "" };
export const backFromReader = () => (origin.hash.startsWith("#/home") ? "#/home" : lastPage.library);

/** Какая страница показывалась на вкладке в последний раз. */
export const lastPage = { library: "#/library", notes: "#/notes" };

// Память между запусками. Без неё (закрытый доступ к хранилищу браузера) приложение просто начинает со списка папок.
const KEY = "ember.lastPage";
try {
  const saved = JSON.parse(globalThis.localStorage?.getItem(KEY) || "null");
  for (const tab of TABS) if (typeof saved?.[tab] === "string" && saved[tab].startsWith(`#/${tab}`)) lastPage[tab] = saved[tab];
} catch {
  /* нет доступа к хранилищу или запись испорчена */
}
const save = () => {
  try {
    globalThis.localStorage?.setItem(KEY, JSON.stringify(lastPage));
  } catch {
    /* память о месте не критична */
  }
};

/** Адрес страницы вкладки: без папки — список папок. */
export const pageHash = (tab, folder = "") => (folder ? `#/${tab}/${encodeURIComponent(folder)}` : `#/${tab}`);

/** Папка из адреса (третья часть после «#/вкладка/»). Испорченный адрес читается как «без папки». */
export function folderFromHash(arg) {
  if (!arg) return "";
  try {
    return decodeURIComponent(arg);
  } catch {
    return "";
  }
}

/** Запоминает страницу вкладки по адресу, который сейчас открыт. */
export function remember(tab, arg) {
  if (!TABS.includes(tab)) return;
  lastPage[tab] = pageHash(tab, folderFromHash(arg));
  save();
}

/** Куда ведёт значок вкладки: на открытую вкладку — к её началу, на другую — туда, где вы там были. */
export const tabHref = (tab, current) => (tab === current ? `#/${tab}` : lastPage[tab] || `#/${tab}`);
