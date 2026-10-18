// dict.js — словарь пользователя: поиск, тип, порядок и фильтры (уровень, источник), переход к карточке и массовые действия над выбранными словами.
import { h, icon, closeSheet, openSheet, toast } from "../dom.js";
import { app, subscribe, kindClass, removeCards, patchCards } from "../store.js";
import { isNew, newSrs } from "../levels.js";
import { levelBar } from "./level.js";
import { openSlip } from "./slip.js";
import { openDictSettings } from "./dictsettings.js";
import { openAddWord } from "./addword.js";
import { SORTS, LEVELS, SOURCES, DEFAULTS, levelKey, filterCards, sortCards, activeCount, describe } from "../dictview.js";

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
const wordsOf = (n) => `${n} ${plural(n, ["слово", "слова", "слов"])}`;

/** Справа в строке: «новое», «пора» или индикатор уровня. Времени повторения не показываем. */
function stateOf(card, now) {
  if (card.skip) return { text: "не повторяется" };
  if (isNew(card.srs)) return { text: "новое", hot: true };
  if (card.srs.due <= now) return { text: "пора", hot: true };
  return { bar: levelBar(card.srs.lv) };
}

// Что выбрано, помнится, пока приложение открыто: вернулись во вкладку — список в том же виде
const view = { ...DEFAULTS };

