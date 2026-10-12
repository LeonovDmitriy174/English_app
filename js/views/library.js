// library.js — полка: папки как в «Заметках» на iPhone, общий поиск, встроенные книги из каталога, добавление EPUB.
//
// Экраны (адрес #/library[/папка]):
//   список папок   «Все книги» и папки со счётчиками; у папок с вложенными есть значок свёртки;
//   одна папка     вложенные папки сверху, ниже книги папки и всех её вложенных; «‹ Книги» возвращает назад;
//   все книги      то, что уже лежит на устройстве.
// Вложенность одна: внутри вложенной папки новую уже не создать (проверяет store).
import { h, icon, toast, openSheet, closeSheet } from "../dom.js";
import { app, subscribe, addBook, removeBook, ensureAnalysis, createGroup, renameGroup, moveGroup, deleteGroup, toggleBookGroup, addFromCatalog, refreshCatalog, catalogAsset, folders, resumeBook } from "../store.js";
import { ALL, MAX_GROUP_NAME, isUserGroup, shelfItems, fmtSize, folderCounts, folderRows, parentChoices, pathLabel } from "../shelf.js";
import { pageHash, folderFromHash } from "../nav.js";
import { folderList, backLink, plural, collapsed, hasGutter } from "./folders.js";
import { openAppSettings } from "./settings.js";
import { backupNudge } from "./backupui.js";
import { openBookWords } from "./bookwords.js";

const initialOf = (title) => (title || "?").trim()[0]?.toUpperCase();
const blankCover = (title) => h("div", { class: "cover blank-cover", "aria-hidden": "true" }, initialOf(title));

function cover(book) {
  if (book.cover) {
    const url = URL.createObjectURL(book.cover);
    const img = h("img", { class: "cover", alt: "", src: url, loading: "lazy" });
    img.addEventListener("load", () => URL.revokeObjectURL(url), { once: true });
    return img;
  }
  return blankCover(book.title);
}

/** Обложка книги из каталога: лежит рядом с приложением. Нет обложки или нет сети — буква, как у книг без обложки. */
function catalogCover(entry) {
  if (!entry.cover) return blankCover(entry.title);
  const img = h("img", { class: "cover", alt: "", src: catalogAsset(entry.cover), loading: "lazy" });
  img.addEventListener("error", () => img.replaceWith(blankCover(entry.title)), { once: true });
  return img;
}

function progressOf(book) {
  const total = book.chapters.length;
  const ch = Math.min(book.progress?.ch ?? 0, total - 1);
  const frac = total ? (ch + (book.progress?.p ? 0.5 : 0)) / total : 0;
  return { ch, total, pct: Math.round(frac * 100) };
}

/** Кнопка-«чип» с выбором: нажатая подсвечена. */
const choiceChip = (label, on, onClick) => h("button", { class: "chip", "aria-pressed": String(on), onClick }, label);

/**
 * Лист с одним полем для названия папки. Если withPlace, под полем выбор места: верхний уровень или любая папка верхнего уровня
 * (вложенные в этот выбор не попадают, так что глубже одной вложенности папку не создать).
 * submit(name, place) возвращает { error } или { ok: true, … }; after получает этот результат.
 */
function askFolder({ title, value = "", action, parent = null, withPlace = false, submit, after }) {
  let place = parent;
  const input = h("input", { class: "field", type: "text", value, maxlength: MAX_GROUP_NAME, placeholder: "Например, «Для сестры»", "aria-label": "Название папки", autocomplete: "off", enterkeyhint: "done" });
  const msg = h("p", { class: "note err", role: "alert" });
  const choices = withPlace ? parentChoices(folders()) : [];
  const where = h("div", { class: "chips wrap", role: "group", "aria-label": "Где создать папку" });
  const paintWhere = () =>
    where.replaceChildren(choiceChip("Верхний уровень", place === null, () => ((place = null), paintWhere())), ...choices.map((n) => choiceChip(n.name, place === n.id, () => ((place = n.id), paintWhere()))));
  paintWhere();
  let busy = false;
  const go = async () => {
    if (busy) return;
    busy = true;
    const r = await submit(input.value, place);
    busy = false;
    if (r?.error) {
      msg.textContent = r.error;
      input.focus();
      return;
    }
    sheet.close();
    after?.(r);
  };
  input.addEventListener("keydown", (e) => e.key === "Enter" && go());
  input.addEventListener("input", () => (msg.textContent = ""));
  const sheet = openSheet({
    label: title,
    content: h(
      "div",
      null,
      h("h2", { class: "set-title" }, title),
      input,
      msg,
      choices.length > 0 && [h("p", { class: "sheet-sub" }, "Где"), where, h("p", { class: "note tight" }, "Папка может лежать в другой папке, но только на один уровень: внутри вложенной папки новую не создать.")],
      h("div", { class: "set-actions" }, h("button", { class: "btn primary block", onClick: go }, action)),
    ),
  });
  setTimeout(() => input.focus(), 320);
}

