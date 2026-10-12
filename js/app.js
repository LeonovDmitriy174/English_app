// app.js — запуск, маршруты и нижняя панель вкладок.
import { h, icon, closeSheet } from "./dom.js";
import { init, app, subscribe, queue, APP_NAME, ensureAnalysis, ensureContexts, reparseBooks, prefetchDictionary, startDictionary } from "./store.js";
import { installErrorLog } from "./diag.js";
import { renderHome } from "./views/home.js";
import { renderLibrary } from "./views/library.js";
import { renderReader } from "./views/reader.js";
import { renderDict } from "./views/dict.js";
import { renderReview } from "./views/review.js";
import { renderNotes } from "./views/notes.js";
import { remember, tabHref, origin } from "./nav.js";

installErrorLog(); // неожиданные ошибки попадают в журнал (настройки → «Сведения для отладки»)
prefetchDictionary(); // словарь начинает загружаться сразу, пока открывается хранилище

const root = document.getElementById("app");
const stage = h("div");
const tabs = [
  ["home", "Главная", "home"],
  ["library", "Книги", "book"],
  ["dict", "Словарь", "bookmark"],
  ["review", "Повторение", "repeat"],
  ["notes", "Заметки", "flag"],
];
const tabbar = h("nav", { class: "tabbar", "aria-label": "Разделы" });
// Сообщения над нижней панелью: «Доступна новая версия», «Словарь не загрузился»
const notices = h("div", { class: "notices" });
root.append(stage, tabbar, notices);

let cleanup = null;
let current = "home";

function paintTabs() {
  const due = queue("all").list.length;
  tabbar.replaceChildren(
    ...tabs.map(([key, label, ic]) =>
      h(
        "a",
        { class: "tab", href: tabHref(key, current), "aria-current": current === key ? "page" : null },
        icon(ic, 24),
        label,
        key === "review" && due > 0 && h("span", { class: "badge", "aria-label": `к повторению: ${due}` }, due > 99 ? "99+" : due),
      ),
    ),
  );
}

let previous = ""; // адрес, который был открыт до этого
const scrolls = new Map(); // адрес → докуда был прокручен экран: список книг, словарь и заметки открываются там же, где вы их оставили

/** Возвращает прокрутку экрана; если содержимое подгружается позже, повторяет попытку, пока вы сами ещё не прокрутили. */
function restoreScroll(hash) {
  const top = scrolls.get(hash);
  const view = stage.querySelector(".view");
  if (!top || !view) return;
  requestAnimationFrame(() => (view.scrollTop = top));
  setTimeout(() => view.isConnected && view.scrollTop === 0 && (view.scrollTop = top), 250);
}

function route() {
  const [, name = "home", arg] = location.hash.slice(1).split("/");
  if (previous && current !== "read") {
    const top = stage.querySelector(".view")?.scrollTop;
    if (Number.isFinite(top)) scrolls.set(previous, top);
  }
  cleanup?.();
  cleanup = null;
  closeSheet();
  document.querySelector(".toast")?.remove();
  document.body.classList.remove("immersive");
  window.scrollTo(0, 0);

  if (name === "read" && arg) {
    if (current !== "read") origin.hash = previous;
    current = "read";
    document.body.classList.add("immersive");
    cleanup = renderReader(stage, arg) || null;
  } else if (name === "dict") {
    current = "dict";
    cleanup = renderDict(stage);
  } else if (name === "review") {
    current = "review";
    cleanup = renderReview(stage);
  } else if (name === "notes") {
    current = "notes";
    remember("notes", arg);
    cleanup = renderNotes(stage, arg);
  } else if (name === "library") {
    current = "library";
    remember("library", arg);
    cleanup = renderLibrary(stage, arg);
  } else {
    current = "home";
    cleanup = renderHome(stage);
  }
  previous = location.hash || "#/home";
  if (name !== "read") restoreScroll(previous);
  paintTabs();
}

async function start() {
  document.title = APP_NAME;
  try {
    await init();
  } catch (err) {
    stage.replaceChildren(h("main", { class: "view" }, h("div", { class: "page" }, h("p", { class: "empty lead" }, "Не удалось открыть хранилище"), h("p", { class: "note" }, String(err.message || err)))));
    return;
  }
  subscribe(paintTabs);
  subscribe(paintNotices);
  window.addEventListener("hashchange", route);
  // Запуск без адреса открывает главную; вкладка «Книги» по-прежнему помнит, в какой папке вы остановились
  route();

  watchUpdates();
  // Словарь разбирается, когда первый экран уже нарисован: пока он идёт, приложение открыто, а не пусто
  requestAnimationFrame(() => setTimeout(() => startDictionary(), 0));
  // Фоновая работа, когда экран уже открылся: обновить разбор старых книг, проанализировать слова (после загрузки словаря),
  // затем найти в книгах предложения для заданий «Слово в предложении»
  setTimeout(async () => {
    await reparseBooks();
    await ensureAnalysis();
    ensureContexts();
  }, 600);
}

// Офлайн-кэш и обновления. Новая версия скачивается сама, а перезапуск делаете вы, когда удобно.
function watchUpdates() {
  if (!("serviceWorker" in navigator)) return;
  let controlled = !!navigator.serviceWorker.controller; // самая первая установка плашки не требует
  navigator.serviceWorker.addEventListener("controllerchange", () => {
    if (controlled) showUpdate();
    controlled = true;
  });
  navigator.serviceWorker
    .register("sw.js")
    .then((reg) => {
      // iOS держит приложение в памяти днями: проверяем обновление, когда вы к нему возвращаетесь
      document.addEventListener("visibilitychange", () => document.visibilityState === "visible" && reg.update().catch(() => {}));
    })
    .catch(() => {
      /* без офлайн-кэша приложение всё равно работает, пока есть доступ к файлам */
    });
}

function showUpdate() {
  if (notices.querySelector(".update")) return;
  notices.append(h("div", { class: "update", role: "status" }, h("span", null, "Доступна новая версия"), h("button", { onClick: () => location.reload() }, "Обновить")));
}

/** Плашка «Словарь не загрузился»: без неё приложение молча показывало бы «нет в словаре» у каждого слова. */
function paintNotices() {
  const shown = notices.querySelector(".dict-error");
  if (app.dict.state !== "error") {
    shown?.remove();
    return;
  }
  if (shown) return;
  notices.prepend(
    h(
      "div",
      { class: "update dict-error", role: "alert" },
      h("span", null, "Словарь не загрузился: переводов не будет"),
      h("button", { onClick: () => startDictionary({ retry: true }) }, "Повторить"),
    ),
  );
}

start();
