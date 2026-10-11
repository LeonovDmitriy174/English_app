// settings.js — настройки: тема, размер текста, подсветка, озвучка, резервная копия.
import { h, openSheet, toast } from "../dom.js";
import { app, setSetting, exportData, importData, APP_NAME } from "../store.js";
import { isPersisted } from "../db.js";

const THEMES = [
  ["auto", "Как в системе"],
  ["light", "Светлая"],
  ["dark", "Тёмная"],
];

function row(title, hint, control) {
  return h("div", { class: "set-row" }, h("div", null, h("div", null, title), hint && h("span", { class: "hint" }, hint)), control);
}

function segment(key, items) {
  const wrap = h("div", { class: "seg", role: "group" });
  const paint = () => [...wrap.children].forEach((b) => b.setAttribute("aria-pressed", String(b.dataset.v === String(app.settings[key]))));
  for (const [v, label] of items) {
    wrap.append(
      h("button", {
        dataset: { v },
        onClick: async () => {
          await setSetting(key, v);
          paint();
        },
      }, label),
    );
  }
  paint();
  return wrap;
}

function toggle(key, label) {
  const sw = h("button", { class: "switch", role: "switch", "aria-label": label, "aria-checked": String(!!app.settings[key]) });
  sw.addEventListener("click", async () => {
    await setSetting(key, !app.settings[key]);
    sw.setAttribute("aria-checked", String(!!app.settings[key]));
  });
  return sw;
}

function stepper(key, { min, max, step, unit = "", label }) {
  const out = h("output", null, `${app.settings[key]}${unit}`);
  const set = async (d) => {
    const v = Math.min(max, Math.max(min, app.settings[key] + d));
    await setSetting(key, v);
    out.textContent = `${v}${unit}`;
  };
  return h(
    "div",
    { class: "stepper", role: "group", "aria-label": label },
    h("button", { "aria-label": "Меньше", onClick: () => set(-step) }, "−"),
    out,
    h("button", { "aria-label": "Больше", onClick: () => set(step) }, "+"),
  );
}

function common() {
  return [
    row("Тема", null, segment("theme", THEMES)),
    row("Размер текста", null, stepper("fontSize", { min: 15, max: 28, step: 1, unit: " px", label: "Размер текста" })),
    row("Подчёркивать фразы", "Пунктиром отмечаются фразовые глаголы и идиомы", toggle("hilite", "Подчёркивать фразы")),
    row("Озвучивать при нажатии", "Слово произносится сразу, как только вы на него нажали", toggle("speakOnTap", "Озвучивать при нажатии")),
  ];
}

export function openReaderSettings() {
  return openSheet({ label: "Настройки чтения", content: h("div", null, h("h2", { class: "set-title" }, "Чтение"), ...common()) });
}

export function openAppSettings() {
  const persisted = h("span", { class: "hint" }, "проверяю…");
  isPersisted().then((p) => (persisted.textContent = p ? "Браузер не будет удалять данные сам" : "Браузер может удалить данные при нехватке места: делайте копии"));

  const fileInput = h("input", { type: "file", accept: "application/json,.json", class: "visually-hidden", "aria-label": "Файл резервной копии" });
  fileInput.addEventListener("change", async () => {
    const f = fileInput.files[0];
    fileInput.value = "";
    if (!f) return;
    try {
      const { cards, notes } = await importData(await f.text());
      const parts = [cards && `карточек: ${cards}`, notes && `заметок: ${notes}`].filter(Boolean);
      toast(parts.length ? `Загружено ${parts.join(", ")}` : "Новых данных в копии нет");
    } catch (err) {
      toast(err.message || "Не удалось прочитать файл");
    }
  });

  const save = async () => {
    const blob = new Blob([await exportData()], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = h("a", { href: url, download: `ember-backup-${new Date().toLocaleDateString("sv")}.json` });
    document.body.append(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 8000);
  };

  return openSheet({
    label: "Настройки",
    content: h(
      "div",
      null,
      h("h2", { class: "set-title" }, "Настройки"),
      ...common(),
      row("Новых слов в день", "Сколько новых карточек добавлять в повторение", stepper("newPerDay", { min: 5, max: 60, step: 5, label: "Новых слов в день" })),
      h("div", { class: "set-actions" }, h("button", { class: "btn quiet block", onClick: save }, "Сохранить копию данных"), h("button", { class: "btn quiet block", onClick: () => fileInput.click() }, "Загрузить копию данных"), fileInput),
      h("p", { class: "note" }, `${APP_NAME} хранит книги и словарь только на этом устройстве. `, persisted),
      // Большой словарь собран из Викисловаря (tools/build_dict.py --wiktionary); маленький демо-словарь написан вручную
      app.glossary.list.length > 1500 && h("p", { class: "note" }, "Переводы, определения и примеры в словаре взяты из английского Викисловаря (wiktionary.org) через проект wiktextract; лицензия CC BY-SA 4.0."),
    ),
  });
}
