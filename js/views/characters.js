// characters.js — окно «Персонажи и названия»: имена из книги с числом упоминаний, ваши заметки о них, загрузка файла терминов.
// Заметка хранится по имени и общая для всех книг (Jon из первой книги тот же Jon во второй); в тексте имя с заметкой подчёркнуто,
// а при нажатии показывается описание. Правила: js/characters.js, хранение: js/store/chars.js.
import { h, icon, openSheet, toast } from "../dom.js";
import { app, setChar, importChars, charsText } from "../store.js";
import { normKey, titleCase, displayName, parseTerms, MAX_TEXT } from "../characters.js";

const PAGE = 30; // сколько строк показывать сразу
const MAX_FILE = 2 * 1024 * 1024;

const plural = (n, f) => {
  const a = n % 10;
  const b = n % 100;
  return f[b > 10 && b < 20 ? 2 : a === 1 ? 0 : a >= 2 && a <= 4 ? 1 : 2];
};

export function openCharacters(book) {
  let tab = book?.stats?.nameCounts?.length ? "book" : "mine"; // book — имена этой книги, note — только с заметкой, mine — все ваши заметки
  let query = "";
  let editing = null; // ключ строки, у которой открыто поле заметки
  let shown = PAGE;

  const input = h("input", { type: "search", placeholder: "Поиск по именам", "aria-label": "Поиск по именам", autocomplete: "off", autocapitalize: "off", spellcheck: "false" });
  input.addEventListener("input", () => {
    query = input.value.trim().toLowerCase();
    shown = PAGE;
    paint();
  });
  const chips = h("div", { class: "chips wrap", role: "group", "aria-label": "Какие имена показывать" });
  const top = h("div", { class: "aw-top" }, h("h2", { class: "set-title" }, "Персонажи и названия"), h("div", { class: "search" }, icon("search", 20), input), chips);
  const body = h("div", { class: "aw-body" });
  const fileInput = h("input", { type: "file", accept: ".csv,.tsv,.txt,text/plain,text/csv", hidden: true, "aria-label": "Файл с терминами" });
  const sheet = openSheet({ content: h("div", { class: "aw" }, top, body, fileInput), cls: "addword", label: "Персонажи и названия" });

  /** Строки списка: имена книги (по числу упоминаний) или все ваши заметки (по алфавиту). */
  function rows() {
    if (tab === "mine") return [...app.chars].map(([key, rec]) => ({ key, rec, n: 0 })).sort((a, b) => displayName(a.key, a.rec).localeCompare(displayName(b.key, b.rec), "en"));
    const list = (book?.stats?.nameCounts || []).map(([surf, n]) => ({ key: normKey(surf), rec: app.chars.get(normKey(surf)), n }));
    return tab === "note" ? list.filter((r) => r.rec) : list;
  }

  const matches = (r) => !query || r.key.includes(query) || (r.rec?.t || "").toLowerCase().includes(query);

  function paintChips() {
    const named = (book?.stats?.nameCounts || []).filter(([s]) => app.chars.has(normKey(s))).length;
    const defs = [
      book?.stats?.nameCounts?.length ? ["book", "В этой книге", book.stats.nameCounts.length] : null,
      book?.stats?.nameCounts?.length ? ["note", "С заметкой", named] : null,
      ["mine", "Все мои заметки", app.chars.size],
    ].filter(Boolean);
    chips.replaceChildren(
      ...defs.map(([key, label, n]) =>
        h(
          "button",
          {
            class: "chip",
            "aria-pressed": String(tab === key),
            onClick: () => {
              tab = key;
              editing = null;
              shown = PAGE;
              paint();
            },
          },
          label,
          h("span", { class: "n" }, n),
        ),
      ),
    );
  }

  async function save(row, text) {
    const key = await setChar(row.key, { name: row.rec?.n || titleCase(row.key), text });
    if (!key) toast("Не удалось сохранить заметку");
    else toast(text.trim() ? "Заметка сохранена" : "Заметка удалена");
    editing = null;
    paint();
  }

  function editor(row) {
    const area = h("textarea", { class: "field note-text", rows: 3, maxlength: MAX_TEXT, placeholder: "Кто это или что это: одна-две фразы", "aria-label": `Заметка: ${displayName(row.key, row.rec)}`, enterkeyhint: "enter" }, row.rec?.t || "");
    setTimeout(() => area.focus(), 60);
    return h(
      "div",
      { class: "chr-edit" },
      area,
      h(
        "div",
        { class: "slip-actions" },
        h("button", { class: "btn primary grow", onClick: () => save(row, area.value) }, "Сохранить"),
        h("button", { class: "btn quiet", onClick: () => ((editing = null), paint()) }, "Отмена"),
      ),
      row.rec ? h("div", null, h("button", { class: "linkbtn danger-link", onClick: () => save(row, "") }, "Удалить заметку")) : null,
    );
  }

  function rowEl(row) {
    const open = editing === row.key;
    const name = displayName(row.key, row.rec);
    return h(
      "li",
      { class: `chr${open ? " open" : ""}` },
      h(
        "button",
        { class: "chr-main", "aria-expanded": String(open), onClick: () => ((editing = open ? null : row.key), paint()) },
        h("div", { class: "row-main" }, h("div", { class: "row-hw" }, name), row.rec ? h("div", { class: "chr-text" }, row.rec.t) : h("div", { class: "chr-none" }, "Нет заметки")),
        row.n ? h("span", { class: "chr-n" }, `${row.n} ${plural(row.n, ["раз", "раза", "раз"])}`) : null,
      ),
      open ? editor(row) : null,
    );
  }

  async function pickFile() {
    const file = fileInput.files?.[0];
    fileInput.value = "";
    if (!file) return;
    if (file.size > MAX_FILE) {
      toast("Файл слишком большой: нужен небольшой текстовый или CSV-файл");
      return;
    }
    let text = "";
    try {
      text = await file.text();
    } catch {
      toast("Не удалось прочитать файл");
      return;
    }
    const { items, skipped } = parseTerms(text);
    if (!items.length) {
      toast("В файле нет терминов: нужны строки «название;описание»");
      return;
    }
    const r = await importChars(items);
    const parts = [r.added && `добавлено: ${r.added}`, r.updated && `обновлено: ${r.updated}`, r.kept && `ваших оставлено: ${r.kept}`, skipped && `пропущено строк: ${skipped}`].filter(Boolean);
    toast(parts.length ? `Термины загружены, ${parts.join(", ")}` : "Все эти термины уже есть");
    tab = tab === "book" && !book?.stats?.nameCounts?.length ? "mine" : tab;
    paint();
  }
  fileInput.addEventListener("change", pickFile);

  async function copyAll() {
    const text = charsText();
    try {
      await navigator.clipboard.writeText(text);
      toast("Заметки скопированы");
    } catch {
      const a = h("a", { href: URL.createObjectURL(new Blob([text], { type: "text/plain" })), download: "gloss-characters.txt" });
      document.body.append(a);
      a.click();
      a.remove();
    }
  }

  function paint() {
    paintChips();
    const all = rows().filter(matches);
    const part = all.slice(0, shown);
    const empty =
      tab === "mine" && !app.chars.size
        ? "Заметок пока нет. Нажмите на имя в книге и добавьте заметку или загрузите файл с терминами."
        : tab === "note" && !all.length && !query
          ? "К именам этой книги заметок пока нет. Откройте «В этой книге» и нажмите на имя."
          : "Ничего не найдено.";
    body.replaceChildren(
      ...[
        tab === "mine" ? null : h("p", { class: "note" }, "Имена, которые встречаются в этой книге с заглавной буквы. Нажмите на имя, чтобы записать, кто это: заметка появится при нажатии на это имя в тексте любой книги."),
        part.length ? h("ul", { class: "hits chr-list" }, part.map(rowEl)) : h("p", { class: "note" }, empty),
        all.length > shown ? h("button", { class: "linkbtn", onClick: () => ((shown += PAGE), paint()) }, "Показать ещё") : null,
        h(
          "div",
          { class: "chr-tools" },
          h("button", { class: "btn quiet block", onClick: () => fileInput.click() }, icon("download", 20), "Загрузить термины из файла"),
          app.chars.size ? h("button", { class: "btn quiet block", onClick: copyAll }, icon("list", 20), "Скопировать мои заметки") : null,
        ),
        h("p", { class: "note" }, "Файл: по строке на термин, «название;описание» (подойдёт CSV или обычный текст). Например: Winterfell;родовой замок Старков. Заметки, которые вы написали сами, из файла не перезаписываются."),
      ].filter(Boolean),
    );
  }

  paint();
  return sheet;
}
