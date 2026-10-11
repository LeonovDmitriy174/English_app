// app.js — запуск, маршруты и нижняя панель вкладок.
import { h, icon, closeSheet } from "./dom.js";
import { init, app, subscribe, queue, APP_NAME } from "./store.js";
import { renderLibrary } from "./views/library.js";
import { renderReader } from "./views/reader.js";
import { renderDict } from "./views/dict.js";
import { renderReview } from "./views/review.js";

const root = document.getElementById("app");
const stage = h("div");
const tabs = [
  ["library", "Книги", "book"],
  ["dict", "Словарь", "bookmark"],
  ["review", "Повторение", "repeat"],
];
const tabbar = h("nav", { class: "tabbar", "aria-label": "Разделы" });
root.append(stage, tabbar);

let cleanup = null;
let current = "library";

function paintTabs() {
  const due = queue("all").list.length;
  tabbar.replaceChildren(
    ...tabs.map(([key, label, ic]) =>
      h(
        "a",
        { class: "tab", href: `#/${key}`, "aria-current": current === key ? "page" : null },
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
  } else {
    current = "library";
    cleanup = renderLibrary(stage);
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
  window.addEventListener("hashchange", route);
  route();

  if ("serviceWorker" in navigator) {
    navigator.serviceWorker.register("sw.js").catch(() => {
      /* без офлайн-кэша приложение всё равно работает, пока есть доступ к файлам */
    });
  }
}

start();
