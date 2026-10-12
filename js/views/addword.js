// addword.js — окно «Добавить слово»: поиск по словарю приложения (по-английски и по-русски) и добавление одним нажатием.
// Услышали слово в фильме: нажали «+», вписали его, нажали «+» у найденного слова. Книга для этого не нужна.
// Если слова нет в словаре, можно добавить своё с переводом. Правила поиска живут в js/dictsearch.js.
import { h, icon, openSheet, toast } from "../dom.js";
import { app, subscribe, saveCard, setTranslation, ensureContexts } from "../store.js";
import { hitRow } from "./hits.js";
import { searchDictionary, prepareSearch, cleanQuery, langOf, ownWord, ownEntry } from "../dictsearch.js";

const PAGE = 20; // сколько результатов показывать сразу
const DELAY = 90; // пауза после ввода, мс: поиск идёт, когда человек остановился

export function openAddWord() {
  let q = "";
  let mode = app.dict.state === "error" ? "own" : "find"; // find — поиск, own — своё слово
  let shown = PAGE;
  let openId = null; // запись, у которой раскрыты определение и пример
  let added = 0;
  let timer = 0;
  const busy = new Set();

  const title = h("h2", { class: "set-title" }, "Добавить слово");
  const input = h("input", {
    class: "aw-input",
    type: "text",
    inputmode: "search",
    enterkeyhint: "search",
    placeholder: "Английское или русское слово",
    "aria-label": "Слово по-английски или по-русски",
    autocomplete: "off",
    autocapitalize: "off",
    autocorrect: "off",
    spellcheck: "false",
  });
  const clear = h("button", { class: "aw-clear", "aria-label": "Очистить", hidden: true, onClick: () => reset(true) }, icon("close", 18));
  const search = h("div", { class: "search" }, icon("search", 20), input, clear);
  const top = h("div", { class: "aw-top" }, title, search);
  const body = h("div", { class: "aw-body" });
  const root = h("div", { class: "aw" }, top, body);

  input.addEventListener("input", () => {
    q = input.value;
    clear.hidden = !q;
    shown = PAGE;
    openId = null;
    clearTimeout(timer);
    timer = setTimeout(paint, DELAY);
  });
  // Enter убирает клавиатуру, чтобы увидеть все результаты
  input.addEventListener("keydown", (e) => {
    if (e.key !== "Enter") return;
    e.preventDefault();
    input.blur();
  });

  const sheet = openSheet({
    content: root,
    cls: "addword",
    label: "Добавить слово",
    onClose: () => {
      off();
      clearTimeout(timer);
      if (added) ensureContexts(); // у новых слов могут найтись предложения в загруженных книгах
    },
  });
  // прокрутка списка убирает клавиатуру, нажатие на «+» её не трогает: можно добавлять слова подряд
  sheet.body.addEventListener(
    "touchmove",
    () => {
      if (document.activeElement === input) input.blur();
    },
    { passive: true },
  );

  // словарь мог ещё грузиться: когда он готов (или не загрузился), окно перерисовывается
  let seenDict = app.dict.state;
  const off = subscribe(() => {
    if (!sheet.el.isConnected) return off();
    if (app.dict.state === seenDict) return;
    seenDict = app.dict.state;
    if (seenDict === "error") mode = "own";
    else if (seenDict === "ready") prepareSearch(app.glossary);
    paint();
  });

  function reset(focus) {
    q = "";
    input.value = "";
    clear.hidden = true;
    shown = PAGE;
    openId = null;
    paint();
    if (focus) input.focus();
  }

  // ── Результаты ──────────────────────────────────────────────────────────
  function hit(item) {
    const e = item.entry;
    const open = openId === e.id;
    return hitRow(
      { entry: e, note: item.kind === "form" && item.via ? `${item.via} — форма слова ${e.w}` : "" },
      {
        saved: app.cards.has(e.id),
        open,
        onToggle: () => {
          openId = open ? null : e.id;
          paint();
        },
        onAdd: () => addEntry(e),
      },
    );
  }

  async function addEntry(e) {
    if (app.cards.has(e.id) || busy.has(e.id)) return;
    busy.add(e.id);
    try {
      await saveCard(e);
      added++;
      toast(`«${e.w}» добавлено в словарь`);
    } finally {
      busy.delete(e.id);
    }
    paint();
  }

  /** Список результатов; слова, найденные только с поправкой на опечатку, идут под своим заголовком. */
  function list(items) {
    const out = [];
    let rows = [];
    const flush = () => {
      if (rows.length) out.push(h("ul", { class: "hits" }, rows));
      rows = [];
    };
    let near = false;
    for (const item of items) {
      if (item.kind === "near" && !near) {
        near = true;
        flush();
        out.push(h("p", { class: "sheet-sub" }, "Возможно, вы искали"));
      }
      rows.push(hit(item));
    }
    flush();
    return out;
  }

  // ── Своё слово ──────────────────────────────────────────────────────────
  function ownForm({ back = false, focus = false } = {}) {
    const lang = langOf(q);
    const core = cleanQuery(q).core;
    const en = h("input", { class: "field en", type: "text", placeholder: "Слово по-английски", "aria-label": "Слово по-английски", autocomplete: "off", autocapitalize: "off", autocorrect: "off", spellcheck: "false", enterkeyhint: "next" });
    const ru = h("input", { class: "field", type: "text", placeholder: "Перевод", "aria-label": "Перевод", autocomplete: "off", autocapitalize: "off", enterkeyhint: "done" });
    en.value = lang === "en" && !core.includes(" ") ? core : "";
    ru.value = lang === "ru" ? core : "";
    const err = h("p", { class: "note err" });
    const add = h("button", { class: "btn primary grow", disabled: true, onClick: save }, icon("plus", 20), "В словарь");
    const check = () => {
      const word = en.value.trim();
      err.textContent = word && !ownWord(word) ? "Нужно одно слово из английских букв. Фразы и идиомы можно добавить из словаря." : "";
      add.disabled = !(ownWord(word) && ru.value.trim());
    };
    en.addEventListener("input", check);
    ru.addEventListener("input", check);
    en.addEventListener("keydown", (e) => e.key === "Enter" && (e.preventDefault(), ru.focus()));
    ru.addEventListener("keydown", (e) => e.key === "Enter" && !add.disabled && (e.preventDefault(), save()));
    async function save() {
      const entry = ownEntry(en.value, ru.value);
      if (!entry) return;
      if (app.cards.has(entry.id)) {
        err.textContent = `«${entry.w}» уже есть в вашем словаре.`;
        return;
      }
      add.disabled = true;
      const known = app.glossary.byId.get(entry.id);
      if (known) {
        // слово есть в словаре приложения: берём его запись, а перевод оставляем ваш
        await saveCard(known);
        await setTranslation(entry.id, entry.ru);
      } else {
        await saveCard(entry);
      }
      added++;
      toast(`«${entry.w}» добавлено в словарь`);
      mode = "find";
      reset(true);
    }
    if (focus) setTimeout(() => (en.value ? ru : en).focus(), 80);
    check();
    return h(
      "section",
      { class: "aw-own" },
      h("p", { class: "note" }, "Впишите слово и его перевод. Оно сохранится в вашем словаре как есть."),
      h("div", { class: "aw-fields" }, en, ru),
      err,
      h("div", { class: "slip-actions" }, add),
      back && h("button", { class: "linkbtn", onClick: () => ((mode = "find"), paint()) }, "К поиску"),
    );
  }

  // ── Экран ───────────────────────────────────────────────────────────────
  function paint() {
    const own = mode === "own";
    top.hidden = own;
    if (own) {
      body.replaceChildren(h("h2", { class: "set-title" }, "Своё слово"), ...(app.dict.state === "error" ? [h("p", { class: "note err" }, "Словарь приложения не загрузился, поэтому поиск не работает. Слово можно добавить со своим переводом.")] : []), ownForm({ back: app.dict.state !== "error", focus: true }));
      return;
    }
    const text = q.trim();
    if (app.dict.state === "loading") {
      body.replaceChildren(h("p", { class: "note" }, "Словарь загружается, это займёт несколько секунд."));
      return;
    }
    if (!text) {
      const n = app.dict.entries;
      body.replaceChildren(h("p", { class: "note" }, `Введите слово, которое услышали или прочитали: по-английски или по-русски. Поиск идёт по словарю приложения${n ? ` (${n.toLocaleString("ru")} слов и фраз)` : ""}, интернет не нужен.`));
      return;
    }
    const res = searchDictionary(app.glossary, text);
    if (!res.lang) {
      body.replaceChildren(h("p", { class: "note" }, "Введите слово буквами: английскими или русскими."));
      return;
    }
    if (!res.items.length) {
      body.replaceChildren(h("p", { class: "note" }, res.lang === "ru" ? `Для «${res.query}» ничего не нашлось.` : `Слова «${res.query}» нет в словаре приложения.`), ownForm());
      return;
    }
    const items = res.items.slice(0, shown);
    const more = res.items.length > shown ? h("button", { class: "linkbtn", onClick: () => ((shown += PAGE), paint()) }, "Показать ещё") : null;
    body.replaceChildren(...list(items), ...(more ? [more] : []), h("div", { class: "aw-foot" }, h("button", { class: "linkbtn", onClick: () => ((mode = "own"), paint()) }, "Нет нужного слова? Добавить своё")));
  }

  paint();
  if (app.dict.state === "ready") prepareSearch(app.glossary);
  // Клавиатура: сразу в нажатии, где её разрешают (iPhone), и запасной вариант после появления окна
  if (mode === "find") {
    input.focus({ preventScroll: true });
    setTimeout(() => document.activeElement !== input && input.focus({ preventScroll: true }), 320);
  }
  return sheet;
}
