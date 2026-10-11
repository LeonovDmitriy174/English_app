// library.js — полка: группы книг, общий поиск, встроенные книги из каталога, добавление EPUB.
import { h, icon, toast, openSheet, closeSheet } from "../dom.js";
import { app, subscribe, addBook, removeBook, ensureAnalysis, createGroup, renameGroup, deleteGroup, toggleBookGroup, addFromCatalog, refreshCatalog, catalogAsset } from "../store.js";
import { ALL, MAX_GROUP_NAME, groupChips, shelfItems, isUserGroup, fmtSize } from "../shelf.js";
import { openAppSettings } from "./settings.js";

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

/** Лист с одним полем для названия группы. submit(name) возвращает { error } или { ok: true }. */
function askName({ title, value = "", action, submit, after }) {
  const input = h("input", { class: "field", type: "text", value, maxlength: MAX_GROUP_NAME, placeholder: "Например, «Для сестры»", "aria-label": "Название группы", autocomplete: "off", enterkeyhint: "done" });
  const msg = h("p", { class: "note err", role: "alert" });
  let busy = false;
  const go = async () => {
    if (busy) return;
    busy = true;
    const r = await submit(input.value);
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
    content: h("div", null, h("h2", { class: "set-title" }, title), input, msg, h("div", { class: "set-actions" }, h("button", { class: "btn primary block", onClick: go }, action))),
  });
  setTimeout(() => input.focus(), 320);
}

// Выбранная группа помнится, пока приложение открыто: вернулись из читалки — та же полка
let activeGroup = null;