export function renderDict(root) {
  let query = "";
  let picking = false; // режим «Выбрать»: касание строки отмечает слово
  const picked = new Set();
  const sub = h("p", { class: "sub" });
  const list = h("div");
  const chips = h("div", { class: "chips", role: "group", "aria-label": "Фильтр по типу" });
  const input = h("input", { type: "search", placeholder: "Поиск по словарю", "aria-label": "Поиск по словарю", autocomplete: "off", autocapitalize: "off", spellcheck: "false" });
  input.addEventListener("input", () => {
    query = input.value.trim().toLowerCase();
    paintList();
  });
  const search = h("div", { class: "search" }, icon("search", 20), input);
  const bar = h("div", { class: "dv-bar" });
  const controls = h("div", null, search, chips, bar);
  const actions = h("div", { class: "dv-actions", hidden: true });

  // Частотные слова по порядку: проверка знаний, из которой слова попадают в словарь (js/views/replenish.js)
  const replenish = h("button", { class: "rp-entry", onClick: () => (location.hash = "#/replenish") }, icon("list", 22), h("span", { class: "rp-entry-t" }, h("b", null, "Топ слов по частотности"), h("small", null, "Проверка частотных слов: верные добавятся как знакомые")), icon("next", 18));

  // Разговорные фразы: то же, что «Топ слов по частотности», но колода из готовых фраз для живой речи (js/views/phrases.js)
  const phrasesEntry = h("button", { class: "rp-entry", onClick: () => (location.hash = "#/phrases") }, icon("speaker", 22), h("span", { class: "rp-entry-t" }, h("b", null, "Разговорные фразы"), h("small", null, "Выражения для живой речи: how's it going, fair enough, I'm into")), icon("next", 18));

  const page = h("div", { class: "page" }, h("header", { class: "top" }, h("div", null, h("h1", { class: "title" }, "Словарь"), sub), h("div", { class: "top-actions" }, h("button", { class: "iconbtn", "aria-label": "Добавить слово", onClick: () => openAddWord() }, icon("plus", 24)), h("button", { class: "iconbtn", "aria-label": "Настройки словаря", onClick: () => openDictSettings() }, icon("sliders", 22)))), replenish, phrasesEntry, controls, list);
  root.replaceChildren(h("main", { class: "view" }, page), actions);

  /** Карточки в нужном порядке с учётом поиска, типа, уровня и источника. */
  const shown = () => sortCards(filterCards([...app.cards.values()], { ...view, query }), view.sort);

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
            "aria-pressed": String(view.kind === key),
            onClick: () => {
              view.kind = key;
              refresh();
            },
          },
          label,
          h("span", { class: "n" }, c[key]),
        ),
      ),
    );
  }

  /** Строка под поиском: «Порядок и фильтры» и «Выбрать»; в режиме выбора — сколько выбрано и «Все», «Готово». */
  function paintBar() {
    if (picking) {
      const all = shown();
      bar.replaceChildren(
        ...[
          h("b", { class: "dv-count", role: "status" }, picked.size ? `Выбрано: ${picked.size}` : "Выберите слова"),
          h("span", { class: "dv-gap" }),
          picked.size < all.length && h("button", { class: "linkbtn", onClick: () => (all.forEach((c) => picked.add(c.id)), refresh()) }, `Все ${all.length}`),
          picked.size > 0 && h("button", { class: "linkbtn", onClick: () => (picked.clear(), refresh()) }, "Снять"),
          h("button", { class: "linkbtn", onClick: () => stopPicking() }, "Готово"),
        ].filter(Boolean),
      );
      return;
    }
    const n = activeCount(view);
    bar.replaceChildren(
      h("button", { class: "dv-opt", "aria-pressed": String(n > 0), onClick: openOptions }, icon("sliders", 18), h("span", null, n ? describe(view) : "Порядок и фильтры")),
      h("span", { class: "dv-gap" }),
      h("button", { class: "linkbtn", onClick: () => startPicking() }, "Выбрать"),
    );
  }

  function startPicking() {
    picking = true;
    document.body.classList.add("picking");
    refresh();
  }
  function stopPicking() {
    picking = false;
    picked.clear();
    document.body.classList.remove("picking");
    refresh();
  }

  /** Нижняя панель режима выбора: что можно сделать с выбранными. */
  function paintActions() {
    actions.hidden = !picking;
    if (!picking) return;
    const sel = [...picked].map((id) => app.cards.get(id)).filter(Boolean);
    const off = !sel.length;
    const allOff = sel.length > 0 && sel.every((c) => c.skip); // «Вернуть» только когда скрыты все выбранные; иначе «Не повторять» (скрытым оно ничего не меняет)
    const btn = (label, run, cls = "") => h("button", { class: `btn quiet ${cls}`.trim(), disabled: off, onClick: run }, label);
    actions.replaceChildren(
      allOff ? btn("Вернуть", () => bulk(sel, { skip: false }, (n) => `Снова в повторении: ${wordsOf(n)}`)) : btn("Не повторять", () => bulk(sel.filter((c) => !c.skip), { skip: true }, (n) => `Не будут повторяться: ${wordsOf(n)}`)),
      btn("Заново", () => confirmSheet({ title: `Начать заново ${wordsOf(sel.length)}?`, text: "Слова снова станут новыми: уровень сбросится, и они начнут повторяться с первого шага. Переводы и предложения останутся.", action: "Начать заново", run: () => bulk(sel, () => ({ srs: newSrs() }), (n) => `Снова новые: ${wordsOf(n)}`) })),
      btn("Удалить", () => confirmSheet({ title: `Удалить ${wordsOf(sel.length)}?`, text: "Карточки уйдут из словаря вместе с уровнями. Слова из книг можно будет добавить снова.", action: "Удалить", danger: true, run: () => removeSel(sel) }), "danger"),
    );
  }

  async function bulk(cards, patch, message) {
    const n = await patchCards(
      cards.map((c) => c.id),
      patch,
    );
    toast(message(n));
    stopPicking();
  }

  async function removeSel(cards) {
    const n = await removeCards(cards.map((c) => c.id));
    toast(`Удалено: ${wordsOf(n)}`);
    stopPicking();
  }

  /** Лист с вопросом и двумя кнопками: нажатие мимо или «Отмена» ничего не меняет. */
  function confirmSheet({ title, text, action, danger = false, run }) {
    const sheet = openSheet({
      label: title,
      cls: "dv-confirm",
      content: h(
        "div",
        null,
        h("h2", { class: "set-title" }, title),
        h("p", { class: "note" }, text),
        h(
          "div",
          { class: "dv-confirm-act" },
          h("button", { class: `btn ${danger ? "danger" : "primary"} grow`, onClick: () => (sheet.close(), run()) }, action),
          h("button", { class: "btn quiet", onClick: () => sheet.close() }, "Отмена"),
        ),
      ),
    });
  }

  /** Лист «Порядок и фильтры»: выбор применяется сразу, список за листом обновляется. */
  function openOptions() {
    const body = h("div", { class: "dv-opts" });
    const levelCount = new Map();
    app.cards.forEach((c) => levelCount.set(levelKey(c), (levelCount.get(levelKey(c)) || 0) + 1));
    const group = (title, items, key, withCount) =>
      h(
        "div",
        null,
        h("p", { class: "sheet-sub" }, title),
        h(
          "div",
          { class: "chips wrap", role: "group", "aria-label": title },
          items.map(([k, label]) =>
            h(
              "button",
              {
                class: "chip",
                "aria-pressed": String(view[key] === k),
                onClick: () => {
                  view[key] = k;
                  refresh();
                  paint();
                },
              },
              label,
              withCount && k !== "all" ? h("span", { class: "n" }, levelCount.get(k) || 0) : null,
            ),
          ),
        ),
      );
    const paint = () =>
      body.replaceChildren(
        h("h2", { class: "set-title" }, "Порядок и фильтры"),
        group("Порядок", SORTS, "sort"),
        group("Уровень", LEVELS, "level", true),
        group("Источник", SOURCES, "source"),
        h(
          "div",
          { class: "dv-confirm-act" },
          h("button", { class: "btn primary grow", onClick: () => sheet.close() }, `Показать: ${shown().length}`),
          activeCount(view) > 0 && h("button", { class: "btn quiet", onClick: () => (Object.assign(view, { sort: DEFAULTS.sort, level: DEFAULTS.level, source: DEFAULTS.source }), refresh(), paint()) }, "Сбросить"),
        ),
      );
    paint();
    const sheet = openSheet({ content: body, label: "Порядок и фильтры", cls: "dv-sheet" });
  }

  function paintList() {
    const n = app.cards.size;
    controls.hidden = !n;
    if (!n) {
      sub.textContent = "";
      list.replaceChildren(
        h(
          "section",
          { class: "empty" },
          h("p", { class: "lead" }, "Словарь пока пуст"),
          h("p", null, "Нажимайте на незнакомые слова в книге и добавляйте их сюда. Каждое слово сохранится вместе с предложением, в котором вы его встретили. Слово из фильма или разговора можно найти по-английски или по-русски и добавить кнопкой «+»."),
          h("div", { class: "empty-actions" }, h("button", { class: "btn primary", onClick: () => (location.hash = "#/library") }, "Открыть книгу"), h("button", { class: "btn", onClick: () => openAddWord() }, icon("plus", 20), "Добавить слово")),
        ),
      );
      return;
    }
    const now = Date.now();
    const items = shown();
    sub.textContent = items.length === n ? `${n} ${plural(n, ["карточка", "карточки", "карточек"])}` : `Показано ${items.length} из ${n}`;
    if (!items.length) {
      const narrowed = activeCount(view) > 0 || view.kind !== "all" || query;
      list.replaceChildren(
        h("p", { class: "note" }, "Ничего не найдено."),
        narrowed && h("button", { class: "linkbtn", onClick: () => (Object.assign(view, DEFAULTS), (input.value = ""), (query = ""), refresh()) }, "Сбросить поиск и фильтры"),
      );
      return;
    }
    list.replaceChildren(
      h(
        "ul",
        { class: "rows" },
        items.map((c) => {
          const st = stateOf(c, now);
          const on = picked.has(c.id);
          return h(
            "li",
            null,
            h(
              "button",
              {
                class: `row ${kindClass(c.t)}${picking ? " picking" : ""}${on ? " picked" : ""}`,
                ...(picking ? { "aria-pressed": String(on) } : {}),
                onClick: () => (picking ? toggle(c.id) : openSlip({ entry: c, surface: c.w, onChange: () => {} })),
              },
              picking ? h("span", { class: "row-check", "aria-hidden": "true" }, on ? icon("check", 16) : null) : h("span", { class: "row-mark" }),
              h("div", { class: "row-main" }, h("div", { class: "row-hw" }, c.w), h("div", { class: "row-ru" }, c.ru || c.rm || c.en)),
              h("span", { class: `row-due${st.hot ? " now" : ""}` }, st.bar || st.text),
            ),
          );
        }),
      ),
    );
  }

  function toggle(id) {
    if (!picked.delete(id)) picked.add(id);
    refresh();
  }

  function refresh() {
    for (const id of picked) if (!app.cards.has(id)) picked.delete(id); // слово убрали, пока шло выбор
    if (picking && !app.cards.size) return stopPicking();
    paintChips();
    paintBar();
    paintList();
    paintActions();
  }
  refresh();
  const off = subscribe(refresh);
  return () => {
    off();
    document.body.classList.remove("picking");
    closeSheet();
  };
}
