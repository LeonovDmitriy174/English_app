// notes.js — заметки и закладки: вкладка со списком и лист с одной заметкой.
// Лист используется и в читалке (коснулись флажка или поля у абзаца), и во вкладке (открыли заметку из списка).
import { h, icon, openSheet, closeSheet, toast } from "../dom.js";
import { app, subscribe, setNoteText, removeNote, jumpToNote } from "../store.js";
import { groupByBook } from "../notes.js";

const plural = (n, f) => {
  const a = n % 10;
  const b = n % 100;
  return f[b > 10 && b < 20 ? 2 : a === 1 ? 0 : a >= 2 && a <= 4 ? 1 : 2];
};

/**
 * Лист с заметкой: цитата из книги и поле для комментария. Пустой комментарий — закладка.
 * fromList: открыт из списка, значит, нужна кнопка «Перейти к месту в книге» и название книги.
 * Изменения сохраняются при закрытии листа.
 */
export function openNoteSheet(note, { fromList = false, onClose } = {}) {
  let gone = false;
  const book = app.books.find((b) => b.id === note.book);
  const area = h("textarea", {
    class: "field note-text",
    rows: 4,
    placeholder: "Комментарий. Можно оставить пустым: тогда это просто закладка.",
    "aria-label": "Комментарий к заметке",
    enterkeyhint: "enter",
  }, note.text);
  const grow = () => {
    area.style.height = "auto";
    area.style.height = `${Math.min(area.scrollHeight + 2, window.innerHeight * 0.4)}px`;
  };
  area.addEventListener("input", grow);

  const where = [fromList ? note.bookTitle || book?.title : null, note.chTitle].filter(Boolean).join(", ");
  const actions = h("div", { class: "slip-actions" });
  const root = h(
    "div",
    null,
    h("h2", { class: "set-title" }, "Заметка"),
    where && h("p", { class: "src", style: { marginTop: "0" } }, where),
    note.quote && h("blockquote", { class: "cite quoted" }, note.quote),
    h("div", { style: { marginTop: "16px" } }, area),
    actions,
  );

  const sheet = openSheet({
    label: "Заметка",
    cls: "noted",
    content: root,
    onClose: () => {
      if (!gone) setNoteText(note.id, area.value);
      onClose?.();
    },
  });

  if (fromList) {
    if (book) {
      actions.append(
        h(
          "button",
          {
            class: "btn primary grow",
            onClick: async () => {
              await setNoteText(note.id, area.value);
              jumpToNote(note);
            },
          },
          "К месту в книге",
          icon("next", 20),
        ),
      );
    } else {
      actions.append(h("button", { class: "btn quiet grow", disabled: true }, "Книги нет в библиотеке"));
      root.append(h("p", { class: "note" }, "Добавьте эту книгу снова, и заметка откроется на своём месте."));
    }
    actions.append(h("button", { class: "btn quiet", onClick: () => sheet.close() }, "Готово"));
  } else {
    actions.append(h("button", { class: "btn primary grow", onClick: () => sheet.close() }, "Готово"));
  }

  // Удаление в два шага, чтобы не потерять длинный комментарий одним касанием
  let armed = 0;
  const del = h(
    "button",
    {
      class: "linkbtn danger-link",
      onClick: async () => {
        if (!armed) {
          del.textContent = "Нажмите ещё раз, чтобы удалить";
          armed = setTimeout(() => {
            armed = 0;
            del.textContent = "Удалить заметку";
          }, 3500);
          return;
        }
        clearTimeout(armed);
        gone = true;
        await removeNote(note.id);
        sheet.close();
        toast("Заметка удалена");
      },
    },
    "Удалить заметку",
  );
  root.append(h("div", { style: { marginTop: "6px" } }, del));

  requestAnimationFrame(grow);
  if (!note.text && window.matchMedia?.("(pointer: fine)").matches) setTimeout(() => area.focus(), 320);
  return sheet;
}

export function renderNotes(root) {
  const sub = h("p", { class: "sub" });
  const list = h("div");
  root.replaceChildren(h("main", { class: "view" }, h("div", { class: "page" }, h("header", { class: "top" }, h("div", null, h("h1", { class: "title" }, "Заметки"), sub)), list)));

  function row(n) {
    return h(
      "li",
      null,
      h(
        "button",
        { class: `row note-row${n.text ? " has-text" : ""}`, onClick: () => openNoteSheet(n, { fromList: true }) },
        h("span", { class: "nr-flag", "aria-hidden": "true" }, icon("flag", 18)),
        h(
          "div",
          { class: "row-main" },
          n.chTitle && h("div", { class: "nr-where" }, n.chTitle),
          n.text && h("div", { class: "nr-text" }, n.text),
          n.quote && h("div", { class: "nr-quote" }, n.quote),
        ),
      ),
    );
  }

  function paint() {
    const total = app.notes.length;
    sub.textContent = total ? `${total} ${plural(total, ["заметка", "заметки", "заметок"])}` : "";
    if (!total) {
      list.replaceChildren(
        h(
          "section",
          { class: "empty" },
          h("p", { class: "lead" }, "Заметок пока нет"),
          h("p", null, "Нажмите на флажок в верхней панели книги или коснитесь поля справа от абзаца, чтобы оставить закладку или комментарий. Все заметки соберутся здесь, и с любой из них можно вернуться к месту в книге."),
          app.books.length && h("button", { class: "btn primary", onClick: () => (location.hash = "#/library") }, "К книгам"),
        ),
      );
      return;
    }
    list.replaceChildren(
      ...groupByBook(app.notes, app.books).map((g) =>
        h("section", { class: "nb-group" }, h("h2", { class: "nb-title" }, g.title, !g.present && h("span", { class: "nb-gone" }, "книги нет в библиотеке")), h("ul", { class: "rows" }, g.notes.map(row))),
      ),
    );
  }

  paint();
  const off = subscribe(paint);
  return () => {
    off();
    closeSheet();
  };
}