export function renderLibrary(root, arg = "") {
  const folder = folderFromHash(arg); // "" — список папок, "all" — все книги, иначе id папки
  let mounted = true;
  let leaving = false; // уходим с экрана сами (например, после удаления папки): перерисовка не нужна
  let query = "";
  refreshCatalog();

  // ── Добавление своих файлов ───────────────────────────────────────────────
  const fileInput = h("input", { type: "file", accept: ".epub,application/epub+zip", multiple: true, class: "visually-hidden", "aria-label": "Выбрать файлы EPUB" });
  fileInput.addEventListener("change", async () => {
    const files = [...fileInput.files];
    fileInput.value = "";
    if (!files.length) return;
    const node = folders().byId.get(folder);
    const into = node && !node.shipped ? [node.id] : [];
    let added = 0;
    let dup = 0;
    const errors = [];
    for (const [i, f] of files.entries()) {
      toast(files.length > 1 ? `Читаю книги: ${i + 1} из ${files.length}…` : "Читаю книгу…");
      try {
        const r = await addBook(f, { groups: into });
        if (r.duplicate) dup += 1;
        else added += 1;
        if (files.length === 1) toast(r.duplicate ? (into.length ? "Эта книга уже была, теперь она и в этой папке" : "Эта книга уже есть в библиотеке") : `Добавлено: ${r.book.title}`);
      } catch (err) {
        errors.push(err.message || "Не удалось открыть файл");
      }
    }
    if (files.length > 1) {
      const parts = [added && `добавлено: ${added}`, dup && `уже были: ${dup}`, errors.length && `не открылось: ${errors.length}`].filter(Boolean);
      toast(parts.join(", ").replace(/^./, (c) => c.toUpperCase()));
    } else if (errors.length) toast(errors[0]);
    if (added) ensureAnalysis(); // разбор книг пойдёт в фоне
  });
  const pick = () => fileInput.click();

  // ── Каркас страницы ───────────────────────────────────────────────────────
  const input = h("input", { type: "search", placeholder: "Поиск по книгам", "aria-label": "Поиск по всем книгам", autocomplete: "off", autocapitalize: "off", spellcheck: "false" });
  input.addEventListener("input", () => {
    query = input.value;
    paint();
  });
  const search = h("div", { class: "search" }, icon("search", 20), input);
  const head = h("div");
  const lead = h("div"); // под шапкой: напоминание о копии и «Продолжить чтение»
  const body = h("div");
  root.replaceChildren(h("main", { class: "view" }, h("div", { class: "page" }, head, lead, search, body, fileInput)));

  const fmt = (n) => n.toLocaleString("ru-RU");
  const booksWord = (n) => `${n} ${plural(n, ["книга", "книги", "книг"])}`;

  // ── Действия ─────────────────────────────────────────────────────────────
  async function getFromCatalog(entry) {
    try {
      const r = await addFromCatalog(entry);
      if (!r) return;
      ensureAnalysis();
      if (mounted) location.hash = `#/read/${r.book.id}`;
      else toast(`Добавлено: ${r.book.title}`);
    } catch (err) {
      toast(err.message || "Не удалось скачать книгу");
    }
  }

  /** Новая папка. parent — где она появится сразу; forBook — книга, которую надо положить в новую папку. */
  function newFolder({ parent = null, forBook = null } = {}) {
    askFolder({
      title: "Новая папка",
      action: "Создать",
      parent,
      withPlace: true,
      submit: async (name, place) => {
        const r = await createGroup(name, place);
        if (r.error) return r;
        if (forBook) await toggleBookGroup(forBook.id, r.group.id);
        return { ok: true, group: r.group };
      },
      after: ({ group }) => {
        if (group.parent) collapsed.delete(group.parent); // чтобы новую папку было видно
        paint();
        if (forBook) bookMenu(forBook);
        toast(`Папка «${group.name}» создана`);
      },
    });
  }

  function renameFolder(node) {
    askFolder({ title: "Название папки", value: node.name, action: "Сохранить", submit: (name) => renameGroup(node.id, name).then((r) => (r.error ? r : { ok: true })) });
  }

  /** Лист «Переместить»: верхний уровень или любая папка верхнего уровня. Папке с вложенными доступен только верхний уровень. */
  function moveFolder(node) {
    const choices = parentChoices(folders(), node.id);
    const msg = h("p", { class: "note err", role: "alert" });
    const choose = async (to) => {
      const r = await moveGroup(node.id, to);
      if (r.error) {
        msg.textContent = r.error;
        return;
      }
      sheet.close();
      toast("Папка перемещена");
    };
    const sheet = openSheet({
      label: "Переместить папку",
      content: h(
        "div",
        null,
        h("h2", { class: "set-title" }, "Переместить"),
        h("p", { class: "sheet-sub" }, `Куда положить «${node.name}»`),
        h("div", { class: "chips wrap", role: "group", "aria-label": "Куда переместить" }, choiceChip("Верхний уровень", !node.parent, () => choose(null)), ...choices.map((n) => choiceChip(n.name, node.parent === n.id, () => choose(n.id)))),
        msg,
        !choices.length && h("p", { class: "note" }, "В этой папке есть вложенные папки, а глубже одной вложенности папки не делаются. Чтобы вложить её в другую, сначала переложите вложенные."),
      ),
    });
  }

  /** Лист действий над своей папкой. Удаление в два нажатия; книги всегда остаются в библиотеке. */
  function folderMenu(node) {
    const kids = node.children.length;
    let armed = 0;
    const label = (text) => del.replaceChildren(icon("trash", 20), text);
    const del = h("button", {
      class: "btn danger block",
      onClick: async () => {
        if (!armed) {
          label("Нажмите ещё раз, чтобы удалить");
          armed = setTimeout(() => {
            armed = 0;
            label("Удалить папку");
          }, 3500);
          return;
        }
        clearTimeout(armed);
        leaving = true;
        const n = await deleteGroup(node.id);
        sheet.close();
        const message = n > 1 ? `Удалено папок: ${n}. Книги остались в библиотеке` : "Папка удалена, книги остались в библиотеке";
        window.addEventListener("hashchange", () => toast(message), { once: true }); // переход стирает старые сообщения, поэтому показываем после него
        location.replace(pageHash("library", node.parent || ""));
      },
    });
    label("Удалить папку");
    const sheet = openSheet({
      label: node.name,
      content: h(
        "div",
        null,
        h("h2", { class: "set-title" }, node.name),
        h(
          "div",
          { class: "set-actions" },
          h("button", { class: "btn quiet block", onClick: () => renameFolder(node) }, "Переименовать"),
          h("button", { class: "btn quiet block", onClick: () => moveFolder(node) }, "Переместить"),
          del,
        ),
        h("p", { class: "note" }, `Книги останутся в библиотеке${kids ? `, а вложенные папки (${kids}) удалятся вместе с этой` : ""}.`),
      ),
    });
  }

  async function shareUnknown(book) {
    const text = book.stats.unknown.map(([w, n]) => `${w}\t${n}`).join("\n");
    try {
      await navigator.clipboard.writeText(text);
      toast("Список скопирован");
    } catch {
      const a = h("a", { href: URL.createObjectURL(new Blob([text], { type: "text/plain" })), download: "ember-unknown-words.txt" });
      document.body.append(a);
      a.click();
      a.remove();
    }
  }

  function bookMenu(book) {
    const st = book.stats?.tokens ? book.stats : null;
    const facts = st
      ? [
          ["Слов в тексте", fmt(st.tokens)],
          ["Разных слов", fmt(st.unique)],
          ["Словарь знает", `${Math.round(st.coverage * 100)}% текста`],
          ["Фразовых глаголов", fmt(st.phrases.pv.unique)],
          ["Идиом", fmt(st.phrases.id.unique)],
          ["Не нашлось в словаре", `${fmt(st.uniqueUnknown)} разных слов`],
        ]
      : null;

    // Книгу можно класть только в свои папки; вложенные подписаны родителем: «Для сестры › Сказки»
    const groupBox = h("div", { class: "chips wrap", role: "group", "aria-label": "Папки этой книги" });
    const paintGroups = () => {
      const now = app.books.find((b) => b.id === book.id) || book;
      const tree = folders();
      const mine = tree.roots.flatMap((r) => [r, ...r.children]).filter((n) => !n.shipped);
      groupBox.replaceChildren(
        ...mine.map((n) => choiceChip(pathLabel(tree, n.id), !!now.groups?.includes(n.id), async () => { await toggleBookGroup(book.id, n.id); paintGroups(); })),
        h("button", { class: "chip add", onClick: () => newFolder({ forBook: book }) }, icon("plus", 16), "Новая папка"),
      );
    };
    paintGroups();

    const fromCatalog = book.catalogId && app.catalog.books.some((c) => c.id === book.catalogId);
    const sheet = openSheet({
      label: book.title,
      content: h(
        "div",
        null,
        h("h2", { class: "set-title" }, book.title),
        h("p", { class: "sheet-sub" }, "Папки"),
        groupBox,
        facts
          ? h("dl", { class: "facts" }, facts.map(([k, v]) => [h("dt", null, k), h("dd", null, v)]))
          : h("p", { class: "note" }, app.analysis?.id === book.id ? "Анализ книги идёт…" : book.stats ? "В этой книге не нашлось текста для разбора." : "Анализ книги появится через несколько секунд."),
        st?.unknown?.length ? h("p", { class: "note" }, `Чаще всего не находятся: ${st.unknown.slice(0, 12).map(([w, n]) => `${w} (${n})`).join(", ")}.`) : null,
        h(
          "div",
          { class: "set-actions" },
          st?.top ? h("button", { class: "btn block", onClick: () => openBookWords(book) }, icon("list", 20), "Слова этой книги") : null,
          st?.unknown?.length ? h("button", { class: "btn quiet block", onClick: () => shareUnknown(book) }, "Скопировать список не найденных слов") : null,
          h("button", { class: "btn danger block", onClick: async () => { await removeBook(book.id); sheet.close(); toast("Книга удалена"); } }, icon("trash", 20), "Удалить книгу"),
        ),
        h("p", { class: "note" }, "Слова, которые вы добавили в словарь из этой книги, останутся. Удаляется только сама книга и ваше место в ней.", fromCatalog && " Встроенную книгу можно скачать снова из её папки."),
      ),
    });
  }

  /** «Продолжить чтение»: книга, на которой вы остановились, одним касанием. Показывается на списке папок и внутри папок. */
  function resumeCard() {
    const b = resumeBook();
    if (!b) return null;
    const p = progressOf(b);
    return h(
      "a",
      { class: "resume", href: `#/read/${b.id}`, "aria-label": `Продолжить чтение: ${b.title}, глава ${p.ch + 1} из ${p.total}` },
      cover(b),
      h("div", { class: "resume-text" }, h("div", { class: "resume-label" }, "Продолжить чтение"), h("div", { class: "resume-title" }, b.title), h("div", { class: "resume-meta" }, h("div", { class: "bar" }, h("i", { style: { width: `${p.pct}%` } })), `Глава ${p.ch + 1} из ${p.total}`)),
      icon("next", 20),
    );
  }

  // ── Отрисовка ────────────────────────────────────────────────────────────
  const statLine = (b) => {
    if (app.analysis?.id === b.id) return `Анализ книги: ${Math.round(app.analysis.pct * 100)}%`;
    if (b.stats?.tokens === 0) return "В книге не нашлось текста";
    if (b.stats) return `Словарь знает ${Math.round(b.stats.coverage * 100)}% слов`;
    return "";
  };

  function bookRow(b) {
    const p = progressOf(b);
    return h(
      "li",
      { class: "book" },
      h(
        "button",
        { class: "book-open", onClick: () => (location.hash = `#/read/${b.id}`) },
        cover(b),
        h("div", { style: { minWidth: 0, flex: 1 } }, h("div", { class: "btitle" }, b.title), b.author && h("div", { class: "bauthor" }, b.author), h("div", { class: "bprog" }, h("div", { class: "bar" }, h("i", { style: { width: `${p.pct}%` } })), `Глава ${p.ch + 1} из ${p.total}`), h("div", { class: "bstat" }, statLine(b))),
      ),
      h("button", { class: "iconbtn", "aria-label": `Действия: ${b.title}`, onClick: () => bookMenu(b) }, icon("more", 22)),
    );
  }

  function catalogRow(c) {
    const busy = app.downloading.has(c.id);
    return h(
      "li",
      { class: "book catalog" },
      h(
        "button",
        { class: "book-open", disabled: busy, "aria-label": `Скачать и открыть: ${c.title}`, onClick: () => getFromCatalog(c) },
        catalogCover(c),
        h("div", { style: { minWidth: 0, flex: 1 } }, h("div", { class: "btitle" }, c.title), c.author && h("div", { class: "bauthor" }, c.author), h("div", { class: "bstat" }, busy ? "Скачиваю…" : ["Встроенная книга", c.size ? ` · ${fmtSize(c.size)}` : ""])),
        h("span", { class: "dl-mark" }, icon("download", 22)),
      ),
    );
  }

  function emptyState(node) {
    if (query.trim()) return h("section", { class: "empty" }, h("p", { class: "lead" }, "Ничего не нашлось"), h("p", null, "Поиск идёт по названиям, авторам и названиям папок во всей библиотеке и среди встроенных книг."));
    if (node && !node.shipped) {
      return h("section", { class: "empty" }, h("p", { class: "lead" }, "В этой папке пока пусто"), h("p", null, "Нажмите на три точки рядом с книгой и отметьте эту папку. Книга может лежать в нескольких папках сразу. Новые книги, добавленные отсюда, попадут в эту папку."), h("button", { class: "btn primary", onClick: pick }, icon("plus", 20), "Добавить книгу"));
    }
    const shipped = folders().roots.filter((n) => n.shipped).map((n) => `«${n.name}»`);
    return h(
      "section",
      { class: "empty" },
      h("p", { class: "lead" }, "Начните с книги на английском"),
      h("p", null, "Выберите файл EPUB. Он останется только на этом телефоне, и читать его можно без интернета. Нажимайте на незнакомые слова: перевод, произношение и пример появятся сразу.", shipped.length > 0 && ` Готовые книги ждут в ${shipped.length > 1 ? "папках" : "папке"} ${shipped.join(", ")}.`),
      h("button", { class: "btn primary", onClick: pick }, icon("plus", 20), "Добавить книгу"),
    );
  }

  const newRow = (parent, gutter = false) => h("button", { class: `f-new${gutter ? " gutter" : ""}`, onClick: () => newFolder({ parent }) }, icon("plus", 20), "Новая папка");

  /** Шапка: на списке папок заголовок и кнопки в одной строке, на папке сверху строка возврата и кнопки, под ней заголовок. */
  function paintHead({ title, sub, back, actions }) {
    const bar = h("div", { class: "top-actions" }, actions);
    head.replaceChildren(
      ...[
        back && h("div", { class: "navrow" }, backLink(back.href, back.label), bar),
        h("header", { class: back ? "top lower" : "top" }, h("div", null, h("h1", { class: "title" }, title), sub ? h("p", { class: "sub" }, sub) : null), back ? null : bar),
      ].filter(Boolean),
    );
  }

  /** Заменяет содержимое под шапкой; пустые места (false, null) пропускаются. */
  const show = (...nodes) => body.replaceChildren(...nodes.flat().filter(Boolean));

  const addBtn = () => h("button", { class: "iconbtn", "aria-label": "Добавить книгу", onClick: pick }, icon("plus", 24));

  function paint() {
    if (!mounted || leaving) return;
    const tree = folders();
    const node = folder && folder !== ALL ? tree.byId.get(folder) : null;
    if (folder && folder !== ALL && !node) {
      // Папки нет: удалена, или список встроенных папок ещё не получен
      if (app.catalogLoaded || isUserGroup(folder)) {
        location.replace(pageHash("library"));
        return;
      }
      paintHead({ title: "Книги", back: { href: pageHash("library"), label: "Книги" }, actions: [] });
      lead.replaceChildren();
      search.hidden = true;
      show(h("p", { class: "note" }, "Загружаю список папок…"));
      return;
    }

    const searching = query.trim().length > 0;
    const anything = app.books.length > 0 || app.catalog.books.length > 0 || app.groups.length > 0;
    search.hidden = !anything;
    const counts = folderCounts({ books: app.books, catalog: app.catalog, tree });

    // Шапка
    if (node) {
      const n = counts.get(node.id) || 0;
      const parent = node.parent ? tree.byId.get(node.parent) : null;
      paintHead({
        title: node.name,
        sub: n ? booksWord(n) : "",
        back: parent ? { href: pageHash("library", parent.id), label: parent.name } : { href: pageHash("library"), label: "Книги" },
        actions: [addBtn(), !node.shipped && h("button", { class: "iconbtn", "aria-label": `Действия: ${node.name}`, onClick: () => folderMenu(node) }, icon("more", 22))],
      });
    } else if (folder === ALL) {
      paintHead({ title: "Все книги", sub: app.books.length ? booksWord(app.books.length) : "", back: { href: pageHash("library"), label: "Книги" }, actions: [addBtn()] });
    } else {
      paintHead({ title: "Книги", actions: [addBtn(), h("button", { class: "iconbtn", "aria-label": "Настройки", onClick: () => openAppSettings() }, icon("sliders", 22))] });
    }

    // Под шапкой: напоминание о копии и «Продолжить чтение» (в поиске и на «Все книги» не нужны)
    lead.replaceChildren(...(searching ? [] : [backupNudge(), folder === ALL ? null : resumeCard()]).filter(Boolean));

    // Что под шапкой
    const rowsOf = () => folderRows(tree, (id) => counts.get(id) || 0);
    const bookList = (items) => h("ul", { class: "books" }, items.map((it) => (it.kind === "book" ? bookRow(it.book) : catalogRow(it.entry))));

    if (searching) {
      const items = shelfItems({ books: app.books, catalog: app.catalog, userGroups: app.groups, query });
      show(items.length ? bookList(items) : emptyState(node));
      return;
    }
    if (!folder) {
      if (!anything) {
        show(emptyState(null));
        return;
      }
      show(
        folderList({ all: { label: "Все книги", count: app.books.length, href: pageHash("library", ALL) }, rows: rowsOf(), hrefOf: (id) => pageHash("library", id), onToggle: paint }),
        newRow(null, hasGutter(rowsOf())),
        !app.books.length && h("p", { class: "note" }, "Книг на устройстве пока нет. Откройте папку с готовыми книгами или добавьте свой EPUB кнопкой «+»."),
      );
      return;
    }
    const items = shelfItems({ books: app.books, catalog: app.catalog, userGroups: app.groups, active: folder });
    const sub = node ? rowsOf().flatMap((r) => [r, ...r.children]).find((r) => r.id === node.id)?.children || [] : [];
    show(
      sub.length > 0 && folderList({ rows: sub, hrefOf: (id) => pageHash("library", id) }),
      node && !node.parent && newRow(node.id),
      sub.length > 0 && items.length > 0 && h("h2", { class: "f-head" }, "Книги"),
      items.length ? bookList(items) : sub.length ? null : emptyState(node),
    );
  }

  paint();
  const off = subscribe(paint);
  const onOnline = () => refreshCatalog({ force: true });
  window.addEventListener("online", onOnline);
  return () => {
    mounted = false;
    off();
    window.removeEventListener("online", onOnline);
    closeSheet();
  };
}
