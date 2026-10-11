// slip.js — карточка слова («листок картотеки»): перевод, определение, цитата из книги, пример.
import { h, icon, openSheet, toast } from "../dom.js";
import { cardFor, saveCard, removeCard, posLabel, kindClass } from "../store.js";
import { speak, canSpeak } from "../tts.js";

/**
 * opts:
 *   entry    — запись словаря/карточка или null (слова нет в словаре)
 *   surface  — как слово выглядит в тексте
 *   ctx      — { s, a, b, book, bookId, ch } предложение из книги
 *   alt      — { label, run } вторая возможность: «Только слово: after»
 *   onChange — вызывается после добавления/удаления
 *   onClose
 */
export function openSlip(opts) {
  let o = opts;
  const sheet = openSheet({
    content: build(),
    cls: `slip ${cat(o)}`,
    label: "Карточка слова",
    modeless: !!o.modeless,
    onClose: () => o.onClose?.(),
  });

  function cat(x) {
    return x.entry ? kindClass(x.entry.t) : "k-x";
  }

  function refresh() {
    sheet.el.className = `sheet slip open ${cat(o)}`;
    sheet.setContent(build());
    sheet.body.scrollTop = 0;
  }

  function quote(ctx) {
    if (!ctx) return null;
    const { s, a, b } = ctx;
    return [
      h("blockquote", { class: "cite" }, s.slice(0, a), h("mark", null, s.slice(a, b)), s.slice(b)),
      h("p", { class: "src" }, [ctx.book, ctx.ch].filter(Boolean).join(", ")),
    ];
  }

  function build() {
    const { entry, surface, ctx, alt } = o;
    const saved = cardFor(entry);
    if (!entry) return unknown();

    const shown = (surface || "").toLowerCase();
    const differs = shown && shown !== entry.w;
    const root = h(
      "div",
      null,
      h(
        "div",
        { class: "slip-head" },
        h("div", null, h("h2", { class: "hw" }, entry.w), h("p", { class: "meta" }, posLabel(entry)), differs && h("p", { class: "meta via" }, `в тексте: ${shown}`)),
        canSpeak() && h("button", { class: "iconbtn speak", "aria-label": "Произнести", onClick: () => speak(entry.w) }, icon("speaker", 24)),
      ),
      entry.ru && h("p", { class: "ru" }, entry.ru),
      entry.en && h("p", { class: "def" }, entry.en),
      !entry.ru && h("p", { class: "note" }, "Перевода на русский пока нет, только определение."),
      entry.of?.length && h("p", { class: "meta via" }, `Может быть и формой слова: ${entry.of.join(", ")}`),
      quote(ctx || saved?.ctx?.[0]),
      entry.ex && h("p", { class: "exl" }, h("small", null, "Пример"), entry.ex),
    );

    const actions = h("div", { class: "slip-actions" });
    if (saved) {
      actions.append(h("button", { class: "btn quiet grow", disabled: true }, icon("check", 20), "В словаре"));
      root.append(actions);
      root.append(
        h(
          "button",
          {
            class: "linkbtn",
            onClick: async () => {
              await removeCard(entry.id);
              toast("Убрано из словаря");
              o.onChange?.();
              sheet.close();
            },
          },
          "Убрать из словаря",
        ),
      );
    } else {
      actions.append(
        h(
          "button",
          {
            class: "btn primary grow",
            onClick: async () => {
              await saveCard(entry, ctx);
              toast("Добавлено в словарь");
              o.onChange?.();
              refresh();
            },
          },
          icon("plus", 20),
          "В словарь",
        ),
      );
      root.append(actions);
    }
    if (alt) root.append(h("div", null, h("button", { class: "linkbtn", onClick: alt.run }, alt.label)));
    return root;
  }

  function unknown() {
    const { surface, ctx, alt } = o;
    const bare = (surface || "").replace(/['’]s$/, "");
    const word = o.proper ? bare : bare.toLowerCase(); // у имён сохраняем заглавную букву
    const input = h("input", { class: "field", type: "text", placeholder: "Перевод", autocomplete: "off", autocapitalize: "off", "aria-label": "Перевод слова" });
    const add = h("button", { class: "btn primary grow", disabled: true, onClick: save }, icon("plus", 20), "В словарь");
    input.addEventListener("input", () => (add.disabled = !input.value.trim()));
    input.addEventListener("keydown", (e) => e.key === "Enter" && input.value.trim() && save());
    async function save() {
      const entry = { id: `w:${word.toLowerCase()}`, t: "w", w: word, pos: "", ru: input.value.trim(), en: "", ex: "", custom: true };
      await saveCard(entry, ctx);
      toast("Добавлено в словарь");
      o.onChange?.();
      o.entry = entry;
      refresh();
    }
    const root = h(
      "div",
      null,
      h("div", { class: "slip-head" }, h("div", null, h("h2", { class: "hw" }, word), h("p", { class: "meta" }, o.proper ? "имя или название" : "нет в словаре")), canSpeak() && h("button", { class: "iconbtn speak", "aria-label": "Произнести", onClick: () => speak(word) }, icon("speaker", 24))),
      h("p", { class: "note" }, o.proper ? "Похоже на имя или название: перевод обычно не нужен. Если хотите, впишите свой, и он сохранится вместе с предложением из книги." : "Для этого слова пока нет готового перевода. Впишите свой: он сохранится в вашем словаре вместе с предложением из книги."),
      quote(ctx),
      h("div", { style: { marginTop: "16px" } }, input),
      h("div", { class: "slip-actions" }, add),
    );
    if (alt) root.append(h("div", null, h("button", { class: "linkbtn", onClick: alt.run }, alt.label)));
    return root;
  }

  return {
    sheet,
    close: () => sheet.close(),
    update(next) {
      o = next;
      refresh();
    },
  };
}
