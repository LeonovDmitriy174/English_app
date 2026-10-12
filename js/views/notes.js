// notes.js — заметки и закладки: вкладка со списком и лист с одной заметкой.
// Лист используется и в читалке (коснулись флажка или поля у абзаца), и во вкладке (открыли заметку из списка).
import { h, icon, openSheet, closeSheet, toast } from "../dom.js";
import { app, subscribe, setNoteText, removeNote, jumpToNote, folders } from "../store.js";
import { groupByBook, notesInFolder, noteCounts } from "../notes.js";
import { ALL, isUserGroup, folderRows, subtreeSet } from "../shelf.js";
import { pageHash, folderFromHash } from "../nav.js";
import { folderList, backLink, plural } from "./folders.js";

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

/**
 * Вкладка «Заметки» (адрес #/notes[/папка]). Папки здесь те же, что у книг: заметка лежит в папках своей книги,
 * поэтому раскладывать её отдельно не нужно. Показываются только папки, в которых есть заметки.
 * Пока ни в одной папке заметок нет, список папок не нужен: сразу все заметки по книгам.
 */
export function renderNotes(root, arg = "") {
  const folder = folderFromHash(arg); // "" — список папок (или все заметки, если папок с заметками нет), "all", иначе id папки
  const head = h("div");
  const list = h("div");
  root.replaceChildren(h("main", { class: "view" }, h("div", { class: "page" }, head, list)));
  const notesWord = (n) => `${n} ${plural(n, ["заметка", "заметки", "заметок"])}`;

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

  const byBook = (notes) =>
    groupByBook(notes, app.books).map((g) =>
      h("section", { class: "nb-group" }, h("h2", { class: "nb-title" }, g.title, !g.present && h("span", { class: "nb-gone" }, "книги нет в библиотеке")), h("ul", { class: "rows" }, g.notes.map(row))),
    );

  /** Шапка: на первом экране заголовок, внутри папки сверху «‹ Заметки» и под ней заголовок. */
  function paintHead(title, sub, back) {
    head.replaceChildren(
      ...[back && h("div", { class: "navrow" }, backLink(back.href, back.label)), h("header", { class: back ? "top lower" : "top" }, h("div", null, h("h1", { class: "title" }, title), sub ? h("p", { class: "sub" }, sub) : null))].filter(Boolean),
    );
  }
  const show = (...nodes) => list.replaceChildren(...nodes.flat().filter(Boolean));

  function paint() {
    const total = app.notes.length;
    const tree = folders();
    const node = folder && folder !== ALL ? tree.byId.get(folder) : null;
    if (folder && folder !== ALL && !node) {
      if (app.catalogLoaded || isUserGroup(folder)) {
        location.replace(pageHash("notes"));
        return;
      }
    }
    const counts = noteCounts(app.notes, app.books, tree);
    const rows = folderRows(tree, (id) => counts.get(id) || 0, { hideEmpty: true });
    const inFolders = rows.length > 0;

    if (!total) {
      paintHead("Заметки", "", folder ? { href: pageHash("notes"), label: "Заметки" } : null);
      show(
        h(
          "section",
          { class: "empty" },
          h("p", { class: "lead" }, "Заметок пока нет"),
          h("p", null, "Нажмите на флажок в верхней панели книги или коснитесь поля справа от абзаца, чтобы оставить закладку или комментарий. Все заметки соберутся здесь, и с любой из них можно вернуться к месту в книге."),
          app.books.length > 0 && h("button", { class: "btn primary", onClick: () => (location.hash = "#/library") }, "К книгам"),
        ),
      );
      return;
    }

    // Список папок: только если есть папки с заметками
    if (!folder && inFolders) {
      paintHead("Заметки", notesWord(total));
      show(folderList({ all: { label: "Все заметки", count: total, href: pageHash("notes", ALL) }, rows, hrefOf: (id) => pageHash("notes", id), onToggle: paint }));
      return;
    }
    if (!folder || folder === ALL) {
      paintHead(folder ? "Все заметки" : "Заметки", notesWord(total), folder && inFolders ? { href: pageHash("notes"), label: "Заметки" } : null);
      show(byBook(app.notes));
      return;
    }
    if (!node) {
      paintHead("Заметки", "", { href: pageHash("notes"), label: "Заметки" });
      show(h("p", { class: "note" }, "Загружаю список папок…"));
      return;
    }
    // Одна папка: вложенные папки с заметками, ниже заметки по книгам
    const here = notesInFolder(app.notes, app.books, subtreeSet(tree, node.id));
    const parent = node.parent ? tree.byId.get(node.parent) : null;
    const kids = rows.flatMap((r) => [r, ...r.children]).find((r) => r.id === node.id)?.children || [];
    paintHead(node.name, here.length ? notesWord(here.length) : "", parent ? { href: pageHash("notes", parent.id), label: parent.name } : { href: pageHash("notes"), label: "Заметки" });
    show(
      kids.length > 0 && folderList({ rows: kids, hrefOf: (id) => pageHash("notes", id) }),
      kids.length > 0 && here.length > 0 && h("h2", { class: "f-head" }, "Заметки"),
      here.length ? byBook(here) : h("p", { class: "note" }, "В этой папке заметок нет. Заметка лежит в тех же папках, что и её книга."),
    );
  }

  paint();
  const off = subscribe(paint);
  return () => {
    off();
    closeSheet();
  };
}
