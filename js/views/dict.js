// dict.js — словарь пользователя: поиск, фильтры, переход к карточке.
import { h, icon, closeSheet } from "../dom.js";
import { app, subscribe, kindClass } from "../store.js";
import { State, formatDue } from "../fsrs.js";
import { openSlip } from "./slip.js";

const FILTERS = [
  ["all", "Все"],
  ["w", "Слова"],
  ["pv", "Фразовые глаголы"],
  ["id", "Идиомы"],
];

const plural = (n, f) => {
  const a = n % 10;
  const b = n % 100;
  return f[b > 10 && b < 20 ? 2 : a === 1 ? 0 : a >= 2 && a <= 4 ? 1 : 2];
};

function dueOf(card, now) {
  if (card.fsrs.state === State.New) return { text: "новое", hot: true };
  const diff = card.fsrs.due - now;
  if (diff <= 0) return { text: "пора", hot: true };
  return { text: `через ${formatDue(card.fsrs.due, now)}`, hot: false };
}

let filter = "all";

export function renderDict(root) {
  let query = "";
  const sub = h("p", { class: "sub" });
  const list = h("div");
  const chips = h("div", { class: "chips", role: "group", "aria-label": "Фильтр по типу" });
  const input = h("input", { type: "search", placeholder: "Поиск по словарю", "aria-label": "Поиск по словарю", autocomplete: "off", autocapitalize: "off", spellcheck: "false" });
  input.addEventListener("input", () => {
    query = input.value.trim().toLowerCase();
    paintList();
  });
  const search = h("div", { class: "search" }, icon("search", 20), input);
  const controls = h("div", null, search, chips);

  const page = h("div", { class: "page" }, h("header", { class: "top" }, h("div", null, h("h1", { class: "title" }, "Словарь"), sub)), controls, list);
  root.replaceChildren(h("main", { class: "view" }, page));

  function counts() {
    const c = { all: app.cards.size, w: 0, pv: 0, id: 0 };
    app.cards.forEach((card) => c[card.t]++);
    return c;
  }

  function paintChips() {
    const c = counts();
    chips.replaceChildren(
      ...FILTERS.map(([key, label]) =>
        h(
          "button",
          {
            class: "chip",
            "aria-pressed": String(filter === key),
            onClick: () => {
              filter = key;
              paintChips();
              paintList();
            },
          },
          label,
          h("span", { class: "n" }, c[key]),
        ),
      ),
    );
  }

  function paintList() {
    const n = app.cards.size;
    sub.textContent = n ? `${n} ${plural(n, ["карточка", "карточки", "карточек"])}` : "";
    controls.hidden = !n;
    if (!n) {
      list.replaceChildren(
        h(
          "section",
          { class: "empty" },
          h("p", { class: "lead" }, "Словарь пока пуст"),
          h("p", null, "Нажимайте на незнакомые слова в книге и добавляйте их сюда. Каждое слово сохранится вместе с предложением, в котором вы его встретили."),
          h("button", { class: "btn primary", onClick: () => (location.hash = "#/library") }, "Открыть книгу"),
        ),
      );
      return;
    }
    const now = Date.now();
    const items = [...app.cards.values()]
      .filter((c) => (filter === "all" || c.t === filter) && (!query || c.w.includes(query) || c.ru.toLowerCase().includes(query)))
      .sort((a, b) => b.added - a.added);
    if (!items.length) {
      list.replaceChildren(h("p", { class: "note" }, "Ничего не найдено."));
      return;
    }
    list.replaceChildren(
      h(
        "ul",
        { class: "rows" },
        items.map((c) => {
          const due = dueOf(c, now);
          return h(
            "li",
            null,
            h(
              "button",
              { class: `row ${kindClass(c.t)}`, onClick: () => openSlip({ entry: c, surface: c.w, onChange: () => {} }) },
              h("span", { class: "row-mark" }),
              h("div", { class: "row-main" }, h("div", { class: "row-hw" }, c.w), h("div", { class: "row-ru" }, c.ru)),
              h("span", { class: `row-due${due.hot ? " now" : ""}` }, due.text),
            ),
          );
        }),
      ),
    );
  }

  const refresh = () => {
    paintChips();
    paintList();
  };
  refresh();
  const off = subscribe(refresh);
  return () => {
    off();
    closeSheet();
  };
}