export function renderLibrary(root) {
  let mounted = true;
  let query = "";
  refreshCatalog();

  // ── Добавление своих файлов ───────────────────────────────────────────────
  const fileInput = h("input", { type: "file", accept: ".epub,application/epub+zip", multiple: true, class: "visually-hidden", "aria-label": "Выбрать файлы EPUB" });
  fileInput.addEventListener("change", async () => {
    const files = [...fileInput.files];
    fileInput.value = "";
    if (!files.length) return;
    const into = isUserGroup(activeGroup) ? [activeGroup] : [];
    let added = 0;
    let dup = 0;
    const errors = [];
    for (const [i, f] of files.entries()) {
      toast(files.length > 1 ? `Читаю книги: ${i + 1} из ${files.length}…` : "Читаю книгу…");
      try {
        const r = await addBook(f, { groups: into });
        if (r.duplicate) dup += 1;
        else added += 1;
        if (files.length === 1) toast(r.duplicate ? (into.length ? "Эта книга уже была, теперь она и в этой группе" : "Эта книга уже есть в библиотеке") : `Добавлено: ${r.book.title}`);
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
  const chipRow = h("div", { class: "chips", role: "group", "aria-label": "Группы книг" });
  const tools = h("div", { class: "group-tools" });
  const list = h("div");
  const page = h(
    "div",
    { class: "page" },
    h(
      "header",
      { class: "top" },
      h("div", null, h("h1", { class: "title" }, "Книги")),
      h("div", { class: "top-actions" }, h("button", { class: "iconbtn", "aria-label": "Добавить книгу", onClick: pick }, icon("plus", 24)), h("button", { class: "iconbtn", "aria-label": "Настройки", onClick: () => openAppSettings() }, icon("sliders", 22))),
    ),
    search,
    chipRow,
    tools,
    list,
    fileInput,
  );
  root.replaceChildren(h("main", { class: "view" }, page));

  const fmt = (n) => n.toLocaleString("ru-RU");
  const shippedFirst = () => app.catalog.groups[0]?.id;

  /** Какая полка открыта. Выбор делается один раз, когда уже понятно, есть ли книги и каталог. */
  function resolveActive() {
    if (activeGroup === null && (app.catalogLoaded || app.books.length)) activeGroup = !app.books.length && shippedFirst() ? shippedFirst() : ALL;
    if (activeGroup && activeGroup !== ALL && ![...app.catalog.groups, ...app.groups].some((g) => g.id === activeGroup)) activeGroup = ALL; // группу удалили
    return activeGroup ?? ALL;
  }

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

  function newGroup({ forBook } = {}) {
    askName({
      title: "Новая группа",
      action: "Создать",
      submit: async (name) => {
        const r = await createGroup(name);
        if (r.error) return r;
        if (forBook) await toggleBookGroup(forBook.id, r.group.id);
        return { ok: true, group: r.group };
      },
      after: ({ group }) => {
        if (forBook) bookMenu(forBook);
        else {
          activeGroup = group.id;
          query = "";
          input.value = "";
          paint();
        }
        toast(`Группа «${group.name}» создана`);
      },
    });
  }

  function renameActive() {
    const g = app.groups.find((x) => x.id === activeGroup);
    if (!g) return;
    askName({ title: "Название группы", value: g.name, action: "Сохранить", submit: (name) => renameGroup(g.id, name).then((r) => (r.error ? r : { ok: true })) });
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

    const groupBox = h("div", { class: "chips wrap", role: "group", "aria-label": "Группы этой книги" });
    const paintGroups = () => {
      const now = app.books.find((b) => b.id === book.id) || book;
      groupBox.replaceChildren(
        ...app.groups.map((g) => h("button", { class: "chip", "aria-pressed": String(!!now.groups?.includes(g.id)), onClick: async () => { await toggleBookGroup(book.id, g.id); paintGroups(); } }, g.name)),
        h("button", { class: "chip add", onClick: () => newGroup({ forBook: book }) }, icon("plus", 16), "Новая группа"),
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
        h("p", { class: "sheet-sub" }, "Группы"),
        groupBox,
        facts
          ? h("dl", { class: "facts" }, facts.map(([k, v]) => [h("dt", null, k), h("dd", null, v)]))
          : h("p", { class: "note" }, app.analysis?.id === book.id ? "Анализ книги идёт…" : book.stats ? "В этой книге не нашлось текста для разбора." : "Анализ книги появится через несколько секунд."),
        st?.unknown?.length ? h("p", { class: "note" }, `Чаще всего не находятся: ${st.unknown.slice(0, 12).map(([w, n]) => `${w} (${n})`).join(", ")}.`) : null,
        h(
          "div",
          { class: "set-actions" },
          st?.unknown?.length ? h("button", { class: "btn quiet block", onClick: () => shareUnknown(book) }, "Скопировать список не найденных слов") : null,
          h("button", { class: "btn danger block", onClick: async () => { await removeBook(book.id); sheet.close(); toast("Книга удалена"); } }, icon("trash", 20), "Удалить книгу"),
        ),
        h("p", { class: "note" }, "Слова, которые вы добавили в словарь из этой книги, останутся. Удаляется только сама книга и ваше место в ней.", fromCatalog && " Встроенную книгу можно скачать снова из её группы."),
      ),
    });
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

  function emptyState(active) {
    if (query.trim()) return h("section", { class: "empty" }, h("p", { class: "lead" }, "Ничего не нашлось"), h("p", null, "Поиск идёт по названиям, авторам и названиям групп во всей библиотеке и среди встроенных книг."));
    if (isUserGroup(active)) {
      return h("section", { class: "empty" }, h("p", { class: "lead" }, "В этой группе пока пусто"), h("p", null, "Нажмите на три точки рядом с книгой и отметьте эту группу. Книга может лежать в нескольких группах сразу. Новые книги, добавленные отсюда, попадут в эту группу."), h("button", { class: "btn primary", onClick: pick }, icon("plus", 20), "Добавить книгу"));
    }
    const shipped = app.catalog.groups.map((g) => `«${g.name}»`);
    return h(
      "section",
      { class: "empty" },
      h("p", { class: "lead" }, "Начните с книги на английском"),
      h("p", null, "Выберите файл EPUB. Он останется только на этом телефоне, и читать его можно без интернета. Нажимайте на незнакомые слова: перевод, произношение и пример появятся сразу.", shipped.length > 0 && ` Готовые книги ждут в ${shipped.length > 1 ? "группах" : "группе"} ${shipped.join(", ")}.`),
      h("button", { class: "btn primary", onClick: pick }, icon("plus", 20), "Добавить книгу"),
    );
  }

  let shownGroup = null;
  function paintChips(active) {
    const chips = groupChips({ books: app.books, catalog: app.catalog, userGroups: app.groups });
    const keep = chipRow.scrollLeft;
    chipRow.replaceChildren(
      ...chips.map((c) =>
        h(
          "button",
          {
            class: "chip",
            "aria-pressed": String(c.id === active),
            onClick: () => {
              activeGroup = c.id;
              paint();
            },
          },
          c.name,
          h("span", { class: "n" }, c.count),
        ),
      ),
      h("button", { class: "chip add", "aria-label": "Новая группа", onClick: () => newGroup() }, icon("plus", 16), "Группа"),
    );
    // Ряд прокручивается только вбок: при смене группы открытая встаёт на середину, иначе остаётся где была
    chipRow.scrollLeft = keep;
    const on = chipRow.querySelector('[aria-pressed="true"]');
    if (on && shownGroup !== active) {
      const box = chipRow.getBoundingClientRect();
      const me = on.getBoundingClientRect();
      chipRow.scrollLeft = keep + (me.left - box.left) - (box.width - me.width) / 2;
    }
    shownGroup = active;
  }

  function paint() {
    if (!mounted) return;
    const active = resolveActive();
    const searching = query.trim().length > 0;
    const anything = app.books.length > 0 || app.catalog.books.length > 0;
    search.hidden = !anything;
    chipRow.hidden = !anything || searching;
    if (anything && !searching) paintChips(active);

    tools.replaceChildren();
    tools.hidden = searching || !isUserGroup(active);
    if (!tools.hidden) {
      let armed = 0;
      const del = h("button", {
        class: "linkbtn danger-link",
        onClick: async () => {
          if (!armed) {
            del.textContent = "Нажмите ещё раз: книги останутся";
            armed = setTimeout(() => {
              armed = 0;
              del.textContent = "Удалить группу";
            }, 3500);
            return;
          }
          clearTimeout(armed);
          await deleteGroup(active);
          toast("Группа удалена, книги остались в библиотеке");
        },
      }, "Удалить группу");
      tools.append(h("button", { class: "linkbtn", onClick: renameActive }, "Переименовать"), del);
    }

    const items = shelfItems({ books: app.books, catalog: app.catalog, userGroups: app.groups, active, query });
    list.replaceChildren(items.length ? h("ul", { class: "books" }, items.map((it) => (it.kind === "book" ? bookRow(it.book) : catalogRow(it.entry)))) : emptyState(active));
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
