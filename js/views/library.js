// library.js — список книг, добавление EPUB.
import { h, icon, toast, openSheet, closeSheet } from "../dom.js";
import { app, subscribe, addBook, removeBook, ensureAnalysis } from "../store.js";
import { openAppSettings } from "./settings.js";

function cover(book) {
  if (book.cover) {
    const url = URL.createObjectURL(book.cover);
    const img = h("img", { class: "cover", alt: "", src: url, loading: "lazy" });
    img.addEventListener("load", () => URL.revokeObjectURL(url), { once: true });
    return img;
  }
  return h("div", { class: "cover blank-cover", "aria-hidden": "true" }, (book.title || "?").trim()[0]?.toUpperCase());
}

function progressOf(book) {
  const total = book.chapters.length;
  const ch = Math.min(book.progress?.ch ?? 0, total - 1);
  const frac = total ? (ch + (book.progress?.p ? 0.5 : 0)) / total : 0;
  return { ch, total, pct: Math.round(frac * 100) };
}

export function renderLibrary(root) {
  const fileInput = h("input", { type: "file", accept: ".epub,application/epub+zip", class: "visually-hidden", "aria-label": "Выбрать файл EPUB" });
  fileInput.addEventListener("change", async () => {
    const f = fileInput.files[0];
    fileInput.value = "";
    if (!f) return;
    toast("Читаю книгу…");
    try {
      const { book, duplicate } = await addBook(f);
      toast(duplicate ? "Эта книга уже есть в библиотеке" : `Добавлено: ${book.title}`);
      ensureAnalysis(); // разбор книги пойдёт в фоне
    } catch (err) {
      toast(err.message || "Не удалось открыть файл");
    }
  });
  const pick = () => fileInput.click();

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
    list,
    fileInput,
  );
  root.replaceChildren(h("main", { class: "view" }, page));

  const fmt = (n) => n.toLocaleString("ru-RU");

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
    const st = book.stats;
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
    const sheet = openSheet({
      label: book.title,
      content: h(
        "div",
        null,
        h("h2", { class: "set-title" }, book.title),
        facts
          ? h("dl", { class: "facts" }, facts.map(([k, v]) => [h("dt", null, k), h("dd", null, v)]))
          : h("p", { class: "note" }, app.analysis?.id === book.id ? "Анализ книги идёт…" : "Анализ книги появится через несколько секунд."),
        st?.unknown?.length ? h("p", { class: "note" }, `Чаще всего не находятся: ${st.unknown.slice(0, 12).map(([w, n]) => `${w} (${n})`).join(", ")}.`) : null,
        h(
          "div",
          { class: "set-actions" },
          st?.unknown?.length ? h("button", { class: "btn quiet block", onClick: () => shareUnknown(book) }, "Скопировать список не найденных слов") : null,
          h("button", { class: "btn danger block", onClick: async () => { await removeBook(book.id); sheet.close(); toast("Книга удалена"); } }, icon("trash", 20), "Удалить книгу"),
        ),
        h("p", { class: "note" }, "Слова, которые вы добавили в словарь из этой книги, останутся. Удаляется только сама книга и ваше место в ней."),
      ),
    });
  }

  function statLine(b) {
    if (app.analysis?.id === b.id) return `Анализ книги: ${Math.round(app.analysis.pct * 100)}%`;
    if (b.stats) return `Словарь знает ${Math.round(b.stats.coverage * 100)}% слов`;
    return "";
  }

  function paint() {
    if (!app.books.length) {
      list.replaceChildren(
        h(
          "section",
          { class: "empty" },
          h("p", { class: "lead" }, "Начните с книги на английском"),
          h("p", null, "Выберите файл EPUB. Он останется только на этом телефоне, и читать его можно без интернета. Нажимайте на незнакомые слова: перевод, произношение и пример появятся сразу."),
          h("button", { class: "btn primary", onClick: pick }, icon("plus", 20), "Добавить книгу"),
        ),
      );
      return;
    }
    list.replaceChildren(
      h(
        "ul",
        { class: "books" },
        app.books.map((b) => {
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
        }),
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
