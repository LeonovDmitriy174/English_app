// app.js — запуск, маршруты и нижняя панель вкладок.
import { h, icon, closeSheet } from "./dom.js";
import { init, app, subscribe, queue, APP_NAME, ensureAnalysis, ensureContexts, reparseBooks, prefetchDictionary, startDictionary } from "./store.js";
import { installErrorLog } from "./diag.js";
import { renderLibrary } from "./views/library.js";
import { renderReader } from "./views/reader.js";
import { renderDict } from "./views/dict.js";
import { renderReview } from "./views/review.js";
import { renderNotes } from "./views/notes.js";
import { remember, tabHref, lastPage } from "./nav.js";

installErrorLog(); // неожиданные ошибки попадают в журнал (настройки → «Сведения для отладки»)
prefetchDictionary(); // словарь начинает загружаться сразу, пока открывается хранилище

const root = document.getElementById("app");
const stage = h("div");
const tabs = [
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
let current = "library";

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

function route() {
  const [, name = "library", arg] = location.hash.slice(1).split("/");
  cleanup?.();
  cleanup = null;
  closeSheet();
  document.querySelector(".toast")?.remove();
  document.body.classList.remove("immersive");
  window.scrollTo(0, 0);

  if (name === "read" && arg) {
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
  } else {
    current = "library";
    remember("library", arg);
    cleanup = renderLibrary(stage, arg);
  }
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
  // Запуск без адреса: книги открываются там, где вы закончили (какая папка), как в «Заметках» на iPhone
  if (["", "#", "#/"].includes(location.hash) && lastPage.library !== "#/library") history.replaceState(null, "", lastPage.library);
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
