// folders.js — общие части экранов с папками («Книги» и «Заметки»): список папок как в «Заметках» на iPhone,
// строка возврата и склонение числительных.
import { h, icon } from "../dom.js";

export const plural = (n, f) => {
  const a = n % 10;
  const b = n % 100;
  return f[b > 10 && b < 20 ? 2 : a === 1 ? 0 : a >= 2 && a <= 4 ? 1 : 2];
};

/** Какие папки свёрнуты. Одно на книги и заметки: папки у них общие, пусть и выглядят одинаково. */
export const collapsed = new Set();

/** Есть ли в списке папки с вложенными (тогда слева оставляется место под значок свёртки). */
export const hasGutter = (rows) => rows.some((r) => r.children.length > 0);

/**
 * Список папок. rows — shelf.folderRows (папка, число, вложенные), hrefOf(id) — адрес папки.
 * all — необязательная первая строка «Все …»: { label, count, href }.
 * Папки с вложенными можно свернуть значком слева; onToggle перерисовывает экран.
 */
export function folderList({ rows, hrefOf, all = null, onToggle }) {
  // Слева место под значок свёртки нужно, только если у какой-то папки есть вложенные: иначе значки встают к самому краю
  const gutter = hasGutter(rows);
  const link = (href, ico, name, count) =>
    h("a", { class: "f-link", href }, icon(ico, 22), h("span", { class: "f-name" }, name), h("span", { class: "f-n" }, count), icon("next", 18));

  const item = (r, nested) => {
    const open = !collapsed.has(r.id);
    const kids = !nested && r.children.length > 0;
    const toggle = kids
      ? h(
          "button",
          {
            class: "f-toggle",
            "aria-expanded": String(open),
            "aria-label": `${open ? "Свернуть" : "Развернуть"} «${r.name}»`,
            onClick: () => {
              if (open) collapsed.add(r.id);
              else collapsed.delete(r.id);
              onToggle?.();
            },
          },
          icon("next", 18),
        )
      : gutter && h("span", { class: "f-toggle", "aria-hidden": "true" });
    const li = h("li", null, h("div", { class: "f-row" }, nested ? null : toggle, link(hrefOf(r.id), "folder", r.name, r.count)));
    if (kids && open) li.append(h("ul", { class: "f-list nested" }, r.children.map((c) => item(c, true))));
    return li;
  };

  return h(
    "ul",
    { class: "f-list" },
    all && h("li", null, h("div", { class: "f-row" }, gutter && h("span", { class: "f-toggle", "aria-hidden": "true" }), link(all.href, "book", all.label, all.count))),
    rows.map((r) => item(r, false)),
  );
}

/** Строка возврата вверху экрана папки: «‹ Книги». */
export const backLink = (href, label) => h("a", { class: "backlink", href }, icon("back", 24), h("span", null, label));
