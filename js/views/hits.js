// hits.js — строка слова в списках «Добавить слово» и «Слова этой книги»: слово, перевод, кнопка «+» и подробности по нажатию.
import { h, icon } from "../dom.js";
import { kindClass, posLabel } from "../store.js";

/** Определение, пример и формы слова (раскрываются по нажатию на строку). */
function details(e) {
  return h(
    "div",
    { class: "hit-more" },
    e.en && h("p", { class: "def" }, e.en),
    e.ex && h("p", { class: "exl" }, h("small", null, "Пример"), e.ex),
    e.f?.length > 0 && h("p", { class: "meta via" }, `Формы: ${e.f.join(", ")}`),
    !e.ru && e.rm && h("p", { class: "auto-note" }, "Перевод получен автоматически из определения, возможны неточности."),
    !e.en && !e.ex && !e.f?.length && h("p", { class: "auto-note" }, "Других сведений об этом слове нет."),
  );
}

/**
 * Строка списка. entry — запись словаря; note — пояснение под переводом («went — форма слова go»).
 * saved — слово уже в словаре (кнопка превращается в галочку); open — раскрыты подробности;
 * onToggle — нажатие на слово; onAdd — нажатие на «+»; aside — кнопки между словом и «+» (например, «Знаю»).
 */
export function hitRow({ entry: e, note = "" }, { saved = false, open = false, onToggle, onAdd, aside = [] }) {
  const pos = posLabel(e);
  const main = h(
    "button",
    { class: "hit-main", "aria-expanded": String(open), onClick: onToggle },
    h("span", { class: "row-mark" }),
    h("div", { class: "row-main" }, h("div", { class: "row-hw" }, e.w, pos && h("span", { class: "hit-pos" }, pos)), h("div", { class: `row-ru${e.ru ? "" : " auto"}` }, e.ru || e.rm || "перевода пока нет"), note && h("div", { class: "hit-via" }, note)),
  );
  const add = h(
    "button",
    {
      class: `addbtn${saved ? " saved" : ""}`,
      "aria-label": saved ? `«${e.w}» уже в словаре` : `Добавить «${e.w}» в словарь`,
      disabled: saved,
      onClick: onAdd,
    },
    icon(saved ? "check" : "plus", 22),
  );
  return h("li", { class: `hit ${kindClass(e.t)}${saved ? " in" : ""}${open ? " open" : ""}` }, h("div", { class: "hit-line" }, main, ...aside, add), open && details(e));
}
