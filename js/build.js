// build.js — номер версии приложения и номер сборки.
//
// Версию меняет разработчик, а номер сборки при публикации подставляет .github/workflows/pages.yml (короткий номер коммита,
// тот же, что в sw.js). Если подстановки не было (запуск на компьютере), сборка называется «разработка».
export const APP_VERSION = "4.7";
export const BUILD = "__BUILD__";
export const buildLabel = BUILD.startsWith("__") ? "разработка" : BUILD;
