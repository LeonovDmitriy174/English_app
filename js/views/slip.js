// slip.js — карточка слова («листок картотеки»): перевод, определение, цитата из книги, пример.
import { h, icon, openSheet, toast } from "../dom.js";
import { cardFor, saveCard, removeCard, setTranslation, setMnemonic, setSkip, posLabel, kindClass } from "../store.js";
import { speak, canSpeak } from "../tts.js";

/**
 * opts:
 *   entry    — запись словаря/карточка или null (слова нет в словаре)
 *   surface  — как слово выглядит в тексте
 *   ctx      — { s, a, b, book, bookId, ch } предложение из книги
 *   alt      — { label, run } вторая возможность: «Только слово: after»
 *   note     — { label, run } ссылка на заметку к этому месту книги (только в читалке)
 *   onChange — вызывается после добавления/удаления
 *   onClose
 */
export function openSlip(opts) {
  let o = opts;
  let editing = null; // что сейчас правится у слова из словаря: "ru" (перевод) или "mnemonic" (ассоциация)
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
    editing = null;
    sheet.el.className = `sheet slip open ${cat(o)}`;
    sheet.setContent(build());
    sheet.body.scrollTop = 0;
  }

  /** Перерисовать, не прокручивая лист вверх (при правке перевода и ассоциации). */
  function rebuild() {
    sheet.setContent(build());
  }

  /** Строка ввода с кнопками «Сохранить» и «Отмена». */
  function editor({ value, placeholder, label, onSave }) {
    const input = h("input", { class: "field", type: "text", value, placeholder, autocomplete: "off", "aria-label": label, enterkeyhint: "done" });
    const save = () => onSave(input.value);
    input.addEventListener("keydown", (e) => e.key === "Enter" && save());
    setTimeout(() => input.focus(), 60);
    return h(
      "div",
      { class: "edit" },
      input,
      h(
        "div",
        { class: "edit-actions" },
        h("button", { class: "btn primary", onClick: save }, "Сохранить"),
        h(
          "button",
          {
            class: "linkbtn",
            onClick: () => {
              editing = null;
              rebuild();
            },
          },
          "Отмена",
        ),
      ),
    );
  }

  /** Небольшие действия со словом из словаря: правка перевода, ассоциация, «Это имя». Уровни они не трогают. */
  function tools(saved) {
    const act = (text, run) => h("button", { class: "linkbtn", onClick: run }, text);
    return h(
      "div",
      { class: "slip-tools" },
      act("Править перевод", () => {
        editing = "ru";
        rebuild();
      }),
      act(saved.mnemonic ? "Изменить ассоциацию" : "Моя ассоциация", () => {
        editing = "mnemonic";
        rebuild();
      }),
      act(saved.skip ? "Вернуть в повторение" : "Это имя, не повторять", async () => {
        await setSkip(saved.id, !saved.skip);
        toast(saved.skip ? "Не будет повторяться" : "Снова в повторении");
        rebuild();
      }),
    );
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
    // свой перевод, если вы его правили, иначе словарный
    const tr = saved?.edited ? { ru: saved.ru, rm: "" } : entry;
    const root = h(
      "div",
      null,
      h(
        "div",
        { class: "slip-head" },
        h("div", null, h("h2", { class: "hw" }, entry.w), h("p", { class: "meta" }, posLabel(entry)), differs && h("p", { class: "meta via" }, `в тексте: ${shown}`)),
        canSpeak() && h("button", { class: "iconbtn speak", "aria-label": "Произнести", onClick: () => speak(entry.w) }, icon("speaker", 24)),
      ),
      saved && editing === "ru"
        ? editor({
            value: tr.ru || tr.rm || "",
            placeholder: "Перевод",
            label: "Перевод слова",
            onSave: async (text) => {
              if (await setTranslation(saved.id, text)) toast("Перевод сохранён");
              editing = null;
              rebuild();
            },
          })
        : [
            tr.ru && h("p", { class: "ru" }, tr.ru),
            !tr.ru && tr.rm && h("p", { class: "ru auto" }, tr.rm),
            !tr.ru && tr.rm && h("p", { class: "auto-note" }, "автоперевод определения, возможны неточности"),
          ],
      entry.en && h("p", { class: "def" }, entry.en),
      !tr.ru && !tr.rm && h("p", { class: "note" }, "Перевода на русский пока нет, только определение."),
      entry.of?.length > 0 && h("p", { class: "meta via" }, `Может быть и формой слова: ${entry.of.join(", ")}`),
      quote(ctx || saved?.ctx?.[0]),
      entry.ex && h("p", { class: "exl" }, h("small", null, "Пример"), entry.ex),
      saved && editing === "mnemonic"
        ? editor({
            value: saved.mnemonic || "",
            placeholder: "Образ или созвучие, которое поможет запомнить",
            label: "Моя ассоциация",
            onSave: async (text) => {
              await setMnemonic(saved.id, text);
              editing = null;
              rebuild();
            },
          })
        : saved?.mnemonic && h("p", { class: "mnemo" }, h("small", null, "Моя ассоциация"), saved.mnemonic),
      saved?.skip && h("p", { class: "note tight" }, "Не повторяется: слово остаётся в словаре, но в повторение не попадает."),
    );

    const actions = h("div", { class: "slip-actions" });
    if (saved) {
      actions.append(h("button", { class: "btn quiet grow", disabled: true }, icon("check", 20), "В словаре"));
      root.append(actions);
      root.append(tools(saved));
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
    noteLink(root);
    return root;
  }

  /** «Оставить заметку к этому месту» — под основными действиями. */
  function noteLink(root) {
    if (o.note) root.append(h("div", { style: { marginTop: "6px" } }, h("button", { class: "linkbtn", onClick: o.note.run }, icon("flag", 15), o.note.label)));
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
    noteLink(root);
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
