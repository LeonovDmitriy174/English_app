// slip.js — карточка слова («листок картотеки»): перевод, определение, цитата из книги, пример.
import { h, icon, openSheet, toast } from "../dom.js";
import { app, cardFor, saveCard, removeCard, setTranslation, setMnemonic, setSkip, setChar, posLabel, kindClass } from "../store.js";
import { MAX_TEXT } from "../characters.js";
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
 *   proper   — слово похоже на имя или название; charKey — ключ заметки о нём; term — { key, name, text, own } заметка о персонаже или термин
 *   compact  — короткая карточка (читалка): слово, перевод и «+» одной строкой; полная открывается кнопкой «Подробнее» или свайпом вверх
 */
export function openSlip(opts) {
  let o = opts;
  let editing = null; // что сейчас правится у слова из словаря: "ru" (перевод) или "mnemonic" (ассоциация)
  let asWord = false; // у имени: открыта форма «добавить в словарь как слово» вместо заметки о персонаже
  let expanded = false; // у короткой карточки: открыты ли подробности (остаётся открытым, пока вы нажимаете на другие слова)
  const isCompact = () => !!o.compact && !expanded;
  const klass = () => `${cat(o)}${isCompact() ? " compact" : ""}`;
  const sheet = openSheet({
    content: build(),
    cls: `slip ${klass()}`,
    label: "Карточка слова",
    modeless: !!o.modeless,
    onClose: () => o.onClose?.(),
    onSwipeUp: o.compact ? () => expand() : undefined,
  });

  /** Короткая карточка → полная. */
  function expand() {
    if (!isCompact()) return;
    expanded = true;
    refresh();
  }

  function cat(x) {
    return x.entry ? kindClass(x.entry.t) : "k-x";
  }

  function refresh() {
    editing = null;
    sheet.el.className = `sheet slip open ${klass()}`;
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

  // ── короткая карточка ───────────────────────────────────────────────────
  function speaker(word) {
    return canSpeak() && h("button", { class: "iconbtn speak", "aria-label": "Произнести", onClick: () => speak(word) }, icon("speaker", 24));
  }

  /** Свайп вверх по короткой карточке раскрывает её (у ручки то же самое делает сам лист). */
  function swipeUpToExpand(node) {
    let y0 = null;
    node.addEventListener("touchstart", (e) => (y0 = e.touches[0].clientY), { passive: true });
    node.addEventListener("touchend", (e) => {
      if (y0 != null && y0 - e.changedTouches[0].clientY > 36) expand();
      y0 = null;
    });
    return node;
  }

  function compactEntry() {
    const { entry, surface, ctx, alt } = o;
    const saved = cardFor(entry);
    const shown = (surface || "").toLowerCase();
    const differs = shown && shown !== entry.w;
    const tr = saved?.edited ? { ru: saved.ru, rm: "" } : entry;
    const add = saved
      ? h("span", { class: "cs-state", role: "img", "aria-label": "В словаре" }, icon("check", 22))
      : h(
          "button",
          {
            class: "cs-add",
            "aria-label": "Добавить в словарь",
            onClick: async () => {
              await saveCard(entry, ctx);
              toast("Добавлено в словарь");
              o.onChange?.();
              refresh();
            },
          },
          icon("plus", 24),
        );
    return swipeUpToExpand(
      h(
        "div",
        { class: "cs" },
        h(
          "div",
          { class: "cs-row" },
          h(
            "div",
            { class: "cs-main" },
            h("div", { class: "cs-top" }, h("h2", { class: "hw sm" }, entry.w), h("span", { class: "meta" }, posLabel(entry))),
            tr.ru ? h("p", { class: "ru sm" }, tr.ru) : tr.rm ? h("p", { class: "ru auto sm" }, tr.rm) : entry.en ? h("p", { class: "def sm" }, entry.en) : h("p", { class: "note tight" }, "Перевода пока нет."),
            differs && h("p", { class: "meta via" }, `в тексте: ${shown}`),
          ),
          h("div", { class: "cs-act" }, speaker(entry.w), add),
        ),
        h("div", { class: "cs-links" }, h("button", { class: "linkbtn", onClick: expand }, "Подробнее"), alt && h("button", { class: "linkbtn", onClick: alt.run }, alt.label)),
      ),
    );
  }

  function compactUnknown() {
    const { surface, ctx, alt } = o;
    const bare = (surface || "").replace(/['’]s$/, "");
    const word = o.proper ? bare : bare.toLowerCase();
    if (o.proper) {
      return swipeUpToExpand(
        h(
          "div",
          { class: "cs" },
          h("div", { class: "cs-row" }, h("div", { class: "cs-main" }, h("div", { class: "cs-top" }, h("h2", { class: "hw sm" }, word), h("span", { class: "meta" }, "имя или название"))), h("div", { class: "cs-act" }, speaker(word))),
          h("div", { class: "cs-links" }, h("button", { class: "linkbtn", onClick: expand }, "Подробнее"), alt && h("button", { class: "linkbtn", onClick: alt.run }, alt.label)),
        ),
      );
    }
    const input = h("input", { class: "field cs-field", type: "text", placeholder: "Свой перевод", autocomplete: "off", autocapitalize: "off", "aria-label": "Перевод слова", enterkeyhint: "done" });
    const add = h("button", { class: "cs-add", "aria-label": "Добавить в словарь", disabled: true, onClick: save }, icon("plus", 24));
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
    return swipeUpToExpand(
      h(
        "div",
        { class: "cs" },
        h("div", { class: "cs-row" }, h("div", { class: "cs-main" }, h("div", { class: "cs-top" }, h("h2", { class: "hw sm" }, word), h("span", { class: "meta" }, "нет в словаре"))), h("div", { class: "cs-act" }, speaker(word))),
        h("div", { class: "cs-row cs-form" }, input, add),
        h("div", { class: "cs-links" }, h("button", { class: "linkbtn", onClick: expand }, "Подробнее"), alt && h("button", { class: "linkbtn", onClick: alt.run }, alt.label)),
      ),
    );
  }

  // ── имена и термины: заметка о персонаже ───────────────────────────────
  function charName() {
    return o.term?.name || (o.surface || "").replace(/['’]s$/, "");
  }

  /** Открывает полную карточку сразу с полем заметки (из короткой карточки: «Добавить заметку»). */
  function openCharEditor() {
    expanded = true;
    editing = "char";
    sheet.el.className = `sheet slip open ${klass()}`;
    sheet.setContent(build());
    sheet.body.scrollTop = 0;
  }

  async function saveChar(text) {
    const next = String(text || "").trim();
    const key = await setChar(o.charKey, { name: charName(), text: next });
    if (!key) {
      toast("Не удалось сохранить заметку");
      return;
    }
    if (next) {
      o.term = { key, name: charName(), text: next.replace(/\s+/g, " ").slice(0, MAX_TEXT), own: true };
      toast("Заметка сохранена");
    } else {
      o.term = null;
      toast("Заметка удалена");
    }
    o.onChange?.(); // читалка заново ищет места с заметками и подчёркивает их
    editing = null;
    refresh();
  }

  function charEditor() {
    const area = h("textarea", { class: "field note-text", rows: 3, maxlength: MAX_TEXT, placeholder: "Кто это или что это: одна-две фразы", "aria-label": `Заметка: ${charName()}`, enterkeyhint: "enter" }, o.term?.text || "");
    setTimeout(() => area.focus(), 60);
    return h(
      "div",
      null,
      area,
      h(
        "div",
        { class: "slip-actions" },
        h("button", { class: "btn primary grow", onClick: () => saveChar(area.value) }, "Сохранить"),
        h("button", { class: "btn quiet", onClick: () => ((editing = null), rebuild()) }, "Отмена"),
      ),
      o.term ? h("div", null, h("button", { class: "linkbtn danger-link", onClick: () => saveChar("") }, "Удалить заметку")) : null,
    );
  }

  function compactChar() {
    const { alt } = o;
    const name = charName();
    return swipeUpToExpand(
      h(
        "div",
        { class: "cs" },
        h(
          "div",
          { class: "cs-row" },
          h("div", { class: "cs-main" }, h("div", { class: "cs-top" }, h("h2", { class: "hw sm" }, name), h("span", { class: "meta" }, o.term ? "персонаж или название" : "имя или название")), o.term ? h("p", { class: "ru sm char-text" }, o.term.text) : null),
          h("div", { class: "cs-act" }, speaker(name)),
        ),
        h("div", { class: "cs-links" }, h("button", { class: "linkbtn", onClick: expand }, "Подробнее"), o.term ? null : h("button", { class: "linkbtn", onClick: openCharEditor }, "Добавить заметку"), alt && h("button", { class: "linkbtn", onClick: alt.run }, alt.label)),
      ),
    );
  }

  function charCard() {
    const { ctx, alt } = o;
    const name = charName();
    const root = h(
      "div",
      null,
      h("div", { class: "slip-head" }, h("div", null, h("h2", { class: "hw" }, name), h("p", { class: "meta" }, o.term ? "персонаж или название" : "имя или название")), canSpeak() && h("button", { class: "iconbtn speak", "aria-label": "Произнести", onClick: () => speak(name) }, icon("speaker", 24))),
      editing === "char" ? null : o.term ? h("p", { class: "ru char-text" }, o.term.text) : h("p", { class: "note" }, "Похоже на имя или название: перевод обычно не нужен. Запишите, кто это: заметка появится при нажатии на имя в любой книге."),
      editing === "char" ? charEditor() : null,
      quote(ctx),
      editing === "char"
        ? null
        : h("div", { class: "slip-actions" }, h("button", { class: "btn primary grow", onClick: () => ((editing = "char"), rebuild()) }, o.term ? "Править заметку" : "Добавить заметку")),
    );
    const more = [alt && h("button", { class: "linkbtn", onClick: alt.run }, alt.label), !o.term && editing !== "char" && h("button", { class: "linkbtn", onClick: () => ((asWord = true), refresh()) }, "Добавить в словарь как слово")].filter(Boolean);
    if (more.length) root.append(h("div", null, ...more));
    noteLink(root);
    return root;
  }

  function build() {
    if (!o.entry && (o.proper || o.term) && !asWord) return isCompact() ? compactChar() : charCard();
    if (isCompact()) return o.entry ? compactEntry() : compactUnknown();
    const { entry, surface, ctx, alt } = o;
    const saved = cardFor(entry);
    if (!entry) return unknown();

    const shown = (surface || "").toLowerCase();
    const differs = shown && shown !== entry.w;
    const via = entry.of?.length ? app.glossary.formOf(entry) : []; // только подтверждённые правилами: his «hi» и run «rin» подсказкой не бывают
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
      via.length > 0 && h("p", { class: "meta via" }, `Может быть и формой слова: ${via.join(", ")}`),
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
      asWord = false;
      refresh();
    },
  };
}
